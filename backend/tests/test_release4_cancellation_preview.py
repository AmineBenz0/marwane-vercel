"""Phase 7 exact quote/commit agreement, authorization gate and no side effects."""
from decimal import Decimal
from uuid import uuid4

from app.config import settings
from app.main import app
from app.models.audit import TransactionAudit
from app.models.correction_operation import CorrectionOperation
from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
from app.models.paiement import Paiement
from app.utils.dependencies import get_current_active_user
from app.routers.transactions import create_transaction
from tests.test_deferred_sale_completion import deferred_sale


def _override(actor):
    app.dependency_overrides[get_current_active_user] = lambda: actor


def test_preview_gate_is_disabled_and_never_looks_up_unmigrated_ledger(
    client, db_session, deferred_sale, test_user,
):
    _override(test_user)
    _, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, test_user)
    response = client.get(f"/api/v1/transactions/{tx.id_transaction}/cancel-remainder/preview")
    assert response.status_code == 409
    assert "validation" in response.json()["detail"].lower()
    db_session.refresh(tx)
    assert tx.quantite_annulee == 0
    assert tx.quantite_en_attente == 400


def test_exact_quote_before_commit_and_immutable_stock_cash_and_history(
    client, db_session, deferred_sale, test_user, monkeypatch,
):
    _override(test_user)
    monkeypatch.setattr(settings, "ENABLE_DEFERRED_CANCELLATION_WRITES", True)
    _, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, test_user)
    db_session.add(Paiement(
        id_transaction=tx.id_transaction,
        montant=Decimal("1500.00"), type_paiement="cash",
        date_paiement=tx.date_transaction, statut="valide",
    ))
    db_session.commit()
    db_session.expire_all()
    tx = db_session.get(type(tx), tx.id_transaction)
    before = (
        tx.quantite_annulee, tx.quantite_en_attente, tx.montant_total,
        db_session.query(Paiement).filter_by(id_transaction=tx.id_transaction).count(),
        db_session.query(DeferredSaleAdjustment).count(),
        db_session.query(CorrectionOperation).count(),
        db_session.query(TransactionAudit).filter_by(
            id_transaction=tx.id_transaction, champ_modifie="annulation_reste_livraison_differee",
        ).count(),
    )
    endpoint = f"/api/v1/transactions/{tx.id_transaction}/cancel-remainder"
    preview = client.get(endpoint + "/preview")
    assert preview.status_code == 200, preview.text
    quote = preview.json()
    assert quote["expected_version"] == tx.row_version
    assert quote["quantite_en_attente_attendue"] == 400
    assert quote["quantite_couverte"] == 600
    assert quote["quantite_annulee"] == 400
    assert Decimal(str(quote["montant_initial"])) == Decimal("1500.00")
    assert Decimal(str(quote["montant_avoir"])) == Decimal("600.00")
    assert Decimal(str(quote["montant_net"])) == Decimal("900.00")
    assert Decimal(str(quote["montant_paye"])) == Decimal("1500.00")
    assert Decimal(str(quote["credit_client"])) == Decimal("600.00")
    db_session.expire_all()
    tx = db_session.get(type(tx), tx.id_transaction)
    assert before == (
        tx.quantite_annulee, tx.quantite_en_attente, tx.montant_total,
        db_session.query(Paiement).filter_by(id_transaction=tx.id_transaction).count(),
        db_session.query(DeferredSaleAdjustment).count(),
        db_session.query(CorrectionOperation).count(),
        db_session.query(TransactionAudit).filter_by(
            id_transaction=tx.id_transaction, champ_modifie="annulation_reste_livraison_differee",
        ).count(),
    )

    operation_id = str(uuid4())
    command = {
        "operation_id": operation_id,
        "expected_version": quote["expected_version"],
        "quantite_en_attente_attendue": quote["quantite_en_attente_attendue"],
        "montant_paye_attendu": quote["montant_paye"],
        "date_effet_attendue": quote["date_effet"],
    }
    posted = client.post(endpoint, json=command)
    assert posted.status_code == 200, posted.text
    receipt = posted.json()
    for field in ("quantite_annulee", "quantite_annulee_cumulee", "montant_initial",
                  "montant_avoir", "montant_net", "montant_paye", "montant_restant",
                  "credit_client", "date_effet"):
        assert str(receipt[field]) == str(quote[field])
    assert db_session.query(DeferredSaleAdjustment).count() == 1
    assert db_session.query(Paiement).filter_by(id_transaction=tx.id_transaction).count() == 1
    history = client.get(f"/api/v1/transactions/{tx.id_transaction}/completion-history")
    assert history.status_code == 200
    event = history.json()[-1]
    assert event["type"] == "cancel_remainder"
    assert Decimal(str(event["montant_avoir"])) == Decimal("600.00")

    replay = client.post(endpoint, json=command)
    assert replay.status_code == 200
    assert replay.json()["rejoue"] is True
    assert replay.json()["id_avoir"] == operation_id
    assert db_session.query(DeferredSaleAdjustment).count() == 1
    stale_preview = client.get(endpoint + "/preview")
    assert stale_preview.status_code == 409


def test_readonly_quote_rejects_reserved_undelivered_eggs_and_regular_sale(
    client, db_session, deferred_sale, test_user, monkeypatch,
):
    _override(test_user)
    monkeypatch.setattr(settings, "ENABLE_DEFERRED_CANCELLATION_WRITES", True)
    _, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, test_user)
    tx.allocations[0].quantite_livree = 0
    db_session.commit()
    result = client.get(f"/api/v1/transactions/{tx.id_transaction}/cancel-remainder/preview")
    assert result.status_code == 409
    assert "réservés" in result.json()["detail"]
    assert tx.quantite_annulee == 0
    tx.est_promesse = False
    db_session.commit()
    assert client.get(
        f"/api/v1/transactions/{tx.id_transaction}/cancel-remainder/preview",
    ).status_code == 409
    assert client.get("/api/v1/transactions/999999/cancel-remainder/preview").status_code == 404
