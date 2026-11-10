"""Guarded preview/apply tests. Native write tests require disposable PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier
from types import SimpleNamespace
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from app.models.client import Client
from app.models.correction_operation import CorrectionOperation, EntityRevision
from app.models.paiement import Paiement
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand
from app.services.correction_commands import apply_correction, preview_correction


@pytest.fixture
def sale(db_session, test_user):
    client = Client(nom_client="Client test de correction", est_actif=True)
    product = Produit(
        nom_produit="Service de correction", type_produit="service",
        pour_clients=True, pour_fournisseurs=False, est_actif=True,
    )
    db_session.add_all([client, product])
    db_session.flush()
    transaction = Transaction(
        date_transaction=date.today(), date_echeance=date.today() + timedelta(days=7),
        id_client=client.id_client, id_produit=product.id_produit,
        quantite=4, prix_unitaire=Decimal("12.50"), montant_total=Decimal("50.00"),
        est_actif=True, id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(transaction)
    db_session.commit()
    db_session.refresh(transaction)
    return transaction


def command_for(sale, **changes):
    return CorrectionCommand(
        operation_id=uuid4(), reason="Correction validée",
        target={"entity_type": "transaction", "entity_id": sale.id_transaction,
                "expected_version": sale.row_version},
        changes=changes,
    )


def prepared(db_session, command):
    preview = preview_correction(db_session, command)
    return CorrectionApplyCommand(
        **command.model_dump(exclude_unset=True),
        dependency_fingerprint=preview["dependency_fingerprint"],
    )


def test_preview_is_read_only_and_shows_exact_financial_impact(db_session, sale):
    cmd = command_for(sale, prix_unitaire=Decimal("13.33"),
                      date_echeance=date.today() + timedelta(days=15))
    preview = preview_correction(db_session, cmd)
    assert preview["before"]["montant_total"] == "50.00"
    assert preview["after"]["montant_total"] == "53.32"
    assert preview["impact"]["balance"]["remaining"] == "53.32"
    assert preview["impact"]["cash"] == "unchanged"
    assert preview["impact"]["stock"] == "unchanged"
    assert db_session.query(CorrectionOperation).count() == 0
    db_session.refresh(sale)
    assert sale.montant_total == Decimal("50.00")


@pytest.mark.parametrize("changes", [
    {"date_paiement": date.today()},
    {"montant": Decimal("5.00")},
    {"type_paiement": "cash"},
    {"source_reglement": "banque"},
    {"statut_cheque": "rejete"},
])
def test_payment_only_fields_cannot_be_applied_to_transactions(db_session, sale, changes):
    with pytest.raises(HTTPException) as exc:
        preview_correction(db_session, command_for(sale, **changes))
    assert exc.value.status_code == 422


def test_due_date_cannot_precede_transaction(db_session, sale):
    with pytest.raises(HTTPException) as exc:
        preview_correction(db_session, command_for(sale, date_echeance=date.today() - timedelta(days=1)))
    assert exc.value.status_code == 422


def test_stale_revision_is_rejected_before_preview(db_session, sale):
    cmd = command_for(sale, date_echeance=None)
    cmd.target.expected_version = 999
    with pytest.raises(HTTPException) as exc:
        preview_correction(db_session, cmd)
    assert exc.value.status_code == 409


def _postgres_only(db_session):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Native immutable-revision tests require disposable PostgreSQL")


def test_native_apply_is_atomic_idempotent_and_revisioned(db_session, sale, test_user, client, monkeypatch):
    _postgres_only(db_session)
    cmd = prepared(db_session, command_for(sale, prix_unitaire=Decimal("14.25")))
    result = apply_correction(db_session, cmd, test_user)
    db_session.refresh(sale)
    assert sale.prix_unitaire == Decimal("14.25")
    assert sale.montant_total == Decimal("57.00")
    assert sale.row_version == 2
    assert result["record"]["row_version"] == 2
    assert db_session.query(CorrectionOperation).count() == 1
    revisions = db_session.query(EntityRevision).filter(
        EntityRevision.entity_type == "transaction",
        EntityRevision.entity_id == sale.id_transaction,
    ).order_by(EntityRevision.revision).all()
    assert [r.revision for r in revisions] == [1, 2]
    assert revisions[1].operation_id == cmd.operation_id
    assert Decimal(str(revisions[1].before_snapshot["montant_total"])) == Decimal("50.00")
    assert apply_correction(db_session, cmd, test_user)["replayed"] is True
    assert db_session.query(CorrectionOperation).count() == 1

    with pytest.raises(HTTPException) as exc:
        apply_correction(db_session, cmd.model_copy(update={"reason": "Autre demande"}), test_user)
    assert exc.value.status_code == 409
    stale = CorrectionCommand(
        operation_id=uuid4(), reason="Ancienne version",
        target={"entity_type": "transaction", "entity_id": sale.id_transaction, "expected_version": 1},
        changes={"prix_unitaire": Decimal("15.00")},
    )
    with pytest.raises(HTTPException) as exc:
        preview_correction(db_session, stale)
    assert exc.value.status_code == 409


    # A new payment makes a previously valid price preview stale. It must
    # invalidate the correction without changing the sale or audit operation.
    to_change = prepared(db_session, command_for(sale, prix_unitaire=Decimal("16.00")))
    payment = Paiement(
        id_transaction=sale.id_transaction, date_paiement=sale.date_transaction,
        montant=Decimal("5.00"), type_paiement="cash", statut="valide",
        notes="Avant", id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(payment)
    db_session.commit()
    with pytest.raises(HTTPException) as exc:
        apply_correction(db_session, to_change, test_user)
    assert exc.value.status_code == 409
    db_session.refresh(sale)
    assert sale.montant_total == Decimal("57.00")
    assert db_session.query(CorrectionOperation).count() == 1

    # Payment notes are safe even when the payment is effective. They must
    # generate their own linked immutable revision, not a new cash movement.
    db_session.refresh(payment)
    note_cmd = CorrectionCommand(
        operation_id=uuid4(), reason="Correction de référence",
        target={"entity_type": "paiement", "entity_id": payment.id_paiement,
                "expected_version": payment.row_version},
        changes={"notes": "Après"},
    )
    note_apply = prepared(db_session, note_cmd)
    note_result = apply_correction(db_session, note_apply, test_user)
    db_session.refresh(payment)
    assert payment.notes == "Après"
    assert payment.row_version == 2
    assert note_result["record"]["notes"] == "Après"
    assert note_result["impact"]["cash"] == "unchanged"
    assert note_result["impact"]["bank"] == "unchanged"
    assert db_session.query(CorrectionOperation).count() == 2
    payment_revisions = db_session.query(EntityRevision).filter(
        EntityRevision.entity_type == "paiement",
        EntityRevision.entity_id == payment.id_paiement,
    ).order_by(EntityRevision.revision).all()
    assert [r.revision for r in payment_revisions] == [1, 2]
    assert payment_revisions[1].operation_id == note_cmd.operation_id
    assert apply_correction(db_session, note_apply, test_user)["replayed"] is True

    # Exercise the actual FastAPI route contract on the same disposable PG
    # service, with explicit test-only authentication dependency override.
    from app.config import settings
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    monkeypatch.setattr(settings, "ENABLE_CORRECTION_WRITES", True)
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    try:
        api_command = command_for(sale, date_echeance=date.today() + timedelta(days=30))
        preview_response = client.post(
            "/api/v1/corrections/preview", json=api_command.model_dump(mode="json", exclude_unset=True)
        )
        assert preview_response.status_code == 200, preview_response.text
        apply_payload = {
            **api_command.model_dump(mode="json", exclude_unset=True),
            "dependency_fingerprint": preview_response.json()["dependency_fingerprint"],
        }
        apply_response = client.post("/api/v1/corrections/apply", json=apply_payload)
        assert apply_response.status_code == 200, apply_response.text
        assert apply_response.json()["record"]["row_version"] == 3
        history_response = client.get(
            "/api/v1/corrections/history", params={"transaction_id": sale.id_transaction}
        )
        assert history_response.status_code == 200, history_response.text
        assert len(history_response.json()["items"]) == 3
        assert client.post("/api/v1/corrections/apply", json=apply_payload).json()["replayed"] is True
    finally:
        app.dependency_overrides.pop(get_current_active_user, None)

    # Two concurrent corrections prepared at the same revision cannot both
    # commit. The losing operation must not create any history or partial write.
    from sqlalchemy.orm import Session
    db_session.refresh(sale)
    before_version = sale.row_version
    first = prepared(db_session, command_for(sale, date_echeance=date.today() + timedelta(days=40)))
    second = prepared(db_session, command_for(sale, date_echeance=date.today() + timedelta(days=45)))
    ready = Barrier(2)
    actor = SimpleNamespace(id_utilisateur=test_user.id_utilisateur)

    def concurrent_apply(command):
        with Session(bind=db_session.get_bind()) as session:
            ready.wait(timeout=15)
            try:
                return apply_correction(session, command, actor)
            except HTTPException as conflict:
                session.rollback()
                return conflict.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(concurrent_apply, (first, second)))
    assert sum(isinstance(item, dict) for item in outcomes) == 1
    assert outcomes.count(409) == 1
    db_session.expire_all()
    assert db_session.get(Transaction, sale.id_transaction).row_version == before_version + 1
    assert db_session.query(CorrectionOperation).count() == 4
    assert db_session.query(EntityRevision).filter(
        EntityRevision.entity_type == "transaction",
        EntityRevision.entity_id == sale.id_transaction,
    ).count() == before_version + 1
