"""
Tests pour les endpoints CRUD des transactions.
"""
import pytest
from fastapi import status
from datetime import date, timedelta
from decimal import Decimal

from app.models.transaction import Transaction
from app.models.ligne_transaction import LigneTransaction
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.produit import Produit
from app.models.user import Utilisateur
from app.config import settings


def get_auth_headers(client, test_user):
    """
    Helper pour obtenir les headers d'authentification selon ENABLE_AUTH.
    Retourne un dict vide si auth désactivée, sinon retourne les headers avec token.
    """
    headers = {}
    if settings.ENABLE_AUTH:
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
    return headers


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
def test_produit(db_session):
    """Crée un produit de test."""
    produit = Produit(
        nom_produit="Produit Test",
        est_actif=True
    )
    db_session.add(produit)
    db_session.commit()
    db_session.refresh(produit)
    return produit


@pytest.fixture
def test_produits(db_session):
    """Crée plusieurs produits de test."""
    produits = [
        Produit(nom_produit=f"Produit {i}", est_actif=True)
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
            # Si auth activée, doit retourner 401
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
        else:
            # Si auth désactivée, doit retourner 200 (même liste vide)
            assert response.status_code == status.HTTP_200_OK
    
    def test_get_transactions_success(self, client, test_user, db_session, test_client):
        """Test de récupération de la liste des transactions."""
        headers = get_auth_headers(client, test_user)
        
        # Créer quelques transactions de test
        transaction1 = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        transaction2 = Transaction(
            date_transaction=date.today() - timedelta(days=1),
            montant_total=Decimal("200.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([transaction1, transaction2])
        db_session.commit()
        
        # Récupérer la liste des transactions
        response = client.get(
            "/api/v1/transactions",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2
    
    def test_get_transactions_with_date_filters(self, client, test_user, db_session, test_client):
        """Test des filtres de date sur GET /transactions."""
        headers = get_auth_headers(client, test_user)
        
        today = date.today()
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)
        
        # Créer des transactions avec différentes dates
        transaction1 = Transaction(
            date_transaction=yesterday,
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        transaction2 = Transaction(
            date_transaction=today,
            montant_total=Decimal("200.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        transaction3 = Transaction(
            date_transaction=tomorrow,
            montant_total=Decimal("300.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([transaction1, transaction2, transaction3])
        db_session.commit()
        
        # Filtrer par date_debut
        response = client.get(
            f"/api/v1/transactions?date_debut={today}",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 2  # today et tomorrow
        
        # Filtrer par date_fin
        response = client.get(
            f"/api/v1/transactions?date_fin={today}",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 2  # yesterday et today
        
        # Filtrer par plage de dates
        response = client.get(
            f"/api/v1/transactions?date_debut={today}&date_fin={today}",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 1  # only today
    
    def test_get_transactions_with_client_filter(self, client, test_user, db_session, test_client):
        """Test du filtre client sur GET /transactions."""
        headers = get_auth_headers(client, test_user)
        
        # Créer un autre client
        client2 = Client(
            nom_client="Client 2",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(client2)
        db_session.commit()
        db_session.refresh(client2)
        
        # Créer des transactions pour les deux clients
        transaction1 = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        transaction2 = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("200.00"),
            est_actif=True,
            id_client=client2.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([transaction1, transaction2])
        db_session.commit()
        
        # Filtrer par client
        response = client.get(
            f"/api/v1/transactions?id_client={test_client.id_client}",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(t["id_client"] == test_client.id_client for t in data)
    
    def test_get_transactions_with_fournisseur_filter(self, client, test_user, db_session, test_fournisseur):
        """Test du filtre fournisseur sur GET /transactions."""
        headers = get_auth_headers(client, test_user)
        
        # Créer des transactions avec fournisseur
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("150.00"),
            est_actif=True,
            id_fournisseur=test_fournisseur.id_fournisseur,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        
        # Filtrer par fournisseur
        response = client.get(
            f"/api/v1/transactions?id_fournisseur={test_fournisseur.id_fournisseur}",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 1
        assert all(t["id_fournisseur"] == test_fournisseur.id_fournisseur for t in data)
    
    def test_get_transactions_with_montant_filters(self, client, test_user, db_session, test_client):
        """Test des filtres de montant sur GET /transactions."""
        headers = get_auth_headers(client, test_user)
        
        # Créer des transactions avec différents montants
        transaction1 = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("50.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        transaction2 = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("150.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        transaction3 = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("250.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([transaction1, transaction2, transaction3])
        db_session.commit()
        
        # Filtrer par montant_min
        response = client.get(
            "/api/v1/transactions?montant_min=100.00",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(Decimal(str(t["montant_total"])) >= Decimal("100.00") for t in data)
        
        # Filtrer par montant_max
        response = client.get(
            "/api/v1/transactions?montant_max=200.00",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(Decimal(str(t["montant_total"])) <= Decimal("200.00") for t in data)
        
        # Filtrer par plage de montants
        response = client.get(
            "/api/v1/transactions?montant_min=100.00&montant_max=200.00",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 1
    
    def test_get_transactions_with_est_actif_filter(self, client, test_user, db_session, test_client):
        """Test du filtre est_actif sur GET /transactions."""
        headers = get_auth_headers(client, test_user)
        
        # Créer des transactions actives et inactives
        active_transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        inactive_transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("200.00"),
            est_actif=False,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([active_transaction, inactive_transaction])
        db_session.commit()
        
        # Filtrer par est_actif=True
        response = client.get(
            "/api/v1/transactions?est_actif=true",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(t["est_actif"] is True for t in data)
        
        # Filtrer par est_actif=False
        response = client.get(
            "/api/v1/transactions?est_actif=false",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(t["est_actif"] is False for t in data)
    
    def test_get_transaction_by_id_success(self, client, test_user, db_session, test_client, test_produit):
        """Test de récupération d'une transaction par ID avec lignes."""
        headers = get_auth_headers(client, test_user)
        
        # Créer une transaction avec lignes
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.flush()
        
        ligne = LigneTransaction(
            id_transaction=transaction.id_transaction,
            id_produit=test_produit.id_produit,
            quantite=2
        )
        db_session.add(ligne)
        db_session.commit()
        db_session.refresh(transaction)
        
        # Récupérer la transaction par ID
        response = client.get(
            f"/api/v1/transactions/{transaction.id_transaction}",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id_transaction"] == transaction.id_transaction
        assert data["montant_total"] == "100.00"
        assert "lignes_transaction" in data
        assert len(data["lignes_transaction"]) == 1
        assert data["lignes_transaction"][0]["id_produit"] == test_produit.id_produit
        assert data["lignes_transaction"][0]["quantite"] == 2
    
    def test_get_transaction_by_id_not_found(self, client, test_user):
        """Test de récupération d'une transaction inexistante."""
        headers = get_auth_headers(client, test_user)
        
        response = client.get(
            "/api/v1/transactions/99999",
            headers=headers
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "introuvable" in response.json()["detail"].lower()
    
    def test_create_transaction_with_lines_success(self, client, test_user, db_session, test_client, test_produits, admin_token):
        """Test de création d'une transaction avec lignes et calcul automatique du montant."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Créer une transaction avec lignes
        response = client.post(
            "/api/v1/transactions",
            headers=headers,
            json={
                "date_transaction": str(date.today()),
                "est_actif": True,
                "id_client": test_client.id_client,
                "lignes": [
                    {
                        "id_produit": test_produits[0].id_produit,
                        "quantite": 2,
                        "prix_unitaire": "25.50"
                    },
                    {
                        "id_produit": test_produits[1].id_produit,
                        "quantite": 3,
                        "prix_unitaire": "10.00"
                    }
                ]
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "id_transaction" in data
        assert data["id_client"] == test_client.id_client
        # Montant total calculé : (2 * 25.50) + (3 * 10.00) = 51.00 + 30.00 = 81.00
        assert Decimal(str(data["montant_total"])) == Decimal("81.00")
        assert "lignes_transaction" in data
        assert len(data["lignes_transaction"]) == 2
        
        # Vérifier en base
        transaction_db = db_session.query(Transaction).filter(
            Transaction.id_transaction == data["id_transaction"]
        ).first()
        assert transaction_db is not None
        assert transaction_db.montant_total == Decimal("81.00")
        # Vérifier la traçabilité si auth activée
        if settings.ENABLE_AUTH:
            assert transaction_db.id_utilisateur_creation == test_user.id_utilisateur
        
        # Vérifier les lignes
        lignes_db = db_session.query(LigneTransaction).filter(
            LigneTransaction.id_transaction == transaction_db.id_transaction
        ).all()
        assert len(lignes_db) == 2
    
    def test_create_transaction_without_lines_success(self, client, test_user, db_session, test_client):
        """Test de création d'une transaction sans lignes (montant explicite)."""
        headers = get_auth_headers(client, test_user)
        
        # Créer une transaction sans lignes
        response = client.post(
            "/api/v1/transactions",
            headers=headers,
            json={
                "date_transaction": str(date.today()),
                "montant_total": "150.00",
                "est_actif": True,
                "id_client": test_client.id_client
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["montant_total"] == "150.00"
        assert data["lignes_transaction"] == []
    
    def test_create_transaction_with_fournisseur(self, client, test_user, db_session, test_fournisseur, test_produits):
        """Test de création d'une transaction avec fournisseur."""
        headers = get_auth_headers(client, test_user)
        
        response = client.post(
            "/api/v1/transactions",
            headers=headers,
            json={
                "date_transaction": str(date.today()),
                "est_actif": True,
                "id_fournisseur": test_fournisseur.id_fournisseur,
                "lignes": [
                    {
                        "id_produit": test_produits[0].id_produit,
                        "quantite": 1,
                        "prix_unitaire": "50.00"
                    }
                ]
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["id_fournisseur"] == test_fournisseur.id_fournisseur
        assert data["id_client"] is None
    
    def test_create_transaction_invalid_client(self, client, test_user, test_produits):
        """Test de création d'une transaction avec un client inexistant."""
        headers = get_auth_headers(client, test_user)
        
        response = client.post(
            "/api/v1/transactions",
            headers=headers,
            json={
                "date_transaction": str(date.today()),
                "est_actif": True,
                "id_client": 99999,
                "lignes": [
                    {
                        "id_produit": test_produits[0].id_produit,
                        "quantite": 1,
                        "prix_unitaire": "50.00"
                    }
                ]
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "introuvable" in response.json()["detail"].lower()
    
    def test_create_transaction_invalid_produit(self, client, test_user, test_client):
        """Test de création d'une transaction avec un produit inexistant."""
        headers = get_auth_headers(client, test_user)
        
        response = client.post(
            "/api/v1/transactions",
            headers=headers,
            json={
                "date_transaction": str(date.today()),
                "est_actif": True,
                "id_client": test_client.id_client,
                "lignes": [
                    {
                        "id_produit": 99999,
                        "quantite": 1,
                        "prix_unitaire": "50.00"
                    }
                ]
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "introuvable" in response.json()["detail"].lower()
    
    def test_create_transaction_client_and_fournisseur_error(self, client, test_user, test_client, test_fournisseur):
        """Test qu'on ne peut pas créer une transaction avec client ET fournisseur."""
        headers = get_auth_headers(client, test_user)
        
        response = client.post(
            "/api/v1/transactions",
            headers=headers,
            json={
                "date_transaction": str(date.today()),
                "montant_total": "100.00",
                "est_actif": True,
                "id_client": test_client.id_client,
                "id_fournisseur": test_fournisseur.id_fournisseur
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_create_transaction_no_client_no_fournisseur_error(self, client, test_user):
        """Test qu'on ne peut pas créer une transaction sans client ni fournisseur."""
        headers = get_auth_headers(client, test_user)
        
        response = client.post(
            "/api/v1/transactions",
            headers=headers,
            json={
                "date_transaction": str(date.today()),
                "montant_total": "100.00",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_update_transaction_success(self, client, test_user, db_session, test_client, admin_token):
        """Test de mise à jour d'une transaction."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Créer une transaction
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        
        # Mettre à jour la transaction
        new_date = date.today() - timedelta(days=5)
        response = client.put(
            f"/api/v1/transactions/{transaction.id_transaction}",
            headers=headers,
            json={
                "date_transaction": str(new_date),
                "montant_total": "200.00"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["montant_total"] == "200.00"
        assert data["date_transaction"] == str(new_date)
        
        # Vérifier en base
        db_session.refresh(transaction)
        assert transaction.montant_total == Decimal("200.00")
        # Vérifier la traçabilité si auth activée
        if settings.ENABLE_AUTH:
            assert transaction.id_utilisateur_modification == test_user.id_utilisateur
    
    def test_update_transaction_partial(self, client, test_user, db_session, test_client):
        """Test de mise à jour partielle d'une transaction."""
        headers = get_auth_headers(client, test_user)
        
        # Créer une transaction
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        original_montant = transaction.montant_total
        
        # Mettre à jour uniquement est_actif
        response = client.put(
            f"/api/v1/transactions/{transaction.id_transaction}",
            headers=headers,
            json={
                "est_actif": False
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["est_actif"] is False
        assert Decimal(str(data["montant_total"])) == original_montant  # Montant inchangé
    
    def test_update_transaction_not_found(self, client, test_user):
        """Test de mise à jour d'une transaction inexistante."""
        headers = get_auth_headers(client, test_user)
        
        response = client.put(
            "/api/v1/transactions/99999",
            headers=headers,
            json={
                "montant_total": "200.00"
            }
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_delete_transaction_success(self, client, test_user, db_session, test_client, admin_token):
        """Test de suppression (soft delete) d'une transaction."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Créer une transaction
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        transaction_id = transaction.id_transaction
        
        # Supprimer la transaction
        response = client.delete(
            f"/api/v1/transactions/{transaction_id}",
            headers=headers
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Vérifier que la transaction existe toujours mais est inactive
        db_session.refresh(transaction)
        assert transaction.est_actif is False
        # Vérifier la traçabilité si auth activée
        if settings.ENABLE_AUTH:
            assert transaction.id_utilisateur_modification == test_user.id_utilisateur
        
        # Vérifier qu'elle n'apparaît plus dans la liste des transactions actives
        response = client.get(
            "/api/v1/transactions?est_actif=true",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        transaction_ids = [t["id_transaction"] for t in data]
        assert transaction_id not in transaction_ids
    
    def test_delete_transaction_not_found(self, client, test_user):
        """Test de suppression d'une transaction inexistante."""
        headers = get_auth_headers(client, test_user)
        
        response = client.delete(
            "/api/v1/transactions/99999",
            headers=headers
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_delete_transaction_already_inactive(self, client, test_user, db_session, test_client):
        """Test qu'on ne peut pas supprimer une transaction déjà inactive."""
        headers = get_auth_headers(client, test_user)
        
        # Créer une transaction inactive
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=False,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        
        # Essayer de supprimer la transaction déjà inactive
        response = client.delete(
            f"/api/v1/transactions/{transaction.id_transaction}",
            headers=headers
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "déjà inactive" in response.json()["detail"].lower()
    
    def test_transaction_tracks_user_creation(self, client, test_user, db_session, test_client, test_produits, admin_token):
        """Test que l'ID de l'utilisateur créateur est enregistré."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Créer une transaction
        response = client.post(
            "/api/v1/transactions",
            headers=headers,
            json={
                "date_transaction": str(date.today()),
                "est_actif": True,
                "id_client": test_client.id_client,
                "lignes": [
                    {
                        "id_produit": test_produits[0].id_produit,
                        "quantite": 1,
                        "prix_unitaire": "50.00"
                    }
                ]
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        
        # Vérifier en base
        transaction_db = db_session.query(Transaction).filter(
            Transaction.id_transaction == data["id_transaction"]
        ).first()
        # Vérifier la traçabilité si auth activée
        if settings.ENABLE_AUTH:
            assert transaction_db.id_utilisateur_creation == test_user.id_utilisateur
        else:
            # Si auth désactivée, peut être None
            assert transaction_db.id_utilisateur_creation is None or transaction_db.id_utilisateur_creation == test_user.id_utilisateur
    
    def test_transaction_tracks_user_modification(self, client, test_user, db_session, test_client, admin_token):
        """Test que l'ID de l'utilisateur modificateur est enregistré."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Créer une transaction
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        
        # Modifier la transaction
        response = client.put(
            f"/api/v1/transactions/{transaction.id_transaction}",
            headers=headers,
            json={
                "montant_total": "200.00"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier en base
        db_session.refresh(transaction)
        # Vérifier la traçabilité si auth activée
        if settings.ENABLE_AUTH:
            assert transaction.id_utilisateur_modification == test_user.id_utilisateur
        else:
            # Si auth désactivée, peut être None
            assert transaction.id_utilisateur_modification is None or transaction.id_utilisateur_modification == test_user.id_utilisateur
    
    def test_get_transactions_pagination(self, client, test_user, db_session, test_client):
        """Test de la pagination sur GET /transactions."""
        headers = get_auth_headers(client, test_user)
        
        # Créer plusieurs transactions
        transactions = [
            Transaction(
                date_transaction=date.today(),
                montant_total=Decimal(f"{(i + 1) * 10}.00"),  # Commencer à 10 pour éviter 0
                est_actif=True,
                id_client=test_client.id_client,
                id_utilisateur_creation=test_user.id_utilisateur
            )
            for i in range(10)
        ]
        db_session.add_all(transactions)
        db_session.commit()
        
        # Récupérer la première page (5 transactions)
        response = client.get(
            "/api/v1/transactions?skip=0&limit=5",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5
        
        # Récupérer la deuxième page
        response = client.get(
            "/api/v1/transactions?skip=5&limit=5",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5
    
    def test_get_transaction_audit_success(self, client, test_user, db_session, test_client):
        """Test de récupération de l'audit d'une transaction."""
        headers = get_auth_headers(client, test_user)
        
        # Créer une transaction
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        
        # Créer manuellement une entrée d'audit (simuler le trigger)
        from app.models.audit import TransactionAudit
        audit_entry = TransactionAudit(
            id_transaction=transaction.id_transaction,
            id_utilisateur=test_user.id_utilisateur,
            champ_modifie="montant_total",
            ancienne_valeur="50.00",
            nouvelle_valeur="100.00"
        )
        db_session.add(audit_entry)
        db_session.commit()
        
        # Récupérer l'audit de la transaction
        response = client.get(
            f"/api/v1/transactions/{transaction.id_transaction}/audit",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert data[0]["id_transaction"] == transaction.id_transaction
        assert data[0]["id_utilisateur"] == test_user.id_utilisateur
        assert data[0]["champ_modifie"] == "montant_total"
        assert data[0]["ancienne_valeur"] == "50.00"
        assert data[0]["nouvelle_valeur"] == "100.00"
        assert "nom_utilisateur" in data[0]
        assert "email_utilisateur" in data[0]
        assert "date_changement" in data[0]
    
    def test_get_transaction_audit_not_found(self, client, test_user):
        """Test de récupération de l'audit d'une transaction inexistante."""
        headers = get_auth_headers(client, test_user)
        
        # Essayer de récupérer l'audit d'une transaction qui n'existe pas
        response = client.get(
            "/api/v1/transactions/99999/audit",
            headers=headers
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_get_transaction_audit_empty(self, client, test_user, db_session, test_client):
        """Test de récupération de l'audit d'une transaction sans modifications."""
        headers = get_auth_headers(client, test_user)
        
        # Créer une transaction sans modifications (donc sans entrées d'audit)
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        
        # Récupérer l'audit de la transaction (devrait retourner une liste vide)
        response = client.get(
            f"/api/v1/transactions/{transaction.id_transaction}/audit",
            headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

