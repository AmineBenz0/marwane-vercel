from datetime import date, timedelta
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from app.models.correction_operation import CorrectionOperation
from app.models.caisse import Caisse
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.financial_correction import CorrectionFinanciere
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand, CorrectionEnvelope, CorrectionTarget
from app.services.correction_commands import apply_correction, preview_correction


def prepared(db, command):
    preview = preview_correction(db, command)
    return CorrectionApplyCommand(
        **command.model_dump(exclude_unset=True),
        dependency_fingerprint=preview["dependency_fingerprint"],
    )


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


@pytest.fixture
def correction_sale(db_session, test_user):
    client = Client(nom_client="Client correction")
    product = Produit(nom_produit="Produit vendu correction", pour_clients=True,
                      pour_fournisseurs=False, type_produit="produit_fini")
    db_session.add_all([client, product])
    db_session.flush()
    sale = Transaction(
        date_transaction=date.today(), id_client=client.id_client,
        id_produit=product.id_produit, quantite=10,
        prix_unitaire=Decimal("1.50"), montant_total=Decimal("15.00"),
        est_actif=True, id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(sale)
    db_session.flush()
    payment = Paiement(
        id_transaction=sale.id_transaction, date_paiement=date.today(),
        montant=Decimal("5.00"), type_paiement="cash", statut="valide",
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(payment)
    db_session.commit()
    return sale, payment
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

    command = prepared(db_session, command)
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
    command = prepared(db_session, command)
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


def test_matching_retry_after_lock_wait_replays_before_stale_conflict(db_session, correction_transaction, test_user, monkeypatch):
    from fastapi import HTTPException
    from sqlalchemy import update
    import app.services.correction_commands as commands

    db_session.execute(
        update(Transaction).where(Transaction.id_transaction == correction_transaction.id_transaction)
        .values(row_version=2), execution_options={"synchronize_session": False},
    )
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Rejeu après attente du verrou",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance + timedelta(days=1)},
    )
    committed_result = {
        "operation_id": str(command.operation_id),
        "target": command.target.model_dump(mode="json"),
        "record": {"row_version": 2},
        "impact": {"cash":"unchanged"},
    }
    calls = {"count": 0}
    def replay_after_stale(*args):
        calls["count"] += 1
        return None if calls["count"] == 1 else committed_result
    monkeypatch.setattr(commands, "replay_result", replay_after_stale)

    command = CorrectionApplyCommand(**command.model_dump(exclude_unset=True), dependency_fingerprint="0"*64)
    response = apply_correction(db_session, command, test_user)
    assert response["replayed"] is True
    assert response["record"]["row_version"] == 2


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
    command = prepared(db_session, command)
    def fail_commit():
        raise RuntimeError("simulated commit failure")
    monkeypatch.setattr(db_session, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="simulated commit failure"):
        apply_correction(db_session, command, test_user)
    db_session.rollback()
    db_session.expire_all()
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.get(Transaction, correction_transaction.id_transaction).date_echeance == command.changes.date_echeance - timedelta(days=1)


def test_paid_sale_price_correction_recalculates_total_without_changing_payment(db_session, correction_sale, test_user):
    from sqlalchemy import text
    sale, payment = correction_sale
    db_session.execute(text("""
        CREATE TRIGGER test_transaction_revision AFTER UPDATE OF prix_unitaire, montant_total ON transactions
        BEGIN UPDATE transactions SET row_version=OLD.row_version+1
        WHERE id_transaction=OLD.id_transaction; END
    """))
    db_session.commit()
    original_payment = payment.montant
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Prix de vente mal saisi",
        target={"entity_type":"transaction","entity_id":sale.id_transaction,"expected_version":1},
        changes={"prix_unitaire":"2.25"},
    )
    preview = preview_correction(db_session, command)
    assert preview["after"]["montant_total"] == "22.50"
    assert preview["impact"]["receivable"] == "recalculated from the corrected sale total"
    command = prepared(db_session, command)
    applied = apply_correction(db_session, command, test_user)
    assert applied["record"]["prix_unitaire"] == "2.25"
    assert applied["record"]["montant_total"] == "22.50"
    db_session.refresh(payment)
    assert payment.montant == original_payment == Decimal("5.00")
    assert sale.montant_restant == Decimal("17.50")


