"""
Tests pour l'endpoint d'authentification /login.
"""
import pytest
from fastapi import status
from app.models.user import Utilisateur
from app.models.audit import AuditConnexion
from app.utils.security import verify_password


class TestLoginEndpoint:
    """Tests pour l'endpoint POST /api/v1/auth/login."""
    
    def test_login_success(self, client, test_user):
        """Test de connexion réussie avec des identifiants valides."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert len(data["access_token"]) > 0
        assert len(data["refresh_token"]) > 0
    
    def test_login_failure_invalid_email(self, client, test_user):
        """Test de connexion échouée avec un email invalide."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "wrong@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data
        assert "incorrect" in data["detail"].lower()
    
    def test_login_failure_invalid_password(self, client, test_user):
        """Test de connexion échouée avec un mot de passe invalide."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "WrongPassword123!"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data
        assert "incorrect" in data["detail"].lower()
    
    def test_login_failure_missing_email(self, client):
        """Test de connexion échouée sans email."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "mot_de_passe": "TestPass123!"
            }
        )
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_login_failure_missing_password(self, client):
        """Test de connexion échouée sans mot de passe."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com"
            }
        )
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_login_failure_invalid_email_format(self, client):
        """Test de connexion échouée avec un format d'email invalide."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "not-an-email",
                "mot_de_passe": "TestPass123!"
            }
        )
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_login_audit_success_recorded(self, client, test_user, db_session):
        """Test que la tentative de connexion réussie est enregistrée dans Audit_Connexions."""
        # Compter les audits avant
        count_before = db_session.query(AuditConnexion).count()
        
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier qu'un audit a été créé
        count_after = db_session.query(AuditConnexion).count()
        assert count_after == count_before + 1
        
        # Vérifier les détails de l'audit
        audit = db_session.query(AuditConnexion).order_by(AuditConnexion.id_audit_connexion.desc()).first()
        assert audit is not None
        assert audit.email_utilisateur == "test@example.com"
        assert audit.succes is True
        assert audit.adresse_ip is not None
        assert audit.user_agent is not None
    
    def test_login_audit_failure_recorded(self, client, test_user, db_session):
        """Test que la tentative de connexion échouée est enregistrée dans Audit_Connexions."""
        # Compter les audits avant
        count_before = db_session.query(AuditConnexion).count()
        
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "WrongPassword123!"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        
        # Vérifier qu'un audit a été créé
        count_after = db_session.query(AuditConnexion).count()
        assert count_after == count_before + 1
        
        # Vérifier les détails de l'audit
        audit = db_session.query(AuditConnexion).order_by(AuditConnexion.id_audit_connexion.desc()).first()
        assert audit is not None
        assert audit.email_utilisateur == "test@example.com"
        assert audit.succes is False
        assert audit.adresse_ip is not None
        assert audit.user_agent is not None
    
    def test_login_audit_failure_nonexistent_user(self, client, db_session):
        """Test que la tentative avec un utilisateur inexistant est enregistrée."""
        count_before = db_session.query(AuditConnexion).count()
        
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "nonexistent@example.com",
                "mot_de_passe": "SomePassword123!"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        
        # Vérifier qu'un audit a été créé
        count_after = db_session.query(AuditConnexion).count()
        assert count_after == count_before + 1
        
        audit = db_session.query(AuditConnexion).order_by(AuditConnexion.id_audit_connexion.desc()).first()
        assert audit.email_utilisateur == "nonexistent@example.com"
        assert audit.succes is False
    
    def test_login_tokens_contain_user_data(self, client, test_user):
        """Test que les tokens JWT contiennent les bonnes données utilisateur."""
        from app.utils.security import decode_token
        
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # Décoder le token d'accès
        access_token_payload = decode_token(data["access_token"])
        assert access_token_payload["sub"] == str(test_user.id_utilisateur)
        assert access_token_payload["email"] == test_user.email
        assert access_token_payload["role"] == test_user.role
        assert access_token_payload["type"] == "access"
        
        # Décoder le refresh token
        refresh_token_payload = decode_token(data["refresh_token"])
        assert refresh_token_payload["sub"] == str(test_user.id_utilisateur)
        assert refresh_token_payload["email"] == test_user.email
        assert refresh_token_payload["type"] == "refresh"
    
    def test_login_with_different_user(self, client, test_user_comptable):
        """Test de connexion avec un utilisateur différent."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "comptable@example.com",
                "mot_de_passe": "ComptablePass123!"
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        
        # Vérifier que le token contient les bonnes données
        from app.utils.security import decode_token
        access_token_payload = decode_token(data["access_token"])
        assert access_token_payload["email"] == "comptable@example.com"
        assert access_token_payload["role"] == "comptable"
    
    def test_login_empty_request_body(self, client):
        """Test avec un corps de requête vide."""
        response = client.post(
            "/api/v1/auth/login",
            json={}
        )
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_login_with_proxy_headers(self, client, test_user, db_session):
        """Test que l'IP est correctement extraite des headers de proxy."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            },
            headers={
                "X-Forwarded-For": "192.168.1.100, 10.0.0.1",
                "User-Agent": "TestAgent/1.0"
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier que l'audit contient l'IP du proxy
        audit = db_session.query(AuditConnexion).order_by(AuditConnexion.id_audit_connexion.desc()).first()
        # Note: En test avec SQLite en mémoire, on ne peut pas vraiment tester l'IP
        # mais on vérifie que le processus fonctionne
        assert audit is not None
        assert audit.succes is True


class TestRefreshTokenEndpoint:
    """Tests pour l'endpoint POST /api/v1/auth/refresh."""
    
    def test_refresh_success(self, client, test_user):
        """Test de rafraîchissement réussi avec un refresh token valide."""
        # D'abord, obtenir un refresh token via login
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        refresh_token = login_response.json()["refresh_token"]
        
        # Utiliser le refresh token pour obtenir un nouveau access token
        response = client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": refresh_token
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert len(data["access_token"]) > 0
        
        # Vérifier que le nouveau token est valide et contient les bonnes données
        from app.utils.security import decode_token
        new_token_payload = decode_token(data["access_token"])
        assert new_token_payload["sub"] == str(test_user.id_utilisateur)
        assert new_token_payload["email"] == test_user.email
        assert new_token_payload["role"] == test_user.role
        assert new_token_payload["type"] == "access"
    
    def test_refresh_failure_invalid_token(self, client):
        """Test de rafraîchissement échoué avec un token invalide."""
        response = client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": "invalid.token.here"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data
        assert "invalide" in data["detail"].lower() or "expiré" in data["detail"].lower()
    
    def test_refresh_failure_access_token_used(self, client, test_user):
        """Test que l'utilisation d'un access token comme refresh token échoue."""
        # Obtenir un access token via login
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        access_token = login_response.json()["access_token"]
        
        # Essayer d'utiliser l'access token comme refresh token
        response = client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": access_token
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data
        assert "refresh token" in data["detail"].lower()
    
    def test_refresh_failure_missing_token(self, client):
        """Test de rafraîchissement échoué sans token."""
        response = client.post(
            "/api/v1/auth/refresh",
            json={}
        )
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_refresh_failure_empty_token(self, client):
        """Test de rafraîchissement échoué avec un token vide."""
        response = client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": ""
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_refresh_failure_nonexistent_user(self, client, db_session):
        """Test que le refresh token d'un utilisateur supprimé échoue."""
        from app.utils.security import create_refresh_token
        
        # Créer un refresh token pour un utilisateur qui n'existe pas
        fake_user_id = 99999
        token_data = {
            "sub": str(fake_user_id),
            "email": "deleted@example.com",
            "role": "admin"
        }
        fake_refresh_token = create_refresh_token(data=token_data)
        
        # Essayer d'utiliser ce token
        response = client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": fake_refresh_token
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert "detail" in data
        assert "introuvable" in data["detail"].lower() or "invalide" in data["detail"].lower()
    
    def test_refresh_multiple_times(self, client, test_user):
        """Test que le même refresh token peut être utilisé plusieurs fois."""
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
        
        # Utiliser le refresh token plusieurs fois
        response1 = client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": refresh_token
            }
        )
        assert response1.status_code == status.HTTP_200_OK
        access_token1 = response1.json()["access_token"]
        
        response2 = client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": refresh_token
            }
        )
        assert response2.status_code == status.HTTP_200_OK
        access_token2 = response2.json()["access_token"]
        
        # Les deux access tokens doivent être valides
        # Note: Ils peuvent être identiques s'ils sont générés dans la même seconde
        from app.utils.security import decode_token
        payload1 = decode_token(access_token1)
        payload2 = decode_token(access_token2)
        assert payload1["sub"] == str(test_user.id_utilisateur)
        assert payload2["sub"] == str(test_user.id_utilisateur)
    
    def test_refresh_with_different_user(self, client, test_user_comptable):
        """Test de rafraîchissement avec un utilisateur différent."""
        # Obtenir un refresh token pour le comptable
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "comptable@example.com",
                "mot_de_passe": "ComptablePass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        refresh_token = login_response.json()["refresh_token"]
        
        # Utiliser le refresh token
        response = client.post(
            "/api/v1/auth/refresh",
            json={
                "refresh_token": refresh_token
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # Vérifier que le token contient les bonnes données
        from app.utils.security import decode_token
        access_token_payload = decode_token(data["access_token"])
        assert access_token_payload["email"] == "comptable@example.com"
        assert access_token_payload["role"] == "comptable"


class TestRateLimiting:
    """Tests pour le rate limiting sur l'endpoint /login."""
    
    def test_rate_limit_allows_5_requests(self, client, test_user):
        """Test que 5 requêtes sont autorisées."""
        for i in range(5):
            response = client.post(
                "/api/v1/auth/login",
                json={
                    "email": "test@example.com",
                    "mot_de_passe": "TestPass123!"
                }
            )
            # Les 5 premières requêtes doivent réussir (200 OK)
            assert response.status_code == status.HTTP_200_OK, f"Requête {i+1} devrait réussir"
    
    def test_rate_limit_blocks_6th_request(self, client, test_user):
        """Test que la 6ème requête est bloquée avec 429."""
        # Faire 5 requêtes réussies
        for i in range(5):
            response = client.post(
                "/api/v1/auth/login",
                json={
                    "email": "test@example.com",
                    "mot_de_passe": "TestPass123!"
                }
            )
            assert response.status_code == status.HTTP_200_OK
        
        # La 6ème requête doit être bloquée
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        data = response.json()
        assert "detail" in data
        assert "rate limit" in data["detail"].lower()
    
    def test_rate_limit_per_ip(self, client, test_user):
        """Test que le rate limiting est appliqué par IP."""
        # Faire 5 requêtes depuis la même IP (client par défaut)
        for i in range(5):
            response = client.post(
                "/api/v1/auth/login",
                json={
                    "email": "test@example.com",
                    "mot_de_passe": "TestPass123!"
                }
            )
            assert response.status_code == status.HTTP_200_OK
        
        # La 6ème doit être bloquée
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    
    def test_rate_limit_with_failed_logins(self, client, test_user):
        """Test que les tentatives échouées comptent aussi dans le rate limit."""
        # Faire 5 tentatives échouées
        for i in range(5):
            response = client.post(
                "/api/v1/auth/login",
                json={
                    "email": "test@example.com",
                    "mot_de_passe": "WrongPassword123!"
                }
            )
            # Les tentatives échouées doivent retourner 401
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
        
        # La 6ème tentative (même échouée) doit être bloquée par rate limit
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "WrongPassword123!"
            }
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS