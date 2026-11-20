"""Contact scores must not fail when a contact was paid more than the total (overpayment)."""
from datetime import date
from decimal import Decimal

from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.transaction import Transaction


def _overpaid(db_session, test_produit, **party):
    # 600 bought or sold, 720 paid: 120 % paid.
    row = Transaction(
        **party, id_produit=test_produit.id_produit, date_transaction=date(2026, 10, 1),
        quantite=5, prix_unitaire=Decimal("120"), montant_total=Decimal("600"),
    )
    db_session.add(row)
    db_session.flush()
    db_session.add(Paiement(
        id_transaction=row.id_transaction, date_paiement=date(2026, 10, 1), montant=Decimal("720"),
        type_paiement="cash", statut="valide",
    ))
    db_session.commit()


def test_supplier_score_with_overpayment(client, auth_headers, db_session, test_produit):
    supplier = Fournisseur(nom_fournisseur="ZZ score surpayé", est_actif=True)
    db_session.add(supplier)
    db_session.flush()
    _overpaid(db_session, test_produit, id_fournisseur=supplier.id_fournisseur)
    response = client.get(f"/api/v1/fournisseurs/{supplier.id_fournisseur}/score", headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["taux_paiement"] == 100.0
    assert data["score_paiement"] == 40.0
    assert data["score_total"] <= 100


def test_client_score_with_overpayment(client, auth_headers, db_session, test_produit):
    customer = Client(nom_client="ZZ score surpayé", est_actif=True)
    db_session.add(customer)
    db_session.flush()
    _overpaid(db_session, test_produit, id_client=customer.id_client)
    response = client.get(f"/api/v1/clients/{customer.id_client}/score", headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["taux_paiement"] == 100.0
    assert data["score_paiement"] == 40.0
