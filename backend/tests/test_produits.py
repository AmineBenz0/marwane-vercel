"""
Tests pour les endpoints CRUD des produits.
"""
import pytest
from fastapi import status
from app.models.produit import Produit
from app.models.user import Utilisateur
from app.config import settings




class TestProduitsEndpoints:
    """Tests pour les endpoints CRUD des produits."""
    
    def test_get_produits_auth_behavior(self, client):
        """Test du comportement de GET /produits selon ENABLE_AUTH."""
        response = client.get("/api/v1/produits")
        if settings.ENABLE_AUTH:
            # Si auth activée, doit retourner 401
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
        else:
            # Si auth désactivée, doit retourner 200 (même liste vide)
            assert response.status_code == status.HTTP_200_OK
    
    def test_get_produits_success(self, client, test_user, db_session, auth_headers):
        """Test de récupération de la liste des produits."""
        # Créer quelques produits de test
        produit1 = Produit(
            nom_produit="Produit Test 1",
            est_actif=True
        )
        produit2 = Produit(
            nom_produit="Produit Test 2",
            est_actif=True
        )
        db_session.add_all([produit1, produit2])
        db_session.commit()
        
        # Récupérer la liste des produits
        response = client.get(
            "/api/v1/produits",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2
    
    def test_get_produits_with_est_actif_filter(self, client, test_user, db_session, auth_headers):
        """Test du filtre est_actif sur GET /produits."""
        
        # Créer des produits actifs et inactifs
        active_produit = Produit(
            nom_produit="Produit Actif",
            est_actif=True
        )
        inactive_produit = Produit(
            nom_produit="Produit Inactif",
            est_actif=False
        )
        db_session.add_all([active_produit, inactive_produit])
        db_session.commit()
        
        # Tester le filtre est_actif=True
        response = client.get(
            "/api/v1/produits?est_actif=true",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(p["est_actif"] is True for p in data)
        
        # Tester le filtre est_actif=False
        response = client.get(
            "/api/v1/produits?est_actif=false",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(p["est_actif"] is False for p in data)
    
    def test_get_produits_with_recherche_filter(self, client, test_user, db_session, auth_headers):
        """Test du filtre recherche sur GET /produits."""
        
        # Créer des produits avec des noms différents
        produit1 = Produit(
            nom_produit="Produit Alpha",
            est_actif=True
        )
        produit2 = Produit(
            nom_produit="Produit Beta",
            est_actif=True
        )
        produit3 = Produit(
            nom_produit="Alpha Company",
            est_actif=True
        )
        db_session.add_all([produit1, produit2, produit3])
        db_session.commit()
        
        # Rechercher "Alpha"
        response = client.get(
            "/api/v1/produits?recherche=Alpha",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 2
        assert all("Alpha" in p["nom_produit"] for p in data)
        
        # Rechercher "Beta"
        response = client.get(
            "/api/v1/produits?recherche=Beta",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["nom_produit"] == "Produit Beta"
    
    def test_get_produits_with_combined_filters(self, client, test_user, db_session, auth_headers):
        """Test des filtres combinés est_actif et recherche."""
        
        # Créer des produits
        active_alpha = Produit(
            nom_produit="Alpha Actif",
            est_actif=True
        )
        inactive_alpha = Produit(
            nom_produit="Alpha Inactif",
            est_actif=False
        )
        active_beta = Produit(
            nom_produit="Beta Actif",
            est_actif=True
        )
        db_session.add_all([active_alpha, inactive_alpha, active_beta])
        db_session.commit()
        
        # Rechercher "Alpha" et est_actif=True
        response = client.get(
            "/api/v1/produits?recherche=Alpha&est_actif=true",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["nom_produit"] == "Alpha Actif"
        assert data[0]["est_actif"] is True
    
    def test_get_produit_by_id_success(self, client, test_user, db_session, auth_headers):
        """Test de récupération d'un produit par ID."""
        
        # Créer un produit
        test_produit = Produit(
            nom_produit="Produit Test",
            est_actif=True
        )
        db_session.add(test_produit)
        db_session.commit()
        db_session.refresh(test_produit)
        
        # Récupérer le produit par ID
        response = client.get(
            f"/api/v1/produits/{test_produit.id_produit}",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id_produit"] == test_produit.id_produit
        assert data["nom_produit"] == "Produit Test"
        assert data["est_actif"] is True
    
    def test_get_produit_by_id_not_found(self, client, test_user, auth_headers):
        """Test de récupération d'un produit inexistant."""
        
        # Essayer de récupérer un produit inexistant
        response = client.get(
            "/api/v1/produits/99999",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "introuvable" in response.json()["detail"].lower()
    
    def test_create_produit_success(self, client, test_user, db_session, auth_headers):
        """Test de création d'un produit."""
        
        # Créer un nouveau produit
        response = client.post(
            "/api/v1/produits",
            headers=auth_headers,
            json={
                "nom_produit": "Nouveau Produit",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["nom_produit"] == "Nouveau Produit"
        assert data["est_actif"] is True
        assert "id_produit" in data
        
        # Vérifier que le produit a été créé en base
        produit_db = db_session.query(Produit).filter(
            Produit.id_produit == data["id_produit"]
        ).first()
        assert produit_db is not None
        assert produit_db.nom_produit == "Nouveau Produit"
    
    def test_create_produit_duplicate_name(self, client, test_user, db_session, auth_headers):
        """Test qu'on ne peut pas créer deux produits avec le même nom."""
        
        # Créer un premier produit
        produit1 = Produit(
            nom_produit="Produit Unique",
            est_actif=True
        )
        db_session.add(produit1)
        db_session.commit()
        
        # Essayer de créer un deuxième produit avec le même nom
        response = client.post(
            "/api/v1/produits",
            headers=auth_headers,
            json={
                "nom_produit": "Produit Unique",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "existe déjà" in response.json()["detail"].lower()
    
    def test_create_produit_validation_error(self, client, test_user, auth_headers):
        """Test de validation des données lors de la création."""
        
        # Essayer de créer un produit sans nom
        response = client.post(
            "/api/v1/produits",
            headers=auth_headers,
            json={
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Essayer de créer un produit avec un nom vide
        response = client.post(
            "/api/v1/produits",
            headers=auth_headers,
            json={
                "nom_produit": "   ",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_update_produit_success(self, client, test_user, db_session, auth_headers):
        """Test de mise à jour d'un produit."""
        
        # Créer un produit
        test_produit = Produit(
            nom_produit="Produit Original",
            est_actif=True
        )
        db_session.add(test_produit)
        db_session.commit()
        db_session.refresh(test_produit)
        
        # Mettre à jour le produit
        response = client.put(
            f"/api/v1/produits/{test_produit.id_produit}",
            headers=auth_headers,
            json={
                "nom_produit": "Produit Modifié",
                "est_actif": False
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["nom_produit"] == "Produit Modifié"
        assert data["est_actif"] is False
        
        # Vérifier en base
        db_session.refresh(test_produit)
        assert test_produit.nom_produit == "Produit Modifié"
        assert test_produit.est_actif is False
    
    def test_update_produit_partial(self, client, test_user, db_session, auth_headers):
        """Test de mise à jour partielle d'un produit."""
        
        # Créer un produit
        test_produit = Produit(
            nom_produit="Produit Original",
            est_actif=True
        )
        db_session.add(test_produit)
        db_session.commit()
        db_session.refresh(test_produit)
        original_name = test_produit.nom_produit
        
        # Mettre à jour uniquement est_actif
        response = client.put(
            f"/api/v1/produits/{test_produit.id_produit}",
            headers=auth_headers,
            json={
                "est_actif": False
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["nom_produit"] == original_name  # Nom inchangé
        assert data["est_actif"] is False  # Seul est_actif modifié
    
    def test_update_produit_not_found(self, client, test_user, auth_headers):
        """Test de mise à jour d'un produit inexistant."""
        
        # Essayer de mettre à jour un produit inexistant
        response = client.put(
            "/api/v1/produits/99999",
            headers=auth_headers,
            json={
                "nom_produit": "Produit Inexistant"
            }
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_update_produit_duplicate_name(self, client, test_user, db_session, auth_headers):
        """Test qu'on ne peut pas mettre à jour un produit avec un nom déjà utilisé."""
        
        # Créer deux produits
        produit1 = Produit(
            nom_produit="Produit 1",
            est_actif=True
        )
        produit2 = Produit(
            nom_produit="Produit 2",
            est_actif=True
        )
        db_session.add_all([produit1, produit2])
        db_session.commit()
        db_session.refresh(produit2)
        
        # Essayer de renommer produit2 avec le nom de produit1
        response = client.put(
            f"/api/v1/produits/{produit2.id_produit}",
            headers=auth_headers,
            json={
                "nom_produit": "Produit 1"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "existe déjà" in response.json()["detail"].lower()
    
    def test_delete_produit_success(self, client, test_user, db_session, auth_headers):
        """Test de suppression (soft delete) d'un produit."""
        
        # Créer un produit
        test_produit = Produit(
            nom_produit="Produit à Supprimer",
            est_actif=True
        )
        db_session.add(test_produit)
        db_session.commit()
        db_session.refresh(test_produit)
        produit_id = test_produit.id_produit
        
        # Supprimer le produit
        response = client.delete(
            f"/api/v1/produits/{produit_id}",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Vérifier que le produit existe toujours mais est inactif
        db_session.refresh(test_produit)
        assert test_produit.est_actif is False
        
        # Vérifier qu'il n'apparaît plus dans la liste des produits actifs
        response = client.get(
            "/api/v1/produits?est_actif=true",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        produit_ids = [p["id_produit"] for p in data]
        assert produit_id not in produit_ids
    
    def test_delete_produit_not_found(self, client, test_user, auth_headers):
        """Test de suppression d'un produit inexistant."""
        
        # Essayer de supprimer un produit inexistant
        response = client.delete(
            "/api/v1/produits/99999",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_delete_produit_already_inactive(self, client, test_user, db_session, auth_headers):
        """Test qu'on ne peut pas supprimer un produit déjà inactif."""
        
        # Créer un produit inactif
        test_produit = Produit(
            nom_produit="Produit Inactif",
            est_actif=False
        )
        db_session.add(test_produit)
        db_session.commit()
        db_session.refresh(test_produit)
        
        # Essayer de supprimer le produit déjà inactif
        response = client.delete(
            f"/api/v1/produits/{test_produit.id_produit}",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "déjà inactif" in response.json()["detail"].lower()
    
    def test_get_produits_pagination(self, client, test_user, db_session, auth_headers):
        """Test de la pagination sur GET /produits."""
        
        # Créer plusieurs produits
        produits = [
            Produit(
                nom_produit=f"Produit {i}",
                est_actif=True
            )
            for i in range(10)
        ]
        db_session.add_all(produits)
        db_session.commit()
        
        # Récupérer la première page (5 produits)
        response = client.get(
            "/api/v1/produits?skip=0&limit=5",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5
        
        # Récupérer la deuxième page
        response = client.get(
            "/api/v1/produits?skip=5&limit=5",
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5

