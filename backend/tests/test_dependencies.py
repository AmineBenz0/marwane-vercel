"""
Tests pour les dépendances d'authentification.
Vérifie que get_current_user, get_current_active_user et get_current_admin_user fonctionnent correctement.
"""
import pytest
from fastapi import APIRouter, Depends, status

from app.models.user import Utilisateur
from app.utils.dependencies import (
    get_current_user,
    get_current_active_user,
    get_current_admin_user
)
from app.utils.security import create_access_token


# Router de test pour tester les dépendances
# Il sera inclus dans conftest.py via une fixture
test_router = APIRouter()


@test_router.get("/test/current-user")
def current_user_route(current_user: Utilisateur = Depends(get_current_user)):
    """Route de test pour get_current_user."""
    return {
        "user_id": current_user.id_utilisateur,
        "email": current_user.email,
        "role": current_user.role
    }


@test_router.get("/test/active-user")
def active_user_route(user: Utilisateur = Depends(get_current_active_user)):
    """Route de test pour get_current_active_user."""
    return {
        "user_id": user.id_utilisateur,
        "email": user.email,
        "role": user.role
    }


@test_router.get("/test/admin-user")
def admin_user_route(admin: Utilisateur = Depends(get_current_admin_user)):
    """Route de test pour get_current_admin_user."""
    return {
        "user_id": admin.id_utilisateur,
        "email": admin.email,
        "role": admin.role
    }


class TestGetCurrentUser:
    """Tests pour la dépendance get_current_user."""
    
    def test_get_current_user_with_valid_token(self, client, test_user):
        """Test que get_current_user retourne l'utilisateur avec un token valide."""
        # Obtenir un token valide
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        access_token = login_response.json()["access_token"]
        
        # Tester la route protégée
        response = client.get(
            "/test/current-user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["user_id"] == test_user.id_utilisateur
        assert data["email"] == test_user.email
        assert data["role"] == test_user.role
    
    def test_get_current_user_without_token(self, client):
        """Test que get_current_user retourne 401 sans token."""
        response = client.get("/test/current-user")
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data
    
    def test_get_current_user_with_invalid_token(self, client):
        """Test que get_current_user retourne 401 avec un token invalide."""
        response = client.get(
            "/test/current-user",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data
    
    def test_get_current_user_with_refresh_token(self, client, test_user):
        """Test que get_current_user retourne 401 avec un refresh token."""
        # Obtenir un refresh token
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        refresh_token = login_response.json()["refresh_token"]
        
        # Essayer d'utiliser le refresh token comme access token
        response = client.get(
            "/test/current-user",
            headers={"Authorization": f"Bearer {refresh_token}"}
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data
        # Le message peut être en français ou anglais
        detail_lower = data["detail"].lower()
        assert "access" in detail_lower or "accès" in detail_lower or "token" in detail_lower
    
    def test_get_current_user_with_expired_token(self, client, test_user):
        """Test que get_current_user retourne 401 avec un token expiré."""
        from datetime import timedelta
        
        # Créer un token expiré
        token_data = {
            "sub": str(test_user.id_utilisateur),
            "email": test_user.email,
            "role": test_user.role
        }
        expired_token = create_access_token(token_data, expires_delta=timedelta(minutes=-1))
        
        # Attendre un peu pour s'assurer que le token est expiré
        import time
        time.sleep(1)
        
        response = client.get(
            "/test/current-user",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data
    
    def test_get_current_user_with_nonexistent_user(self, client, db_session):
        """Test que get_current_user retourne 401 si l'utilisateur n'existe pas."""
        # Créer un token pour un utilisateur qui n'existe pas
        token_data = {
            "sub": "99999",
            "email": "nonexistent@example.com",
            "role": "admin"
        }
        fake_token = create_access_token(token_data)
        
        response = client.get(
            "/test/current-user",
            headers={"Authorization": f"Bearer {fake_token}"}
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data


class TestGetCurrentActiveUser:
    """Tests pour la dépendance get_current_active_user."""
    
    def test_get_current_active_user_with_valid_token(self, client, test_user):
        """Test que get_current_active_user retourne l'utilisateur avec un token valide."""
        # Obtenir un token valide
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        access_token = login_response.json()["access_token"]
        
        # Tester la route protégée
        response = client.get(
            "/test/active-user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["user_id"] == test_user.id_utilisateur
        assert data["email"] == test_user.email
    
    def test_get_current_active_user_without_token(self, client):
        """Test que get_current_active_user retourne 401 sans token."""
        response = client.get("/test/active-user")
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestGetCurrentAdminUser:
    """Tests pour la dépendance get_current_admin_user."""
    
    def test_get_current_admin_user_with_admin_token(self, client, test_user):
        """Test que get_current_admin_user retourne l'utilisateur avec un token admin."""
        # Obtenir un token valide (test_user a le rôle admin)
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        access_token = login_response.json()["access_token"]
        
        # Tester la route protégée
        response = client.get(
            "/test/admin-user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["user_id"] == test_user.id_utilisateur
        assert data["email"] == test_user.email
        assert data["role"] == "admin"
    
    def test_get_current_admin_user_with_non_admin_token(self, client, test_user_comptable):
        """Test que get_current_admin_user retourne 403 avec un token non-admin."""
        # Obtenir un token pour un utilisateur comptable (non-admin)
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "comptable@example.com",
                "mot_de_passe": "ComptablePass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        access_token = login_response.json()["access_token"]
        
        # Tester la route protégée (devrait échouer avec 403)
        response = client.get(
            "/test/admin-user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        data = response.json()
        assert "detail" in data
        assert "admin" in data["detail"].lower() or "refusé" in data["detail"].lower()
    
    def test_get_current_admin_user_without_role(self, client, db_session):
        """Test que get_current_admin_user retourne 403 si l'utilisateur n'a pas de rôle."""
        import bcrypt
        import time
        
        # Créer un utilisateur sans rôle
        password = "NoRolePass123!"
        password_bytes = password.encode('utf-8')
        salt = bcrypt.gensalt()
        password_hash = bcrypt.hashpw(password_bytes, salt).decode('utf-8')
        
        user_no_role = Utilisateur(
            nom_utilisateur="No Role User",
            email="norole@example.com",
            mot_de_passe_hash=password_hash,
            role=None
        )
        db_session.add(user_no_role)
        db_session.commit()
        db_session.refresh(user_no_role)
        
        # Attendre un peu pour éviter le rate limiting
        time.sleep(1)
        
        # Obtenir un token pour cet utilisateur
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "norole@example.com",
                "mot_de_passe": "NoRolePass123!"
            }
        )
        # Accepter soit 200 (succès) soit 429 (rate limit) - dans ce cas, créer le token manuellement
        if login_response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            # Créer le token manuellement pour éviter le rate limiting
            from app.utils.security import create_access_token
            token_data = {
                "sub": str(user_no_role.id_utilisateur),
                "email": user_no_role.email,
                "role": user_no_role.role
            }
            access_token = create_access_token(token_data)
        else:
            assert login_response.status_code == status.HTTP_200_OK
            access_token = login_response.json()["access_token"]
        
        # Tester la route protégée (devrait échouer avec 403)
        response = client.get(
            "/test/admin-user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        data = response.json()
        assert "detail" in data
        assert "admin" in data["detail"].lower() or "refusé" in data["detail"].lower()
    
    def test_get_current_admin_user_without_token(self, client):
        """Test que get_current_admin_user retourne 401 sans token."""
        response = client.get("/test/admin-user")
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

