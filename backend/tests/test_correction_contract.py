from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from app.models.correction_operation import CorrectionOperation
from app.models.fournisseur import Fournisseur
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionCommand, CorrectionEnvelope, CorrectionTarget
from app.services.correction_commands import apply_correction, preview_correction


@pytest.fixture
def correction_transaction(db_session, test_user):
    supplier = Fournisseur(nom_fournisseur="Correction test", est_actif=True)
    product = Produit(nom_produit="Produit correction", pour_clients=False,
                      pour_fournisseurs=True, type_produit="matiere_premiere")
    db_session.add_all([supplier, product])
    db_session.flush()
    transaction = Transaction(
        date_transaction=date.today(), date_echeance=date.today() + timedelta(days=5),
        id_fournisseur=supplier.id_fournisseur, id_produit=product.id_produit,
        quantite=10, prix_unitaire=Decimal("2.50"), montant_total=Decimal("25.00"),
        est_actif=True, id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(transaction)
    db_session.commit()
    return transaction
from app.services.correction_contract import lock_expected_revision, replay_result, request_fingerprint


def test_validated_contract_rejects_blank_reason_and_invalid_version():
    with pytest.raises(ValidationError):
        CorrectionEnvelope(operation_id=uuid4(), reason="   ", target={"entity_type":"transaction", "entity_id":1,"expected_version":1})
    with pytest.raises(ValidationError):
        CorrectionTarget(entity_type="transaction", entity_id=1, expected_version=0)


def test_fingerprint_preserves_exact_decimal_and_dictionary_order():
    class Request(BaseModel):
        values: dict[str, Decimal]
    a = Request(values={"a":Decimal("9007199254740993.01"),"b":Decimal("2")})
    b = Request(values={"b":Decimal("2"),"a":Decimal("9007199254740993.01")})
    c = Request(values={"a":Decimal("9007199254740993.02"),"b":Decimal("2")})
    assert request_fingerprint(a) == request_fingerprint(b)
    assert request_fingerprint(a) != request_fingerprint(c)


def test_operation_replay_checks_actor_and_payload_without_writes(db_session, test_user):
    operation_id = uuid4()
    assert replay_result(db_session, operation_id, "a"*64, test_user.id_utilisateur) is None
    db_session.add(CorrectionOperation(operation_id=operation_id, request_hash="a"*64,
        id_utilisateur=test_user.id_utilisateur, reason="Correction", request_payload={}, result_payload={"saved":True}))
    db_session.commit()
    assert replay_result(db_session, operation_id,"a"*64,test_user.id_utilisateur)=={"saved":True}
    for fingerprint, actor in [("b"*64,test_user.id_utilisateur),("a"*64,test_user.id_utilisateur+1)]:
        with pytest.raises(HTTPException) as error:
            replay_result(db_session, operation_id, fingerprint, actor)
        assert error.value.status_code == 409
    assert not db_session.dirty and not db_session.new


def test_missing_target_is_404(db_session):
    with pytest.raises(HTTPException) as error:
        lock_expected_revision(db_session, CorrectionTarget(entity_type="paiement",entity_id=999,expected_version=1))
    assert error.value.status_code == 404


def test_preview_and_apply_create_one_atomic_versioned_operation(db_session, correction_transaction, test_user):
    from sqlalchemy import text
    # SQLite does not install the PostgreSQL foundation triggers, so mirror the
    # DB-managed revision increment needed by this command-service integration test.
    db_session.execute(text("""
        CREATE TRIGGER test_transaction_revision AFTER UPDATE OF date_echeance ON transactions
        BEGIN UPDATE transactions SET row_version=OLD.row_version+1
        WHERE id_transaction=OLD.id_transaction; END
    """))
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Date d’échéance mal saisie",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance + timedelta(days=1)},
    )
    before_count = db_session.query(CorrectionOperation).count()
    preview = preview_correction(db_session, command)
    assert preview["before"]["row_version"] == 1
    assert preview["after"]["row_version"] == 1
    assert preview["impact"]["cash"] == "unchanged"
    assert db_session.query(CorrectionOperation).count() == before_count

    applied = apply_correction(db_session, command, test_user)
    assert applied["record"]["row_version"] == 2
    assert db_session.query(CorrectionOperation).count() == before_count + 1
    saved = db_session.query(CorrectionOperation).one()
    assert saved.result_payload["record"]["row_version"] == 2
    replayed = apply_correction(db_session, command, test_user)
    assert replayed["replayed"] is True
    assert db_session.query(CorrectionOperation).count() == before_count + 1


def test_correction_noop_does_not_create_operation(db_session, correction_transaction, test_user):
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Vérification",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance},
    )
    result = apply_correction(db_session, command, test_user)
    assert result["no_op"] is True
    assert db_session.query(CorrectionOperation).count() == 0


def test_correction_rejects_stale_expected_version(db_session, correction_transaction, test_user):
    from fastapi import HTTPException
    from sqlalchemy import update
    db_session.execute(
        update(Transaction).where(Transaction.id_transaction == correction_transaction.id_transaction)
        .values(row_version=2), execution_options={"synchronize_session": False},
    )
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Date d’échéance corrigée",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance},
    )
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session, command, test_user)
    assert error.value.status_code == 409


def test_failed_commit_rolls_back_operation_and_record(db_session, correction_transaction, test_user, monkeypatch):
    from sqlalchemy import text
    db_session.execute(text("""
        CREATE TRIGGER test_transaction_revision AFTER UPDATE OF date_echeance ON transactions
        BEGIN UPDATE transactions SET row_version=OLD.row_version+1
        WHERE id_transaction=OLD.id_transaction; END
    """))
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Correction à annuler",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance + timedelta(days=1)},
    )
    def fail_commit():
        raise RuntimeError("simulated commit failure")
    monkeypatch.setattr(db_session, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="simulated commit failure"):
        apply_correction(db_session, command, test_user)
    db_session.rollback()
    db_session.expire_all()
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.get(Transaction, correction_transaction.id_transaction).date_echeance == command.changes.date_echeance - timedelta(days=1)
