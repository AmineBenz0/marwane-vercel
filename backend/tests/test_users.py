"""
Tests pour les endpoints CRUD des utilisateurs.
"""
import pytest
from fastapi import status
from app.models.user import Utilisateur
from app.utils.security import hash_password
import bcrypt


class TestUsersEndpoints:
    """Tests pour les endpoints CRUD des utilisateurs."""
    
    def test_get_users_requires_admin(self, client, test_user_comptable):
        """Test que GET /users nécessite un admin."""
        # Se connecter en tant que comptable (non-admin)
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "comptable@example.com",
                "mot_de_passe": "ComptablePass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]
        
        # Essayer d'accéder à la liste des utilisateurs
        response = client.get(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_get_users_success(self, client, test_user):
        """Test de récupération de la liste des utilisateurs par un admin."""
        # Se connecter en tant qu'admin
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]
        
        # Récupérer la liste des utilisateurs
        response = client.get(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # Au moins l'utilisateur de test
    
    def test_get_user_by_id_success(self, client, test_user):
        """Test de récupération d'un utilisateur par ID."""
        # Se connecter en tant qu'admin
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]
        
        # Récupérer l'utilisateur par ID
        response = client.get(
            f"/api/v1/users/{test_user.id_utilisateur}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id_utilisateur"] == test_user.id_utilisateur
        assert data["email"] == "test@example.com"
        assert data["nom_utilisateur"] == "Test User"
        assert "est_actif" in data
        assert data["est_actif"] is True
    
    def test_get_user_by_id_not_found(self, client, test_user):
        """Test de récupération d'un utilisateur inexistant."""
        # Se connecter en tant qu'admin
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]
        
        # Essayer de récupérer un utilisateur inexistant
        response = client.get(
            "/api/v1/users/99999",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_create_user_success(self, client, admin_token):
        """Test de création d'un nouvel utilisateur."""
        token = admin_token
        
        # Créer un nouvel utilisateur
        response = client.post(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_utilisateur": "Nouvel Utilisateur",
                "email": "nouveau@example.com",
                "mot_de_passe": "NewPass123!",
                "role": "comptable"
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["nom_utilisateur"] == "Nouvel Utilisateur"
        assert data["email"] == "nouveau@example.com"
        assert data["role"] == "comptable"
        assert data["est_actif"] is True
        assert "mot_de_passe" not in data  # Le mot de passe ne doit pas être retourné
        assert "mot_de_passe_hash" not in data
    
    def test_create_user_duplicate_email(self, client, admin_token, test_user):
        """Test de création d'un utilisateur avec un email existant."""
        token = admin_token
        
        # Essayer de créer un utilisateur avec un email existant
        response = client.post(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_utilisateur": "Autre Utilisateur",
                "email": "test@example.com",  # Email déjà utilisé
                "mot_de_passe": "NewPass123!",
                "role": "comptable"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "existe déjà" in data["detail"].lower()
    
    def test_update_user_success(self, client, admin_token, db_session):
        """Test de mise à jour d'un utilisateur."""
        token = admin_token
        
        # Créer un utilisateur à modifier
        password_hash = hash_password("UserPass123!")
        new_user = Utilisateur(
            nom_utilisateur="User à Modifier",
            email="modifier@example.com",
            mot_de_passe_hash=password_hash,
            role="comptable",
            est_actif=True
        )
        db_session.add(new_user)
        db_session.commit()
        db_session.refresh(new_user)
        
        # Mettre à jour l'utilisateur
        response = client.put(
            f"/api/v1/users/{new_user.id_utilisateur}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_utilisateur": "User Modifié",
                "role": "admin"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["nom_utilisateur"] == "User Modifié"
        assert data["role"] == "admin"
        assert data["email"] == "modifier@example.com"  # Email inchangé
    
    def test_update_user_password(self, client, admin_token, db_session):
        """Test de mise à jour du mot de passe d'un utilisateur."""
        token = admin_token
        
        # Créer un utilisateur
        password_hash = hash_password("OldPass123!")
        new_user = Utilisateur(
            nom_utilisateur="User Password",
            email="password@example.com",
            mot_de_passe_hash=password_hash,
            role="comptable",
            est_actif=True
        )
        db_session.add(new_user)
        db_session.commit()
        db_session.refresh(new_user)
        
        # Mettre à jour le mot de passe
        response = client.put(
            f"/api/v1/users/{new_user.id_utilisateur}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "mot_de_passe": "NewPass123!"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier que le nouveau mot de passe fonctionne
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "password@example.com",
                "mot_de_passe": "NewPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
    
    def test_delete_user_soft_delete(self, client, admin_token, test_user, db_session):
        """Test de suppression (soft delete) d'un utilisateur."""
        token = admin_token
        
        # Créer un utilisateur à supprimer
        password_hash = hash_password("DeletePass123!")
        user_to_delete = Utilisateur(
            nom_utilisateur="User à Supprimer",
            email="delete@example.com",
            mot_de_passe_hash=password_hash,
            role="comptable",
            est_actif=True
        )
        db_session.add(user_to_delete)
        db_session.commit()
        db_session.refresh(user_to_delete)
        user_id = user_to_delete.id_utilisateur
        
        # Supprimer l'utilisateur (soft delete)
        response = client.delete(
            f"/api/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Vérifier que l'utilisateur n'est plus dans la liste
        response = client.get(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        users = response.json()
        user_ids = [u["id_utilisateur"] for u in users]
        assert user_id not in user_ids
        
        # Vérifier que l'utilisateur est marqué comme inactif dans la base de données
        db_session.refresh(user_to_delete)
        assert user_to_delete.est_actif is False
    
    def test_delete_user_cannot_delete_self(self, client, admin_token, test_user):
        """Test qu'un utilisateur ne peut pas se supprimer lui-même."""
        token = admin_token
        
        # Essayer de se supprimer soi-même
        response = client.delete(
            f"/api/v1/users/{test_user.id_utilisateur}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "propre compte" in data["detail"].lower()
    
    def test_get_users_only_active(self, client, admin_token, db_session):
        """Test que GET /users ne retourne que les utilisateurs actifs."""
        token = admin_token
        
        # Créer un utilisateur inactif
        password_hash = hash_password("InactivePass123!")
        inactive_user = Utilisateur(
            nom_utilisateur="User Inactif",
            email="inactive@example.com",
            mot_de_passe_hash=password_hash,
            role="comptable",
            est_actif=False
        )
        db_session.add(inactive_user)
        db_session.commit()
        db_session.refresh(inactive_user)
        
        # Récupérer la liste des utilisateurs
        response = client.get(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        users = response.json()
        user_ids = [u["id_utilisateur"] for u in users]
        assert inactive_user.id_utilisateur not in user_ids

