"""Supplier funding is separate from method and captured before ledger posting."""
from datetime import date
from decimal import Decimal

import pytest

from app.models.caisse import Caisse
from app.models.client import Client
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.services.financial_ledger import sync_payment_cash_movement


@pytest.fixture
def funding_data(db_session):
    supplier = Fournisseur(nom_fournisseur="Supplier funding", mode_reglement_prefere="banque")
    customer = Client(nom_client="Client funding")
    product = Produit(nom_produit="Supplier input", pour_clients=False, pour_fournisseurs=True)
    accounts = [CompteBancaire(nom_banque=f"Bank {i}", numero_compte=f"FUND-{i}", solde_actuel=1000) for i in range(2)]
    db_session.add_all([supplier, customer, product, *accounts])
    db_session.flush()
    transaction = Transaction(date_transaction=date.today(), quantite=1, prix_unitaire=100, montant_total=100,
                              id_fournisseur=supplier.id_fournisseur, id_produit=product.id_produit)
    db_session.add(transaction)
    db_session.commit()
    return supplier, customer, product, accounts, transaction


def payment_payload(transaction, **overrides):
    return {"id_transaction": transaction.id_transaction, "date_paiement": date.today().isoformat(),
            "montant": "100.00", "type_paiement": "cash", **overrides}


@pytest.mark.parametrize("source,method", [("banque", "cash"), ("banque", "virement"),
                                           ("caisse", "cash"), ("caisse", "virement")])
def test_source_controls_debit_independently_of_method(client, db_session, funding_data, source, method):
    supplier, _, _, accounts, transaction = funding_data
    supplier.mode_reglement_prefere = source
    db_session.commit()
    response = client.post("/api/v1/paiements", json=payment_payload(
        transaction, type_paiement=method, id_compte=accounts[1].id_compte if source == "banque" else None))
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["source_reglement"] == source
    assert result["type_paiement"] == method
    payment_id = result["id_paiement"]
    cash = db_session.query(Caisse).filter_by(id_paiement=payment_id, statut="active").all()
    bank = db_session.query(MouvementBancaire).filter_by(id_paiement=payment_id, statut="active").all()
    db_session.refresh(accounts[0])
    db_session.refresh(accounts[1])
    assert accounts[0].solde_actuel == Decimal("1000")
    if source == "banque":
        assert not cash
        assert len(bank) == 1 and bank[0].type_mouvement == "SORTIE" and bank[0].source == method
        assert accounts[1].solde_actuel == Decimal("900")
    else:
        assert not bank
        assert len(cash) == 1 and cash[0].type_mouvement == "SORTIE"
        assert accounts[1].solde_actuel == Decimal("1000")


def test_snapshot_survives_preference_change_and_void_restores_same_account(client, db_session, funding_data):
    supplier, _, _, accounts, transaction = funding_data
    response = client.post("/api/v1/paiements", json=payment_payload(transaction, id_compte=accounts[1].id_compte))
    assert response.status_code == 201, response.text
    payment = db_session.get(Paiement, response.json()["id_paiement"])
    supplier.mode_reglement_prefere = "caisse"
    db_session.commit()
    sync_payment_cash_movement(db_session, payment, transaction)
    db_session.commit()
    db_session.refresh(accounts[1])
    assert accounts[1].solde_actuel == Decimal("900")
    assert not db_session.query(Caisse).filter_by(id_paiement=payment.id_paiement, statut="active").count()
    response = client.delete(f"/api/v1/paiements/{payment.id_paiement}", params={"raison": "Test reversal"})
    assert response.status_code == 204, response.text
    db_session.refresh(accounts[1])
    assert accounts[1].solde_actuel == Decimal("1000")


def test_historical_payment_keeps_legacy_routing(db_session, funding_data):
    _, _, _, accounts, transaction = funding_data
    payment = Paiement(id_transaction=transaction.id_transaction, date_paiement=date.today(), montant=100,
                       type_paiement="cash", statut="valide")
    db_session.add(payment)
    db_session.flush()
    sync_payment_cash_movement(db_session, payment, transaction)
    db_session.commit()
    assert payment.source_reglement is None
    assert db_session.query(Caisse).filter_by(id_paiement=payment.id_paiement, statut="active").count() == 1
    db_session.refresh(accounts[1])
    assert accounts[1].solde_actuel == Decimal("1000")


@pytest.mark.parametrize("account", [None, 99999])
def test_bank_supplier_requires_valid_account(client, db_session, funding_data, account):
    *_, transaction = funding_data
    response = client.post("/api/v1/paiements", json=payment_payload(transaction, id_compte=account))
    assert response.status_code in (400, 404), response.text
    assert db_session.query(Paiement).count() == 0
    assert db_session.query(MouvementBancaire).count() == 0


def test_batch_applies_source_to_cash_payment(client, db_session, funding_data):
    *_, accounts, transaction = funding_data
    response = client.post("/api/v1/paiements/batch", json={"paiements": [
        payment_payload(transaction, id_compte=accounts[1].id_compte)]})
    assert response.status_code == 201, response.text
    assert response.json()[0]["source_reglement"] == "banque"
    assert db_session.query(Caisse).count() == 0


