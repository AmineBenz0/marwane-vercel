"""
Tests pour les endpoints CRUD des transactions.
Alignés avec le modèle Transaction aplati.
"""
import pytest
from fastapi import status
from datetime import date, timedelta
from decimal import Decimal

from app.models.transaction import Transaction
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.produit import Produit
from app.models.user import Utilisateur
from app.config import settings




@pytest.fixture
def test_client(db_session, test_user):
    """Crée un client de test."""
    client = Client(
        nom_client="Client Test",
        est_actif=True,
        id_utilisateur_creation=test_user.id_utilisateur
    )
    db_session.add(client)
    db_session.commit()
    db_session.refresh(client)
    return client


@pytest.fixture
def test_fournisseur(db_session, test_user):
    """Crée un fournisseur de test."""
    fournisseur = Fournisseur(
        nom_fournisseur="Fournisseur Test",
        est_actif=True,
        id_utilisateur_creation=test_user.id_utilisateur
    )
    db_session.add(fournisseur)
    db_session.commit()
    db_session.refresh(fournisseur)
    return fournisseur




@pytest.fixture
def test_produits(db_session):
    """Crée plusieurs produits de test."""
    produits = [
        Produit(nom_produit=f"Produit {i}", est_actif=True, pour_clients=True, pour_fournisseurs=True)
        for i in range(3)
    ]
    db_session.add_all(produits)
    db_session.commit()
    for p in produits:
        db_session.refresh(p)
    return produits


class TestTransactionsEndpoints:
    """Tests pour les endpoints CRUD des transactions."""
    
    def test_get_transactions_auth_behavior(self, client):
        """Test du comportement de GET /transactions selon ENABLE_AUTH."""
        response = client.get("/api/v1/transactions")
        if settings.ENABLE_AUTH:
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
        else:
            assert response.status_code == status.HTTP_200_OK
    
    def test_get_transactions_success(self, client, test_user, db_session, test_client, test_produit, auth_headers):
        """Test de récupération de la liste des transactions."""
        # Créer quelques transactions
        transaction1 = Transaction(
            date_transaction=date.today(),
            id_produit=test_produit.id_produit,
            quantite=10,
            prix_unitaire=Decimal("10.00"),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        transaction2 = Transaction(
            date_transaction=date.today(),
            id_produit=test_produit.id_produit,
            quantite=20,
            prix_unitaire=Decimal("10.00"),
            montant_total=Decimal("200.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([transaction1, transaction2])
        db_session.commit()
        
        response = client.get("/api/v1/transactions", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 2
    
    def test_create_transaction_success(self, client, test_user, db_session, test_client, test_produit, admin_token):
        """Test de création d'une transaction avec calcul automatique du montant."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = client.post(
            "/api/v1/transactions",
            headers=headers,
            json={
                "date_transaction": str(date.today()),
                "est_actif": True,
                "id_client": test_client.id_client,
                "id_produit": test_produit.id_produit,
                "quantite": 5,
                "prix_unitaire": "20.50"
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["id_client"] == test_client.id_client
        assert data["id_produit"] == test_produit.id_produit
        # 5 * 20.50 = 102.50
        assert Decimal(str(data["montant_total"])) == Decimal("102.50")
    
    def test_update_transaction_recalculation(self, client, test_user, db_session, test_client, test_produit, admin_token):
        """Test que le montant est recalculé lors d'une mise à jour de quantité/prix."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Créer une transaction
        tx = Transaction(
            date_transaction=date.today(),
            id_produit=test_produit.id_produit,
            quantite=10,
            prix_unitaire=Decimal("10.00"),
            montant_total=Decimal("100.00"),
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(tx)
        db_session.commit()
        db_session.refresh(tx)
        
        # Mettre à jour quantité et prix
        response = client.put(
            f"/api/v1/transactions/{tx.id_transaction}",
            headers=headers,
            json={
                "quantite": 2,
                "prix_unitaire": "50.00"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # 2 * 50.00 = 100.00
        assert Decimal(str(data["montant_total"])) == Decimal("100.00")
        
        # Mettre à jour seulement la quantité (si le router gère le mélange)
        # Note: TransactionUpdate nécessite les deux pour recalculer dans le model_validator actuel
        # ou alors le router doit fusionner.
        response = client.put(
            f"/api/v1/transactions/{tx.id_transaction}",
            headers=headers,
            json={
                "quantite": 5,
                "prix_unitaire": "50.00" # On renvoie les deux pour être sûr si le router ne fusionne pas
            }
        )
        assert response.status_code == status.HTTP_200_OK
        assert Decimal(str(response.json()["montant_total"])) == Decimal("250.00")

    def test_delete_transaction_soft_delete(self, client, test_user, db_session, test_client, test_produit, admin_token):
        """Test de suppression (soft delete) d'une transaction."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        tx = Transaction(
            date_transaction=date.today(),
            id_produit=test_produit.id_produit,
            quantite=1,
            prix_unitaire=Decimal("10.00"),
            montant_total=Decimal("10.00"),
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur,
            est_actif=True
        )
        db_session.add(tx)
        db_session.commit()
        db_session.refresh(tx)
        
        response = client.delete(f"/api/v1/transactions/{tx.id_transaction}", headers=headers)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        db_session.refresh(tx)
        assert tx.est_actif is False