def test_purchase_price_correction_waits_for_stock_cost_adapter(db_session, correction_transaction):
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Coût d’achat à corriger",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"prix_unitaire":"3.00"},
    )
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, command)
    assert error.value.status_code == 409
    assert "valorisation du stock" in error.value.detail


@pytest.mark.parametrize(
    ("entity_type", "changes"),
    [
        ("transaction", {"prix_unitaire": None}),
        ("paiement", {"date_paiement": None}),
        ("paiement", {"montant": None}),
    ],
)
def test_required_correction_values_reject_null(db_session, correction_sale, entity_type, changes):
    sale, payment = correction_sale
    entity = sale if entity_type == "transaction" else payment
    entity_id = entity.id_transaction if entity_type == "transaction" else entity.id_paiement
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Valeur obligatoire manquante",
        target={"entity_type": entity_type, "entity_id": entity_id, "expected_version": 1},
        changes=changes,
    )
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, command)
    assert error.value.status_code == 422


def test_cash_payment_date_and_amount_correction_replaces_ledger_once(db_session, correction_sale, test_user):
    from sqlalchemy import text
    sale, payment = correction_sale
    db_session.add(Caisse(
        montant=Decimal("5.00"), type_mouvement="ENTREE", statut="active",
        id_transaction=sale.id_transaction, id_paiement=payment.id_paiement,
        date_mouvement=datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc),
    ))
    db_session.execute(text("""
        CREATE TRIGGER test_payment_revision AFTER UPDATE OF date_paiement, montant ON paiements
        BEGIN UPDATE paiements SET row_version=OLD.row_version+1
        WHERE id_paiement=OLD.id_paiement; END
    """))
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Date et montant du paiement corrigés",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes={"date_paiement":date.today() + timedelta(days=1),"montant":"8.00"},
    )
    preview = preview_correction(db_session, command)
    assert preview["impact"]["cash"]["before"]["amount"] == "5.00"
    assert preview["impact"]["cash"]["after"]["amount"] == "8.00"
    command = prepared(db_session, command)
    result = apply_correction(db_session, command, test_user)
    assert result["record"]["row_version"] == 2
    assert result["record"]["montant"] == "8.00"
    assert result["record"]["date_paiement"] == command.changes.date_paiement.isoformat()
    movements = db_session.query(Caisse).filter(Caisse.id_paiement == payment.id_paiement).all()
    assert len(movements) == 2
    assert [m.statut for m in movements].count("active") == 1
    active = next(m for m in movements if m.statut == "active")
    assert active.montant == Decimal("8.00")
    assert active.date_mouvement.date() == command.changes.date_paiement
    assert db_session.query(CorrectionFinanciere).filter(
        CorrectionFinanciere.operation_id == command.operation_id,
    ).count() >= 1


@pytest.fixture
def cash_payment(db_session, correction_sale):
    sale, payment = correction_sale
    movement = Caisse(
        montant=payment.montant, type_mouvement="ENTREE", statut="active",
        id_transaction=sale.id_transaction, id_paiement=payment.id_paiement,
        date_mouvement=datetime.combine(payment.date_paiement, datetime.min.time(), tzinfo=timezone.utc),
    )
    db_session.add(movement)
    db_session.commit()
    return sale, payment, movement


def revision_trigger(db, table, fields):
    from sqlalchemy import text
    key = "id_transaction" if table == "transactions" else "id_paiement"
    db.execute(text(f"""CREATE TRIGGER correction_test_revision AFTER UPDATE OF {fields} ON {table}
      BEGIN UPDATE {table} SET row_version=OLD.row_version+1 WHERE {key}=OLD.{key}; END"""))
    db.commit()