def test_atomic_transaction_and_bank_cash_payment(client, db_session, funding_data):
    supplier, _, product, accounts, transaction = funding_data
    response = client.post("/api/v1/transactions/batch-with-payments", json={"items": [{
        "client_ref": "bank-cash", "transaction": {
            "id_fournisseur": supplier.id_fournisseur, "id_produit": product.id_produit,
            "date_transaction": date.today().isoformat(), "quantite": 1, "prix_unitaire": 100,
        }, "paiements": [{k: v for k, v in payment_payload(transaction, id_compte=accounts[1].id_compte).items()
                          if k != "id_transaction"}],
    }]})
    assert response.status_code == 201, response.text
    assert response.json()[0]["paiements"][0]["source_reglement"] == "banque"
    assert db_session.query(Caisse).count() == 0


def test_invalid_atomic_bank_payment_rolls_back_new_transaction(client, db_session, funding_data):
    supplier, _, product, _, _ = funding_data
    response = client.post("/api/v1/transactions/batch-with-payments", json={"items": [{
        "client_ref": "missing-bank", "transaction": {
            "id_fournisseur": supplier.id_fournisseur, "id_produit": product.id_produit,
            "date_transaction": date.today().isoformat(), "quantite": 1, "prix_unitaire": 100,
        }, "paiements": [{"date_paiement": date.today().isoformat(), "montant": 100, "type_paiement": "cash"}],
    }]})
    assert response.status_code == 400, response.text
    assert db_session.query(Transaction).count() == 1
    assert db_session.query(Paiement).count() == 0


def test_client_cash_routing_unchanged_and_source_cannot_be_supplied(client, db_session, funding_data):
    _, customer, _, _, transaction = funding_data
    transaction.id_fournisseur = None
    transaction.id_client = customer.id_client
    db_session.commit()
    rejected = client.post("/api/v1/paiements", json=payment_payload(transaction, source_reglement="banque"))
    assert rejected.status_code == 400, rejected.text
    response = client.post("/api/v1/paiements", json=payment_payload(transaction))
    assert response.status_code == 201, response.text
    assert response.json()["source_reglement"] is None
    assert db_session.query(Caisse).filter_by(type_mouvement="ENTREE", statut="active").count() == 1


def test_client_virement_keeps_legacy_bank_routing(client, db_session, funding_data):
    _, customer, _, accounts, transaction = funding_data
    transaction.id_fournisseur = None
    transaction.id_client = customer.id_client
    db_session.commit()
    bad = client.post('/api/v1/paiements', json=payment_payload(transaction, id_compte=accounts[1].id_compte))
    assert bad.status_code == 400
    response = client.post('/api/v1/paiements', json=payment_payload(
        transaction, type_paiement='virement', id_compte=accounts[1].id_compte))
    assert response.status_code == 201, response.text
    assert response.json()['source_reglement'] is None
    db_session.refresh(accounts[1])
    assert accounts[1].solde_actuel == Decimal('1100')


def test_source_is_immutable_and_cannot_override_supplier(client, db_session, funding_data):
    *_, accounts, transaction = funding_data
    response = client.post('/api/v1/paiements', json=payment_payload(transaction, source_reglement='caisse'))
    assert response.status_code == 409, response.text
    response = client.post('/api/v1/paiements', json=payment_payload(transaction, id_compte=accounts[1].id_compte))
    assert response.status_code == 201, response.text
    changed = client.put(f"/api/v1/paiements/{response.json()['id_paiement']}", json={'source_reglement': 'caisse'})
    assert changed.status_code == 409, changed.text


def test_idempotency_does_not_reuse_payment_for_another_bank_account(client, funding_data):
    *_, accounts, transaction = funding_data
    payload = payment_payload(transaction, id_compte=accounts[1].id_compte, cle_idempotence='supplier-bank-cash')
    response = client.post('/api/v1/paiements', json=payload)
    assert response.status_code == 201, response.text
    replay = client.post('/api/v1/paiements', json=payload)
    assert replay.status_code == 200, replay.text
    conflict = client.post('/api/v1/paiements', json={**payload, 'id_compte': accounts[0].id_compte})
    assert conflict.status_code == 409, conflict.text


def test_cheque_debits_saved_bank_only_when_effective(client, db_session, funding_data):
    supplier, _, _, accounts, transaction = funding_data
    response = client.post("/api/v1/paiements", json=payment_payload(
        transaction, id_compte=accounts[1].id_compte, type_paiement="cheque", statut_cheque="a_encaisser"))
    assert response.status_code == 201, response.text
    payment_id = response.json()["id_paiement"]
    assert db_session.query(MouvementBancaire).count() == 0
    supplier.mode_reglement_prefere = "caisse"
    db_session.commit()
    response = client.put(f"/api/v1/paiements/{payment_id}", json={"statut_cheque": "encaisse"})
    assert response.status_code == 200, response.text
    db_session.refresh(accounts[1])
    assert accounts[1].solde_actuel == Decimal("900")
    assert db_session.query(Caisse).count() == 0
