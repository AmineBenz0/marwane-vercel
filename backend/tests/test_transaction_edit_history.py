"""Regression tests for editing records with active or canceled payment history."""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import Mock

import pytest

from app.models.fournisseur import Fournisseur
from app.models.batiment import Batiment
from app.models.client import Client
from app.models.paiement import Paiement
from app.models.production import Production
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.routers import transactions


@pytest.fixture
def purchase(db_session, test_user):
    supplier = Fournisseur(nom_fournisseur="Fournisseur édition", est_actif=True)
    product = Produit(nom_produit="Aliment édition", pour_clients=False, pour_fournisseurs=True, type_produit="matiere_premiere")
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


def add_payment(db, transaction, state):
    payment = Paiement(id_transaction=transaction.id_transaction, date_paiement=transaction.date_transaction,
                       montant=Decimal("5.00"), type_paiement="cash", statut=state)
    db.add(payment)
    db.commit()
    return payment


@pytest.mark.parametrize("state", ["valide", "annule"])
def test_unchanged_financial_fields_allow_due_date_without_stock_or_payment_writes(client, db_session, purchase, state, monkeypatch):
    payment = add_payment(db_session, purchase, state)
    payment_id = payment.id_paiement
    reverse = Mock()
    record = Mock()
    cycle = Mock(side_effect=AssertionError("Due-date edits must not resolve stock again"))
    monkeypatch.setattr(transactions, "reverse_source_movements", reverse)
    monkeypatch.setattr(transactions, "record_transaction_movement", record)
    monkeypatch.setattr(transactions, "_resolve_transaction_cycle", cycle)
    due = date.today() + timedelta(days=8)
    response = client.put(f"/api/v1/transactions/{purchase.id_transaction}", json={
        "date_transaction": purchase.date_transaction.isoformat(), "date_echeance": due.isoformat(),
        "quantite": 10, "prix_unitaire": "2.500", "montant_total": "25.00",
        "id_produit": purchase.id_produit, "id_client": None, "id_fournisseur": purchase.id_fournisseur,
        "id_production": None, "id_batiment": None, "id_cycle": None, "est_actif": True,
    })
    assert response.status_code == 200, response.text
    assert response.json()["date_echeance"] == due.isoformat()
    assert Decimal(str(response.json()["montant_total"])) == Decimal("25.00")
    assert [(p["id_paiement"], p["statut"]) for p in response.json()["paiements"]] == [(payment_id, state)]
    reverse.assert_not_called()
    record.assert_not_called()
    cycle.assert_not_called()


@pytest.mark.parametrize("state", ["valide", "annule"])
@pytest.mark.parametrize("change", [{"quantite": 11}, {"prix_unitaire": "3.00"}, {"id_produit": 999}, {"date_transaction": "2020-01-01"}])
def test_real_financial_edits_remain_blocked_after_any_payment(client, db_session, purchase, state, change):
    add_payment(db_session, purchase, state)
    response = client.put(f"/api/v1/transactions/{purchase.id_transaction}", json=change)
    assert response.status_code == 409, response.text
    assert "historique de paiement" in response.json()["detail"]
    db_session.refresh(purchase)
    assert purchase.quantite == 10
    assert purchase.prix_unitaire == Decimal("2.50")


def test_unpaid_purchase_remains_editable_and_recalculates_total(client, purchase):
    response = client.put(f"/api/v1/transactions/{purchase.id_transaction}", json={"quantite": 12, "prix_unitaire": "3.00"})
    assert response.status_code == 200, response.text
    assert response.json()["quantite"] == 12
    assert Decimal(str(response.json()["montant_total"])) == Decimal("36.00")


def test_paid_due_date_can_be_cleared(client, db_session, purchase):
    add_payment(db_session, purchase, "valide")
    response = client.put(f"/api/v1/transactions/{purchase.id_transaction}", json={"date_echeance": None})
    assert response.status_code == 200, response.text
    assert response.json()["date_echeance"] is None


def test_paid_egg_sale_due_date_does_not_resolve_or_reallocate_its_production(client, db_session, test_user, monkeypatch):
    building = Batiment(nom="Bâtiment édition")
    customer = Client(nom_client="Client édition")
    product = Produit(nom_produit="Oeufs - Moyen", pour_clients=True, pour_fournisseurs=False)
    db_session.add_all([building, customer, product])
    db_session.flush()
    production = Production(id_batiment=building.id_batiment, date_production=date.today(),
                            type_oeuf="normal", calibre="moyen", nombre_oeufs=100, nombre_cartons=5, grammage=55)
    db_session.add(production)
    db_session.flush()
    sale = Transaction(date_transaction=date.today(), id_client=customer.id_client,
                       id_produit=product.id_produit, id_batiment=building.id_batiment, id_production=production.id_production,
                       quantite=10, prix_unitaire=Decimal("1.50"), montant_total=Decimal("15.00"),
                       est_actif=True, id_utilisateur_creation=test_user.id_utilisateur)
    db_session.add(sale)
    db_session.commit()
    add_payment(db_session, sale, "valide")
    resolve = Mock(side_effect=AssertionError("Do not select stock again for a due-date edit"))
    reverse, record = Mock(), Mock()
    monkeypatch.setattr(transactions, "resolve_sale_source", resolve)
    monkeypatch.setattr(transactions, "reverse_source_movements", reverse)
    monkeypatch.setattr(transactions, "record_transaction_movement", record)
    response = client.put(f"/api/v1/transactions/{sale.id_transaction}", json={
        "quantite": 10, "prix_unitaire": "1.50", "id_production": production.id_production,
        "id_batiment": building.id_batiment, "id_produit": product.id_produit,
        "date_echeance": (date.today() + timedelta(days=3)).isoformat(),
    })
    assert response.status_code == 200, response.text
    assert response.json()["id_production"] == production.id_production
    resolve.assert_not_called()
    reverse.assert_not_called()
    record.assert_not_called()
