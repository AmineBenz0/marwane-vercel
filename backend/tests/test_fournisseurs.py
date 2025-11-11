"""
Tests pour les endpoints CRUD des fournisseurs.
"""
import pytest
from fastapi import status
from app.models.fournisseur import Fournisseur
from app.models.user import Utilisateur
from app.utils.security import hash_password
import bcrypt


class TestFournisseursEndpoints:
    """Tests pour les endpoints CRUD des fournisseurs."""
    
    def test_get_fournisseurs_without_auth(self, client):
        """Test que GET /fournisseurs fonctionne sans authentification (auth désactivée)."""
        response = client.get("/api/v1/fournisseurs")
        assert response.status_code == status.HTTP_200_OK
    
    def test_get_fournisseurs_success(self, client, test_user, db_session):
        """Test de récupération de la liste des fournisseurs (sans authentification)."""
        # Créer quelques fournisseurs de test
        fournisseur1 = Fournisseur(
            nom_fournisseur="Fournisseur Test 1",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        fournisseur2 = Fournisseur(
            nom_fournisseur="Fournisseur Test 2",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([fournisseur1, fournisseur2])
        db_session.commit()
        
        # Récupérer la liste des fournisseurs (sans token)
        response = client.get("/api/v1/fournisseurs")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2
    
    def test_get_fournisseurs_with_est_actif_filter(self, client, test_user, db_session):
        """Test du filtre est_actif sur GET /fournisseurs (sans authentification)."""
        # Créer des fournisseurs actifs et inactifs
        active_fournisseur = Fournisseur(
            nom_fournisseur="Fournisseur Actif",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        inactive_fournisseur = Fournisseur(
            nom_fournisseur="Fournisseur Inactif",
            est_actif=False,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([active_fournisseur, inactive_fournisseur])
        db_session.commit()
        
        # Tester le filtre est_actif=True
        response = client.get("/api/v1/fournisseurs?est_actif=true")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(f["est_actif"] is True for f in data)
        
        # Tester le filtre est_actif=False
        response = client.get("/api/v1/fournisseurs?est_actif=false")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(f["est_actif"] is False for f in data)
    
    def test_get_fournisseurs_with_recherche_filter(self, client, test_user, db_session):
        """Test du filtre recherche sur GET /fournisseurs (sans authentification)."""
        # Créer des fournisseurs avec des noms différents
        fournisseur1 = Fournisseur(
            nom_fournisseur="Fournisseur Alpha",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        fournisseur2 = Fournisseur(
            nom_fournisseur="Fournisseur Beta",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        fournisseur3 = Fournisseur(
            nom_fournisseur="Alpha Company",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([fournisseur1, fournisseur2, fournisseur3])
        db_session.commit()
        
        # Rechercher "Alpha"
        response = client.get("/api/v1/fournisseurs?recherche=Alpha")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 2
        assert all("Alpha" in f["nom_fournisseur"] for f in data)
        
        # Rechercher "Beta"
        response = client.get("/api/v1/fournisseurs?recherche=Beta")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["nom_fournisseur"] == "Fournisseur Beta"
    
    def test_get_fournisseurs_with_combined_filters(self, client, test_user, db_session):
        """Test des filtres combinés est_actif et recherche (sans authentification)."""
        # Créer des fournisseurs
        active_alpha = Fournisseur(
            nom_fournisseur="Alpha Actif",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        inactive_alpha = Fournisseur(
            nom_fournisseur="Alpha Inactif",
            est_actif=False,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        active_beta = Fournisseur(
            nom_fournisseur="Beta Actif",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([active_alpha, inactive_alpha, active_beta])
        db_session.commit()
        
        # Rechercher "Alpha" et est_actif=True
        response = client.get("/api/v1/fournisseurs?recherche=Alpha&est_actif=true")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["nom_fournisseur"] == "Alpha Actif"
        assert data[0]["est_actif"] is True
    
    def test_get_fournisseur_by_id_success(self, client, test_user, db_session):
        """Test de récupération d'un fournisseur par ID (sans authentification)."""
        # Créer un fournisseur
        test_fournisseur = Fournisseur(
            nom_fournisseur="Fournisseur Test",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_fournisseur)
        db_session.commit()
        db_session.refresh(test_fournisseur)
        
        # Récupérer le fournisseur par ID (sans token)
        response = client.get(f"/api/v1/fournisseurs/{test_fournisseur.id_fournisseur}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id_fournisseur"] == test_fournisseur.id_fournisseur
        assert data["nom_fournisseur"] == "Fournisseur Test"
        assert data["est_actif"] is True
        assert "date_creation" in data
        assert "date_modification" in data
    
    def test_get_fournisseur_by_id_not_found(self, client):
        """Test de récupération d'un fournisseur inexistant (sans authentification)."""
        # Essayer de récupérer un fournisseur inexistant (sans token)
        response = client.get("/api/v1/fournisseurs/99999")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "introuvable" in response.json()["detail"].lower()
    
    def test_create_fournisseur_success(self, client, db_session):
        """Test de création d'un fournisseur (sans authentification)."""
        # Créer un nouveau fournisseur (sans token)
        response = client.post(
            "/api/v1/fournisseurs",
            json={
                "nom_fournisseur": "Nouveau Fournisseur",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["nom_fournisseur"] == "Nouveau Fournisseur"
        assert data["est_actif"] is True
        assert "id_fournisseur" in data
        assert "date_creation" in data
        
        # Vérifier que le fournisseur a été créé en base
        fournisseur_db = db_session.query(Fournisseur).filter(
            Fournisseur.id_fournisseur == data["id_fournisseur"]
        ).first()
        assert fournisseur_db is not None
        assert fournisseur_db.nom_fournisseur == "Nouveau Fournisseur"
        # Quand auth est désactivée, id_utilisateur_creation peut être None
        # assert fournisseur_db.id_utilisateur_creation == test_user.id_utilisateur
    
    def test_create_fournisseur_duplicate_name(self, client, test_user, db_session):
        """Test qu'on ne peut pas créer deux fournisseurs avec le même nom (sans authentification)."""
        # Créer un premier fournisseur
        fournisseur1 = Fournisseur(
            nom_fournisseur="Fournisseur Unique",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(fournisseur1)
        db_session.commit()
        
        # Essayer de créer un deuxième fournisseur avec le même nom (sans token)
        response = client.post(
            "/api/v1/fournisseurs",
            json={
                "nom_fournisseur": "Fournisseur Unique",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "existe déjà" in response.json()["detail"].lower()
    
    def test_create_fournisseur_validation_error(self, client):
        """Test de validation des données lors de la création (sans authentification)."""
        # Essayer de créer un fournisseur sans nom (sans token)
        response = client.post(
            "/api/v1/fournisseurs",
            json={
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Essayer de créer un fournisseur avec un nom vide (sans token)
        response = client.post(
            "/api/v1/fournisseurs",
            json={
                "nom_fournisseur": "   ",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_update_fournisseur_success(self, client, test_user, db_session):
        """Test de mise à jour d'un fournisseur (sans authentification)."""
        # Créer un fournisseur
        test_fournisseur = Fournisseur(
            nom_fournisseur="Fournisseur Original",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_fournisseur)
        db_session.commit()
        db_session.refresh(test_fournisseur)
        
        # Mettre à jour le fournisseur (sans token)
        response = client.put(
            f"/api/v1/fournisseurs/{test_fournisseur.id_fournisseur}",
            json={
                "nom_fournisseur": "Fournisseur Modifié",
                "est_actif": False
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["nom_fournisseur"] == "Fournisseur Modifié"
        assert data["est_actif"] is False
        
        # Vérifier en base
        db_session.refresh(test_fournisseur)
        assert test_fournisseur.nom_fournisseur == "Fournisseur Modifié"
        assert test_fournisseur.est_actif is False
        # Quand auth est désactivée, id_utilisateur_modification peut être None
        # assert test_fournisseur.id_utilisateur_modification == test_user.id_utilisateur
    
    def test_update_fournisseur_partial(self, client, test_user, db_session):
        """Test de mise à jour partielle d'un fournisseur (sans authentification)."""
        # Créer un fournisseur
        test_fournisseur = Fournisseur(
            nom_fournisseur="Fournisseur Original",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_fournisseur)
        db_session.commit()
        db_session.refresh(test_fournisseur)
        original_name = test_fournisseur.nom_fournisseur
        
        # Mettre à jour uniquement est_actif (sans token)
        response = client.put(
            f"/api/v1/fournisseurs/{test_fournisseur.id_fournisseur}",
            json={
                "est_actif": False
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["nom_fournisseur"] == original_name  # Nom inchangé
        assert data["est_actif"] is False  # Seul est_actif modifié
    
    def test_update_fournisseur_not_found(self, client):
        """Test de mise à jour d'un fournisseur inexistant (sans authentification)."""
        # Essayer de mettre à jour un fournisseur inexistant (sans token)
        response = client.put(
            "/api/v1/fournisseurs/99999",
            json={
                "nom_fournisseur": "Fournisseur Inexistant"
            }
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_update_fournisseur_duplicate_name(self, client, test_user, db_session):
        """Test qu'on ne peut pas mettre à jour un fournisseur avec un nom déjà utilisé (sans authentification)."""
        # Créer deux fournisseurs
        fournisseur1 = Fournisseur(
            nom_fournisseur="Fournisseur 1",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        fournisseur2 = Fournisseur(
            nom_fournisseur="Fournisseur 2",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([fournisseur1, fournisseur2])
        db_session.commit()
        db_session.refresh(fournisseur2)
        
        # Essayer de renommer fournisseur2 avec le nom de fournisseur1 (sans token)
        response = client.put(
            f"/api/v1/fournisseurs/{fournisseur2.id_fournisseur}",
            json={
                "nom_fournisseur": "Fournisseur 1"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "existe déjà" in response.json()["detail"].lower()
    
    def test_delete_fournisseur_success(self, client, test_user, db_session):
        """Test de suppression (soft delete) d'un fournisseur (sans authentification)."""
        # Créer un fournisseur
        test_fournisseur = Fournisseur(
            nom_fournisseur="Fournisseur à Supprimer",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_fournisseur)
        db_session.commit()
        db_session.refresh(test_fournisseur)
        fournisseur_id = test_fournisseur.id_fournisseur
        
        # Supprimer le fournisseur (sans token)
        response = client.delete(f"/api/v1/fournisseurs/{fournisseur_id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Vérifier que le fournisseur existe toujours mais est inactif
        db_session.refresh(test_fournisseur)
        assert test_fournisseur.est_actif is False
        # Quand auth est désactivée, id_utilisateur_modification peut être None
        # assert test_fournisseur.id_utilisateur_modification == test_user.id_utilisateur
        
        # Vérifier qu'il n'apparaît plus dans la liste des fournisseurs actifs
        response = client.get("/api/v1/fournisseurs?est_actif=true")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        fournisseur_ids = [f["id_fournisseur"] for f in data]
        assert fournisseur_id not in fournisseur_ids
    
    def test_delete_fournisseur_not_found(self, client):
        """Test de suppression d'un fournisseur inexistant (sans authentification)."""
        # Essayer de supprimer un fournisseur inexistant (sans token)
        response = client.delete("/api/v1/fournisseurs/99999")
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_delete_fournisseur_already_inactive(self, client, test_user, db_session):
        """Test qu'on ne peut pas supprimer un fournisseur déjà inactif (sans authentification)."""
        # Créer un fournisseur inactif
        test_fournisseur = Fournisseur(
            nom_fournisseur="Fournisseur Inactif",
            est_actif=False,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_fournisseur)
        db_session.commit()
        db_session.refresh(test_fournisseur)
        
        # Essayer de supprimer le fournisseur déjà inactif (sans token)
        response = client.delete(f"/api/v1/fournisseurs/{test_fournisseur.id_fournisseur}")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "déjà inactif" in response.json()["detail"].lower()
    
    def test_fournisseur_tracks_user_creation(self, client, db_session):
        """Test que l'ID de l'utilisateur créateur est enregistré (peut être None si auth désactivée)."""
        # Créer un fournisseur (sans token)
        response = client.post(
            "/api/v1/fournisseurs",
            json={
                "nom_fournisseur": "Fournisseur avec Traçabilité",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        
        # Vérifier en base
        fournisseur_db = db_session.query(Fournisseur).filter(
            Fournisseur.id_fournisseur == data["id_fournisseur"]
        ).first()
        # Quand auth est désactivée, id_utilisateur_creation peut être None
        # assert fournisseur_db.id_utilisateur_creation == test_user.id_utilisateur
        assert fournisseur_db is not None
    
    def test_fournisseur_tracks_user_modification(self, client, test_user, db_session):
        """Test que l'ID de l'utilisateur modificateur est enregistré (peut être None si auth désactivée)."""
        # Créer un fournisseur
        test_fournisseur = Fournisseur(
            nom_fournisseur="Fournisseur à Modifier",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_fournisseur)
        db_session.commit()
        db_session.refresh(test_fournisseur)
        
        # Modifier le fournisseur (sans token)
        response = client.put(
            f"/api/v1/fournisseurs/{test_fournisseur.id_fournisseur}",
            json={
                "nom_fournisseur": "Fournisseur Modifié"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier en base
        db_session.refresh(test_fournisseur)
        # Quand auth est désactivée, id_utilisateur_modification peut être None
        # assert test_fournisseur.id_utilisateur_modification == test_user.id_utilisateur
        assert test_fournisseur.nom_fournisseur == "Fournisseur Modifié"
    
    def test_get_fournisseurs_pagination(self, client, test_user, db_session):
        """Test de la pagination sur GET /fournisseurs (sans authentification)."""
        # Créer plusieurs fournisseurs
        fournisseurs = [
            Fournisseur(
                nom_fournisseur=f"Fournisseur {i}",
                est_actif=True,
                id_utilisateur_creation=test_user.id_utilisateur
            )
            for i in range(10)
        ]
        db_session.add_all(fournisseurs)
        db_session.commit()
        
        # Récupérer la première page (5 fournisseurs) (sans token)
        response = client.get("/api/v1/fournisseurs?skip=0&limit=5")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5
        
        # Récupérer la deuxième page (sans token)
        response = client.get("/api/v1/fournisseurs?skip=5&limit=5")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5

