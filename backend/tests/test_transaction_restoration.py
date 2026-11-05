"""Phase 6E-A: preview/confirmation/financial immutability on SQLite and PostgreSQL."""
from datetime import date
from decimal import Decimal

import pytest
from app.models.client import Client
from app.main import app
from app.models.caisse import Caisse
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.utils.dependencies import get_current_active_user


@pytest.fixture
def test_client(db_session):
    contact = Client(nom_client="Client réactivation test", est_actif=True)
    db_session.add(contact)
    db_session.commit()
    db_session.refresh(contact)
    return contact


def _inactive_sale(db_session, test_user, test_client, test_produit):
    test_produit.type_produit = "service"
    db_session.flush()
    tx = Transaction(
        date_transaction=date.today(), id_client=test_client.id_client,
        id_produit=test_produit.id_produit, quantite=4,
        prix_unitaire=Decimal("2.50"), montant_total=Decimal("10.00"),
        est_actif=False, id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(tx)
    db_session.flush()
    payment = Paiement(
        id_transaction=tx.id_transaction,
        type_paiement="cash", statut="annule", date_paiement=date.today(),
        montant=Decimal("5.00"), id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(payment)
    db_session.commit()
    return tx, payment


def test_reactivation_http_requires_fresh_preview_and_preserves_voided_payment(
    client, db_session, test_user, test_client, test_produit, auth_headers
):
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    tx, payment = _inactive_sale(db_session, test_user, test_client, test_produit)
    url = f"/api/v1/transactions/{tx.id_transaction}/reactivate"
    review_response = client.get(url + "/preview", headers=auth_headers)
    assert review_response.status_code == 200, review_response.text
    review = review_response.json()
    assert review["stock_effect"] == "aucun"
    assert review["cancelled_payments_count"] == 1
    assert review["restore_cancelled_payments"] is False

    args = {
        "expected_version": review["expected_version"],
        "dependency_fingerprint": "0" * 64,
        "restore_stock": True,
        "restore_cancelled_payments": False,
    }
    conflict = client.patch(url, json=args, headers=auth_headers)
    assert conflict.status_code == 409
    db_session.refresh(tx)
    assert not tx.est_actif

    impossible = client.patch(url, json={
        **args, "dependency_fingerprint": review["dependency_fingerprint"],
        "restore_cancelled_payments": True,
    }, headers=auth_headers)
    assert impossible.status_code == 422
    accepted = client.patch(url, json={
        **args, "dependency_fingerprint": review["dependency_fingerprint"],
    }, headers=auth_headers)
    assert accepted.status_code == 200, accepted.text
    db_session.expire_all()
    assert db_session.get(Transaction, tx.id_transaction).est_actif
    assert db_session.get(Paiement, payment.id_paiement).statut == "annule"
    assert db_session.query(Caisse).filter(
        Caisse.id_paiement == payment.id_paiement, Caisse.statut == "active",
    ).count() == 0
    again = client.get(url + "/preview", headers=auth_headers)
    assert again.status_code == 409


def test_reactivation_blocks_untraceable_stock_without_writing(
    client, db_session, test_user, test_client, test_produit, auth_headers
):
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    tx, payment = _inactive_sale(db_session, test_user, test_client, test_produit)
    test_produit.type_produit = "produit_fini"
    db_session.commit()
    url = f"/api/v1/transactions/{tx.id_transaction}/reactivate/preview"
    response = client.get(url, headers=auth_headers)
    assert response.status_code == 409
    assert "traçable" in response.json()["detail"]
    db_session.refresh(tx)
    assert tx.est_actif is False
