"""Reviewed restoration keeps stock and settlement history consistent."""
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

import pytest

from app.main import app
from app.models.caisse import Caisse
from app.models.client import Client
from app.models.financial_correction import CorrectionFinanciere
from app.models.inventory import MouvementStock
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.services.inventory import get_stock_quantity, record_movement, record_transaction_movement
from app.utils.business_date import business_date
from app.utils.dependencies import get_current_active_user


@pytest.fixture
def test_client(db_session):
    contact = Client(nom_client="Client restauration", est_actif=True)
    db_session.add(contact)
    db_session.commit()
    return contact


def create_sale(db, contact, product, actor, *, quantity=6):
    tx = Transaction(
        date_transaction=business_date(), id_client=contact.id_client, id_produit=product.id_produit,
        quantite=quantity, prix_unitaire=Decimal("2.00"), montant_total=Decimal(quantity * 2),
        id_utilisateur_creation=actor.id_utilisateur,
    )
    db.add(tx)
    db.flush()
    record_transaction_movement(db, tx, actor)
    db.commit()
    return tx


def confirmation(review):
    return {
        "expected_version": review["expected_version"],
        "dependency_fingerprint": review["dependency_fingerprint"],
        "restore_stock": True,
        "restore_cancelled_payments": False,
    }


def test_restoration_requires_review_and_preserves_voided_cash(
    client, db_session, test_user, test_client, test_produit, auth_headers
):
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    test_produit.type_produit = "service"
    tx = create_sale(db_session, test_client, test_produit, test_user)
    parent = f"/api/v1/transactions/{tx.id_transaction}"
    payment = client.post("/api/v1/paiements", json={
        "id_transaction": tx.id_transaction, "date_paiement": business_date().isoformat(),
        "montant": "5.00", "type_paiement": "cash",
    }, headers=auth_headers)
    assert payment.status_code == 201, payment.text
    payment_id = payment.json()["id_paiement"]
    assert db_session.query(Caisse).filter_by(id_paiement=payment_id, statut="active").count() == 1
    cancelled = client.delete(parent, headers=auth_headers)
    assert cancelled.status_code == 204, cancelled.text
    path = f"{parent}/reactivate"

    assert client.patch(path, json={}, headers=auth_headers).status_code == 422
    reviewed = client.get(f"{path}/preview", headers=auth_headers)
    assert reviewed.status_code == 200, reviewed.text
    review = reviewed.json()
    assert review["stock_effect"] == "aucun"
    assert review["cancelled_payments_count"] == 1
    assert not db_session.get(Transaction, tx.id_transaction).est_actif

    command = confirmation(review)
    assert client.patch(path, json={**command, "restore_cancelled_payments": True},
                        headers=auth_headers).status_code == 422
    assert client.patch(path, json={**command, "dependency_fingerprint": "0" * 64},
                        headers=auth_headers).status_code == 409
    restored = client.patch(path, json=command, headers=auth_headers)
    assert restored.status_code == 200, restored.text
    assert restored.json()["est_actif"] is True
    assert restored.json()["statut_paiement"] == "impaye"
    assert client.patch(path, json=command, headers=auth_headers).status_code == 409

    db_session.expire_all()
    assert db_session.get(Paiement, payment_id).statut == "annule"
    assert db_session.query(Caisse).filter_by(id_paiement=payment_id, statut="active").count() == 0
    assert db_session.query(CorrectionFinanciere).filter_by(
        type_entite="transaction", id_entite=tx.id_transaction, action="reactivation",
    ).count() == 1


def test_stock_review_is_invalidated_by_another_sale_and_restores_only_once(
    client, db_session, test_user, test_client, test_produit, auth_headers
):
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    product_id = test_produit.id_produit
    record_movement(
        db_session, id_produit=product_id, quantite_delta=Decimal("10"),
        cout_unitaire=Decimal("3"), type_mouvement="ajustement", source_type="manual",
        date_mouvement=datetime.combine(business_date() - timedelta(days=1), time.min, tzinfo=timezone.utc),
    )
    tx = create_sale(db_session, test_client, test_produit, test_user)
    parent = f"/api/v1/transactions/{tx.id_transaction}"
    assert client.delete(parent, headers=auth_headers).status_code == 204
    assert get_stock_quantity(db_session, product_id) == 10
    path = f"{parent}/reactivate"
    reviewed = client.get(f"{path}/preview", headers=auth_headers)
    assert reviewed.status_code == 200, reviewed.text
    review = reviewed.json()
    assert (review["stock_effect"], review["stock_quantity"]) == ("sortie", 6)

    create_sale(db_session, test_client, test_produit, test_user, quantity=2)
    stale = client.patch(path, json=confirmation(review), headers=auth_headers)
    assert stale.status_code == 409
    assert get_stock_quantity(db_session, product_id) == 8
    current = client.get(f"{path}/preview", headers=auth_headers)
    assert current.status_code == 200, current.text
    restored = client.patch(path, json=confirmation(current.json()), headers=auth_headers)
    assert restored.status_code == 200, restored.text
    assert get_stock_quantity(db_session, product_id) == 2
    originals = db_session.query(MouvementStock).filter_by(
        source_type="transaction", source_id=tx.id_transaction,
    ).order_by(MouvementStock.id_mouvement_stock).all()
    assert len(originals) == 2
    assert originals[0].id_mouvement_inverse is not None
    assert originals[1].id_mouvement_inverse is None
    assert originals[1].cout_unitaire == originals[0].cout_unitaire


def test_historical_sale_with_unrelated_stock_cannot_invent_an_original(
    client, db_session, test_user, test_client, test_produit, auth_headers
):
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    tx = create_sale(db_session, test_client, test_produit, test_user)
    tx.est_actif = False
    record_movement(db_session, id_produit=test_produit.id_produit, quantite_delta=Decimal("20"),
                    type_mouvement="ajustement", source_type="manual")
    db_session.commit()
    response = client.get(f"/api/v1/transactions/{tx.id_transaction}/reactivate/preview", headers=auth_headers)
    assert response.status_code == 409
    assert "traçable" in response.json()["detail"]