@pytest.mark.parametrize("changes", [{"montant": "8.00"}, {"date_paiement": date.today()+timedelta(days=1)}])
def test_single_field_payment_corrections_preserve_omitted_fields(db_session, cash_payment, test_user, changes):
    sale, payment, movement = cash_payment
    revision_trigger(db_session, "paiements", "montant,date_paiement")
    command = prepared(db_session, CorrectionCommand(
        operation_id=uuid4(), reason="Correction d’un seul champ",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes=changes,
    ))
    result = apply_correction(db_session, command, test_user)
    saved = db_session.get(CorrectionOperation, command.operation_id)
    assert set(saved.request_payload["changes"]) == set(changes)
    assert result["record"]["row_version"] == 2
    assert db_session.query(Caisse).filter(Caisse.statut == "active").one().montant == Decimal(changes.get("montant", "5.00"))
    retry = apply_correction(db_session, command, test_user)
    assert retry["record"] == result["record"]
    assert retry["impact"] == result["impact"]
    assert retry["replayed"] is True


@pytest.mark.parametrize("kind,changes", [("transaction", {"prix_unitaire":"1.5"}), ("paiement", {"montant":"5.0"})])
def test_equal_decimal_scale_is_a_noop(db_session, cash_payment, test_user, kind, changes):
    sale, payment, movement = cash_payment
    command = prepared(db_session, CorrectionCommand(
        operation_id=uuid4(), reason="Même valeur, présentation différente",
        target={"entity_type":kind,"entity_id":sale.id_transaction if kind == "transaction" else payment.id_paiement,"expected_version":1},
        changes=changes,
    ))
    result = apply_correction(db_session, command, test_user)
    assert result["no_op"] is True
    assert result["record"]["row_version"] == 1
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.query(Caisse).count() == 1
    assert db_session.query(CorrectionFinanciere).count() == 0


def test_replay_keeps_actual_timestamp_and_actor_even_after_later_edit(db_session, correction_sale, test_user):
    sale, _ = correction_sale
    sale.date_modification = datetime(2000,1,1,tzinfo=timezone.utc)
    db_session.commit()
    revision_trigger(db_session, "transactions", "date_echeance")
    command = prepared(db_session, CorrectionCommand(
        operation_id=uuid4(), reason="Historique fidèle",
        target={"entity_type":"transaction","entity_id":sale.id_transaction,"expected_version":1},
        changes={"date_echeance":date.today()+timedelta(days=1)},
    ))
    first = apply_correction(db_session, command, test_user)
    saved = db_session.get(CorrectionOperation, command.operation_id)
    assert saved.result_payload["record"] == first["record"]
    assert first["record"]["id_utilisateur_modification"] == test_user.id_utilisateur
    assert first["record"]["date_modification"].startswith("2000") is False
    sale.date_echeance = date.today()+timedelta(days=2)
    db_session.commit()
    retry = apply_correction(db_session, command, test_user)
    assert retry["record"] == first["record"]


@pytest.mark.parametrize("field,value", [
    ("montant", Decimal("999")), ("type_mouvement", "SORTIE"),
    ("date_mouvement", datetime(2000,1,1,tzinfo=timezone.utc)), ("id_transaction", None),
])
def test_inconsistent_cash_blocks_preview_and_apply(db_session, cash_payment, test_user, field, value):
    sale, payment, movement = cash_payment
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Ne pas réparer une incohérence indirectement",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes={"montant":"8.00"},
    )
    confirmed = prepared(db_session, command)
    setattr(movement, field, value)
    db_session.commit()
    for action, request in [(preview_correction, command), (lambda db, cmd: apply_correction(db,cmd,test_user), confirmed)]:
        with pytest.raises(HTTPException) as error:
            action(db_session, request)
        assert error.value.status_code == 409
    assert db_session.query(CorrectionOperation).count() == 0


