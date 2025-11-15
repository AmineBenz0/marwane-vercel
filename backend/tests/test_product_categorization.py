"""
Tests pour la fonctionnalité de catégorisation des produits par type de transaction.

Ce module teste :
1. La création de produits avec différentes combinaisons de types
2. La validation des contraintes (au moins un type doit être True)
3. Le filtrage des produits par type de transaction
4. La validation des produits lors de la création de transactions
"""
import pytest
from fastapi import status
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.ligne_transaction import LigneTransaction
from app.models.client import Client
from app.models.fournisseur import Fournisseur


class TestProductCreationWithTypes:
    """Tests pour la création de produits avec les nouveaux champs de type."""
    
    def test_create_product_for_clients_only(self, client, auth_headers, db_session):
        """Test : Création d'un produit uniquement pour les clients."""
        product_data = {
            "nom_produit": "Produit Client Only",
            "est_actif": True,
            "pour_clients": True,
            "pour_fournisseurs": False
        }
        
        response = client.post("/api/v1/produits", json=product_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["nom_produit"] == "Produit Client Only"
        assert data["pour_clients"] is True
        assert data["pour_fournisseurs"] is False
    
    def test_create_product_for_suppliers_only(self, client, auth_headers, db_session):
        """Test : Création d'un produit uniquement pour les fournisseurs."""
        product_data = {
            "nom_produit": "Produit Fournisseur Only",
            "est_actif": True,
            "pour_clients": False,
            "pour_fournisseurs": True
        }
        
        response = client.post("/api/v1/produits", json=product_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["nom_produit"] == "Produit Fournisseur Only"
        assert data["pour_clients"] is False
        assert data["pour_fournisseurs"] is True
    
    def test_create_product_for_both(self, client, auth_headers, db_session):
        """Test : Création d'un produit pour les deux types de transactions."""
        product_data = {
            "nom_produit": "Produit Polyvalent",
            "est_actif": True,
            "pour_clients": True,
            "pour_fournisseurs": True
        }
        
        response = client.post("/api/v1/produits", json=product_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["nom_produit"] == "Produit Polyvalent"
        assert data["pour_clients"] is True
        assert data["pour_fournisseurs"] is True
    
    def test_create_product_with_neither_type_fails(self, client, auth_headers, db_session):
        """Test : Création d'un produit sans aucun type échoue."""
        product_data = {
            "nom_produit": "Produit Sans Type",
            "est_actif": True,
            "pour_clients": False,
            "pour_fournisseurs": False
        }
        
        response = client.post("/api/v1/produits", json=product_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "au moins" in response.json()["detail"].lower()


class TestProductUpdateWithTypes:
    """Tests pour la mise à jour de produits avec les champs de type."""
    
    def test_update_product_type_flags(self, client, auth_headers, db_session):
        """Test : Mise à jour des flags de type d'un produit."""
        # Créer un produit
        product_data = {
            "nom_produit": "Produit à Modifier",
            "est_actif": True,
            "pour_clients": True,
            "pour_fournisseurs": True
        }
        response = client.post("/api/v1/produits", json=product_data, headers=auth_headers)
        product_id = response.json()["id_produit"]
        
        # Modifier pour clients uniquement
        update_data = {
            "pour_fournisseurs": False
        }
        response = client.put(f"/api/v1/produits/{product_id}", json=update_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["pour_clients"] is True
        assert data["pour_fournisseurs"] is False
    
    def test_update_product_to_neither_type_fails(self, client, auth_headers, db_session):
        """Test : Mise à jour d'un produit pour enlever tous les types échoue."""
        # Créer un produit
        product_data = {
            "nom_produit": "Produit à Invalider",
            "est_actif": True,
            "pour_clients": True,
            "pour_fournisseurs": False
        }
        response = client.post("/api/v1/produits", json=product_data, headers=auth_headers)
        product_id = response.json()["id_produit"]
        
        # Essayer de désactiver le seul type actif
        update_data = {
            "pour_clients": False
        }
        response = client.put(f"/api/v1/produits/{product_id}", json=update_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "au moins" in response.json()["detail"].lower()


class TestProductFilteringByType:
    """Tests pour le filtrage des produits par type de transaction."""
    
    @pytest.fixture
    def sample_products(self, client, auth_headers, db_session):
        """Crée des produits de test avec différents types."""
        products = []
        
        # Produit pour clients uniquement
        product1 = {
            "nom_produit": "Produit Client A",
            "pour_clients": True,
            "pour_fournisseurs": False
        }
        response = client.post("/api/v1/produits", json=product1, headers=auth_headers)
        products.append(response.json())
        
        # Produit pour fournisseurs uniquement
        product2 = {
            "nom_produit": "Produit Fournisseur B",
            "pour_clients": False,
            "pour_fournisseurs": True
        }
        response = client.post("/api/v1/produits", json=product2, headers=auth_headers)
        products.append(response.json())
        
        # Produit pour les deux
        product3 = {
            "nom_produit": "Produit Polyvalent C",
            "pour_clients": True,
            "pour_fournisseurs": True
        }
        response = client.post("/api/v1/produits", json=product3, headers=auth_headers)
        products.append(response.json())
        
        return products
    
    def test_filter_products_for_clients(self, client, auth_headers, sample_products):
        """Test : Filtrage des produits pour les transactions clients."""
        response = client.get("/api/v1/produits/par-type/client", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # Devrait retourner 2 produits (Client A et Polyvalent C)
        assert len(data) == 2
        product_names = [p["nom_produit"] for p in data]
        assert "Produit Client A" in product_names
        assert "Produit Polyvalent C" in product_names
        assert "Produit Fournisseur B" not in product_names
    
    def test_filter_products_for_suppliers(self, client, auth_headers, sample_products):
        """Test : Filtrage des produits pour les transactions fournisseurs."""
        response = client.get("/api/v1/produits/par-type/fournisseur", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # Devrait retourner 2 produits (Fournisseur B et Polyvalent C)
        assert len(data) == 2
        product_names = [p["nom_produit"] for p in data]
        assert "Produit Fournisseur B" in product_names
        assert "Produit Polyvalent C" in product_names
        assert "Produit Client A" not in product_names
    
    def test_filter_products_invalid_type(self, client, auth_headers):
        """Test : Filtrage avec un type invalide échoue."""
        response = client.get("/api/v1/produits/par-type/invalid", headers=auth_headers)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "client" in response.json()["detail"].lower()
        assert "fournisseur" in response.json()["detail"].lower()


class TestTransactionProductTypeValidation:
    """Tests pour la validation des types de produits dans les transactions."""
    
    @pytest.fixture
    def test_data(self, client, auth_headers, db_session):
        """Crée les données de test nécessaires."""
        # Créer un client
        client_data = {"nom_client": "Client Test"}
        response = client.post("/api/v1/clients", json=client_data, headers=auth_headers)
        test_client = response.json()
        
        # Créer un fournisseur
        fournisseur_data = {"nom_fournisseur": "Fournisseur Test"}
        response = client.post("/api/v1/fournisseurs", json=fournisseur_data, headers=auth_headers)
        test_fournisseur = response.json()
        
        # Créer des produits
        product_client = {
            "nom_produit": "Produit Client Only TX",
            "pour_clients": True,
            "pour_fournisseurs": False
        }
        response = client.post("/api/v1/produits", json=product_client, headers=auth_headers)
        produit_client = response.json()
        
        product_fournisseur = {
            "nom_produit": "Produit Fournisseur Only TX",
            "pour_clients": False,
            "pour_fournisseurs": True
        }
        response = client.post("/api/v1/produits", json=product_fournisseur, headers=auth_headers)
        produit_fournisseur = response.json()
        
        return {
            "client": test_client,
            "fournisseur": test_fournisseur,
            "produit_client": produit_client,
            "produit_fournisseur": produit_fournisseur
        }
    
    def test_create_client_transaction_with_client_product_succeeds(self, client, auth_headers, test_data):
        """Test : Création d'une transaction client avec un produit client réussit."""
        transaction_data = {
            "date_transaction": "2024-11-14",
            "id_client": test_data["client"]["id_client"],
            "lignes": [
                {
                    "id_produit": test_data["produit_client"]["id_produit"],
                    "quantite": 5,
                    "prix_unitaire": 100.0
                }
            ]
        }
        
        response = client.post("/api/v1/transactions", json=transaction_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["montant_total"] == "500.00"
    
    def test_create_client_transaction_with_supplier_product_fails(self, client, auth_headers, test_data):
        """Test : Création d'une transaction client avec un produit fournisseur échoue."""
        transaction_data = {
            "date_transaction": "2024-11-14",
            "id_client": test_data["client"]["id_client"],
            "lignes": [
                {
                    "id_produit": test_data["produit_fournisseur"]["id_produit"],
                    "quantite": 5,
                    "prix_unitaire": 100.0
                }
            ]
        }
        
        response = client.post("/api/v1/transactions", json=transaction_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "client" in response.json()["detail"].lower()
        assert test_data["produit_fournisseur"]["nom_produit"] in response.json()["detail"]
    
    def test_create_supplier_transaction_with_supplier_product_succeeds(self, client, auth_headers, test_data):
        """Test : Création d'une transaction fournisseur avec un produit fournisseur réussit."""
        transaction_data = {
            "date_transaction": "2024-11-14",
            "id_fournisseur": test_data["fournisseur"]["id_fournisseur"],
            "lignes": [
                {
                    "id_produit": test_data["produit_fournisseur"]["id_produit"],
                    "quantite": 10,
                    "prix_unitaire": 50.0
                }
            ]
        }
        
        response = client.post("/api/v1/transactions", json=transaction_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["montant_total"] == "500.00"
    
    def test_create_supplier_transaction_with_client_product_fails(self, client, auth_headers, test_data):
        """Test : Création d'une transaction fournisseur avec un produit client échoue."""
        transaction_data = {
            "date_transaction": "2024-11-14",
            "id_fournisseur": test_data["fournisseur"]["id_fournisseur"],
            "lignes": [
                {
                    "id_produit": test_data["produit_client"]["id_produit"],
                    "quantite": 10,
                    "prix_unitaire": 50.0
                }
            ]
        }
        
        response = client.post("/api/v1/transactions", json=transaction_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "fournisseur" in response.json()["detail"].lower()
        assert test_data["produit_client"]["nom_produit"] in response.json()["detail"]
    
    def test_update_transaction_product_type_validation(self, client, auth_headers, test_data):
        """Test : Validation des types de produits lors de la mise à jour d'une transaction."""
        # Créer une transaction client valide
        transaction_data = {
            "date_transaction": "2024-11-14",
            "id_client": test_data["client"]["id_client"],
            "lignes": [
                {
                    "id_produit": test_data["produit_client"]["id_produit"],
                    "quantite": 5,
                    "prix_unitaire": 100.0
                }
            ]
        }
        response = client.post("/api/v1/transactions", json=transaction_data, headers=auth_headers)
        transaction_id = response.json()["id_transaction"]
        
        # Essayer de mettre à jour avec un produit fournisseur
        update_data = {
            "lignes": [
                {
                    "id_produit": test_data["produit_fournisseur"]["id_produit"],
                    "quantite": 5,
                    "prix_unitaire": 100.0
                }
            ]
        }
        response = client.put(f"/api/v1/transactions/{transaction_id}", json=update_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "client" in response.json()["detail"].lower()


class TestProductTypeDefaults:
    """Tests pour les valeurs par défaut des types de produits."""
    
    def test_default_values_on_creation(self, client, auth_headers):
        """Test : Les valeurs par défaut sont True pour les deux types."""
        product_data = {
            "nom_produit": "Produit avec Defaults"
            # Ne pas spécifier pour_clients et pour_fournisseurs
        }
        
        response = client.post("/api/v1/produits", json=product_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["pour_clients"] is True
        assert data["pour_fournisseurs"] is True