@pytest.mark.parametrize("dependency", ["parent", "payment", "cash"])
def test_apply_rejects_dependency_changed_since_preview(db_session, cash_payment, test_user, dependency):
    sale, payment, movement = cash_payment
    command = prepared(db_session, CorrectionCommand(
        operation_id=uuid4(), reason="Aperçu périmé",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes={"notes":"Nouvelle note"},
    ))
    if dependency == "parent":
        sale.date_echeance = date.today()+timedelta(days=5)
    elif dependency == "payment":
        db_session.add(Paiement(id_transaction=sale.id_transaction,date_paiement=date.today(),montant=Decimal("1"),type_paiement="cash",statut="valide"))
    else:
        movement.motif_annulation = "Modification indirecte"
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session, command, test_user)
    assert error.value.status_code == 409
    assert db_session.query(CorrectionOperation).count() == 0
    assert payment.notes is None


def test_apply_contract_requires_preview_fingerprint():
    with pytest.raises(ValidationError):
        CorrectionApplyCommand(operation_id=uuid4(),reason="Aperçu obligatoire",target={"entity_type":"transaction","entity_id":1,"expected_version":1},changes={"date_echeance":None})


def test_payload_keeps_explicit_null_and_normalizes_money():
    from app.services.correction_contract import request_payload
    command = CorrectionCommand(operation_id=uuid4(),reason="Normaliser",target={"entity_type":"transaction","entity_id":1,"expected_version":1},changes={"date_echeance":None,"prix_unitaire":"1.5"})
    payload = request_payload(command)
    assert payload["changes"] == {"date_echeance":None,"prix_unitaire":"1.50"}
    same = command.model_copy(update={"changes":command.changes.model_copy(update={"prix_unitaire":Decimal("1.50")})})
    assert request_fingerprint(command) == request_fingerprint(same)


def test_cash_correction_rolls_back_all_writes_on_commit_failure(db_session, cash_payment, test_user, monkeypatch):
    sale, payment, movement = cash_payment
    revision_trigger(db_session, "paiements", "montant,date_paiement")
    command = prepared(db_session, CorrectionCommand(operation_id=uuid4(),reason="Échec atomique",target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},changes={"montant":"8.00"}))
    def fail_commit():
        raise RuntimeError("commit failure")
    monkeypatch.setattr(db_session,"commit",fail_commit)
    with pytest.raises(RuntimeError,match="commit failure"):
        apply_correction(db_session,command,test_user)
    db_session.rollback()
    db_session.expire_all()
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.query(CorrectionFinanciere).count() == 0
    assert db_session.query(Caisse).count() == 1
    assert db_session.get(Caisse,movement.id_mouvement).statut == "active"
    assert db_session.get(Paiement,payment.id_paiement).montant == Decimal("5.00")
    assert db_session.get(Paiement,payment.id_paiement).row_version == 1


def test_database_result_mismatch_rolls_back_the_operation(db_session, correction_sale, test_user):
    from sqlalchemy import text
    sale, _ = correction_sale
    revision_trigger(db_session, "transactions", "date_echeance")
    db_session.execute(text("""CREATE TRIGGER unexpected_db_change AFTER UPDATE OF date_echeance ON transactions
      BEGIN UPDATE transactions SET date_modification='2000-01-01 00:00:00' WHERE id_transaction=OLD.id_transaction; END"""))
    db_session.commit()
    command = prepared(db_session,CorrectionCommand(operation_id=uuid4(),reason="Résultat non conforme",target={"entity_type":"transaction","entity_id":sale.id_transaction,"expected_version":1},changes={"date_echeance":date.today()+timedelta(days=2)}))
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session,command,test_user)
    assert error.value.status_code == 409
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.get(Transaction,sale.id_transaction).date_echeance is None
    assert db_session.get(Transaction,sale.id_transaction).row_version == 1
