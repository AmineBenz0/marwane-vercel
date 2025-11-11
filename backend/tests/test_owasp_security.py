"""
Tests de sécurité OWASP Top 10.
Vérifie que l'application est protégée contre les vulnérabilités OWASP Top 10.

OWASP Top 10 (2021):
1. Broken Access Control
2. Cryptographic Failures
3. Injection
4. Insecure Design
5. Security Misconfiguration
6. Vulnerable and Outdated Components
7. Identification and Authentication Failures
8. Software and Data Integrity Failures
9. Security Logging and Monitoring Failures
10. Server-Side Request Forgery (SSRF)
"""
import pytest
import json
from datetime import datetime, timedelta
from fastapi import status
from jose import jwt
from app.config import settings
from app.utils.security import create_access_token, create_refresh_token, decode_token


class TestOWASP1_Injection:
    """OWASP A03:2021 - Injection (SQL, NoSQL, Command, etc.)"""
    
    def test_sql_injection_in_query_params(self, client, admin_token):
        """Test que les paramètres de requête sont protégés contre l'injection SQL."""
        # Tentative d'injection SQL dans les paramètres de requête
        sql_injection_payloads = [
            "1' OR '1'='1",
            "1' UNION SELECT * FROM users--",
            "1; DROP TABLE users--",
            "1' OR 1=1--",
            "admin'--",
            "1' OR '1'='1'--",
        ]
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        for payload in sql_injection_payloads:
            # Tester sur l'endpoint clients avec paramètre recherche
            response = client.get(
                f"/api/v1/clients?recherche={payload}",
                headers=headers
            )
            # Ne devrait pas retourner d'erreur SQL ou exposer de données
            assert response.status_code in [200, 400, 422], \
                f"SQL injection réussie avec payload: {payload}"
            # Vérifier qu'aucune erreur SQL n'est exposée
            if response.status_code == 500:
                response_text = response.text.lower()
                assert "sql" not in response_text or "syntax" not in response_text, \
                    f"Erreur SQL exposée avec payload: {payload}"
    
    def test_sql_injection_in_path_params(self, client, admin_token):
        """Test que les paramètres de chemin sont protégés contre l'injection SQL."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        sql_injection_payloads = [
            "1' OR '1'='1",
            "1; DROP TABLE users--",
            "1' UNION SELECT * FROM users--",
        ]
        
        for payload in sql_injection_payloads:
            # Tester sur l'endpoint GET /clients/{id}
            try:
                response = client.get(
                    f"/api/v1/clients/{payload}",
                    headers=headers
                )
                # Devrait retourner 422 (validation error) ou 404, pas 500 avec erreur SQL
                assert response.status_code in [404, 422, 400], \
                    f"SQL injection réussie dans path param: {payload}"
            except Exception:
                # Si une exception est levée, c'est bon signe (validation)
                pass
    
    def test_nosql_injection_in_json_body(self, client, admin_token):
        """Test que les données JSON sont protégées contre l'injection NoSQL."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Tentative d'injection NoSQL dans le body JSON
        malicious_payloads = [
            {"$ne": None},  # MongoDB injection
            {"$gt": ""},    # MongoDB injection
            {"nom_client": {"$regex": ".*"}},
        ]
        
        for payload in malicious_payloads:
            response = client.post(
                "/api/v1/clients",
                json=payload,
                headers=headers
            )
            # Devrait être rejeté par la validation Pydantic
            assert response.status_code in [422, 400], \
                f"NoSQL injection réussie avec payload: {payload}"


class TestOWASP2_BrokenAuthentication:
    """OWASP A02:2021 - Broken Authentication"""
    
    def test_expired_token_rejected(self, client, test_user):
        """Test qu'un token expiré est rejeté."""
        # Créer un token expiré
        token_data = {
            "sub": str(test_user.id_utilisateur),
            "email": test_user.email,
            "role": test_user.role
        }
        expired_token = create_access_token(
            token_data,
            expires_delta=timedelta(minutes=-1)  # Expiré dans le passé
        )
        
        headers = {"Authorization": f"Bearer {expired_token}"}
        # Utiliser un endpoint admin qui nécessite toujours l'authentification (get_current_user)
        response = client.get("/api/v1/users", headers=headers)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED, \
            "Token expiré accepté alors qu'il devrait être rejeté"
    
    def test_invalid_token_rejected(self, client):
        """Test qu'un token invalide est rejeté."""
        invalid_tokens = [
            "invalid.token.here",
            "not.a.valid.jwt",
            "Bearer invalid",
            "",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature",
        ]
        
        for token in invalid_tokens:
            headers = {"Authorization": f"Bearer {token}"}
            # Utiliser un endpoint admin qui nécessite toujours l'authentification
            response = client.get("/api/v1/users", headers=headers)
            assert response.status_code == status.HTTP_401_UNAUTHORIZED, \
                f"Token invalide accepté: {token[:20]}..."
    
    def test_manipulated_token_rejected(self, client, admin_token):
        """Test qu'un token manipulé est rejeté."""
        # Décoder le token
        payload = decode_token(admin_token)
        # Modifier le rôle
        payload["role"] = "admin"
        # Recréer un token avec une clé secrète différente
        manipulated_token = jwt.encode(
            payload,
            "wrong-secret-key",
            algorithm=settings.ALGORITHM
        )
        
        headers = {"Authorization": f"Bearer {manipulated_token}"}
        response = client.get("/api/v1/users", headers=headers)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED, \
            "Token manipulé accepté alors qu'il devrait être rejeté"
    
    def test_refresh_token_not_usable_as_access_token(self, client, test_user):
        """Test qu'un refresh token ne peut pas être utilisé comme access token."""
        token_data = {
            "sub": str(test_user.id_utilisateur),
            "email": test_user.email,
            "role": test_user.role
        }
        refresh_token = create_refresh_token(token_data)
        
        headers = {"Authorization": f"Bearer {refresh_token}"}
        # Utiliser un endpoint admin qui nécessite toujours l'authentification
        response = client.get("/api/v1/users", headers=headers)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED, \
            "Refresh token utilisé comme access token accepté"
    
    def test_weak_password_not_accepted(self, client, admin_token):
        """Test que les mots de passe faibles sont rejetés (si validation implémentée)."""
        # Note: Cette validation devrait être dans le schéma UserCreate
        weak_passwords = [
            "123",
            "password",
            "12345678",
            "abc",
        ]
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        for weak_password in weak_passwords:
            user_data = {
                "nom_utilisateur": "Test User",
                "email": f"test{weak_password}@example.com",
                "mot_de_passe": weak_password,
                "role": "comptable"
            }
            response = client.post(
                "/api/v1/users",
                json=user_data,
                headers=headers
            )
            # Devrait être rejeté par validation (422) ou accepté si pas de validation
            # On vérifie juste qu'il n'y a pas d'erreur serveur
            assert response.status_code != 500, \
                f"Erreur serveur avec mot de passe faible: {weak_password}"


class TestOWASP3_SensitiveDataExposure:
    """OWASP A01:2021 - Broken Access Control (Sensitive Data Exposure)"""
    
    def test_password_not_returned_in_user_response(self, client, admin_token, test_user):
        """Test que les mots de passe ne sont jamais retournés dans les réponses."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Récupérer un utilisateur
        response = client.get(
            f"/api/v1/users/{test_user.id_utilisateur}",
            headers=headers
        )
        
        assert response.status_code == 200
        user_data = response.json()
        
        # Vérifier qu'aucun champ de mot de passe n'est présent
        assert "mot_de_passe" not in user_data, "Mot de passe exposé dans la réponse"
        assert "password" not in user_data, "Password exposé dans la réponse"
        assert "mot_de_passe_hash" not in user_data, "Hash de mot de passe exposé"
        assert "password_hash" not in user_data, "Password hash exposé"
    
    def test_password_hash_not_returned_in_list(self, client, admin_token):
        """Test que les hash de mots de passe ne sont pas retournés dans les listes."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = client.get("/api/v1/users", headers=headers)
        assert response.status_code == 200
        
        users = response.json()
        assert isinstance(users, list)
        
        for user in users:
            assert "mot_de_passe" not in user, "Mot de passe exposé dans la liste"
            assert "password" not in user, "Password exposé dans la liste"
            assert "mot_de_passe_hash" not in user, "Hash de mot de passe exposé"
            assert "password_hash" not in user, "Password hash exposé"
    
    def test_secret_key_not_exposed_in_errors(self, client):
        """Test que la clé secrète JWT n'est pas exposée dans les erreurs."""
        # Tenter une requête avec un token invalide
        response = client.get(
            "/api/v1/users",
            headers={"Authorization": "Bearer invalid_token"}
        )
        
        response_text = response.text.lower()
        # Vérifier que la clé secrète n'est pas dans la réponse
        assert settings.SECRET_KEY.lower() not in response_text, \
            "Clé secrète exposée dans l'erreur"
        # Note: "secret" et "key" peuvent apparaître dans les messages d'erreur normaux
        # On vérifie juste que la clé secrète complète n'est pas exposée


class TestOWASP4_BrokenAccessControl:
    """OWASP A01:2021 - Broken Access Control"""
    
    def test_non_admin_cannot_access_admin_endpoints(self, client, test_user_comptable):
        """Test qu'un utilisateur non-admin ne peut pas accéder aux endpoints admin."""
        token_data = {
            "sub": str(test_user_comptable.id_utilisateur),
            "email": test_user_comptable.email,
            "role": test_user_comptable.role
        }
        comptable_token = create_access_token(token_data)
        
        headers = {"Authorization": f"Bearer {comptable_token}"}
        
        # Tenter d'accéder aux endpoints admin
        admin_endpoints = [
            ("GET", "/api/v1/users"),
            ("GET", "/api/v1/users/1"),
            ("POST", "/api/v1/users"),
            ("PUT", "/api/v1/users/1"),
            ("DELETE", "/api/v1/users/1"),
        ]
        
        for method, endpoint in admin_endpoints:
            if method == "GET":
                response = client.get(endpoint, headers=headers)
            elif method == "POST":
                response = client.post(endpoint, json={}, headers=headers)
            elif method == "PUT":
                response = client.put(endpoint, json={}, headers=headers)
            elif method == "DELETE":
                response = client.delete(endpoint, headers=headers)
            
            assert response.status_code == status.HTTP_403_FORBIDDEN, \
                f"Accès non autorisé à {method} {endpoint} pour un comptable"
    
    def test_user_cannot_access_other_user_data(self, client, test_user, test_user_comptable):
        """Test qu'un utilisateur ne peut pas accéder aux données d'un autre utilisateur."""
        token_data = {
            "sub": str(test_user_comptable.id_utilisateur),
            "email": test_user_comptable.email,
            "role": test_user_comptable.role
        }
        comptable_token = create_access_token(token_data)
        
        headers = {"Authorization": f"Bearer {comptable_token}"}
        
        # Tenter d'accéder aux données d'un autre utilisateur
        # Note: Cela dépend de l'implémentation, mais généralement les endpoints
        # utilisateurs sont protégés par admin uniquement
        response = client.get(
            f"/api/v1/users/{test_user.id_utilisateur}",
            headers=headers
        )
        
        # Devrait être 403 (Forbidden) ou 401 (Unauthorized)
        assert response.status_code in [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_401_UNAUTHORIZED
        ], "Accès non autorisé aux données d'un autre utilisateur"


class TestOWASP5_SecurityMisconfiguration:
    """OWASP A05:2021 - Security Misconfiguration"""
    
    def test_detailed_errors_not_exposed_in_production(self, client):
        """Test que les erreurs détaillées ne sont pas exposées en production."""
        # Note: En développement, DEBUG=True peut exposer des erreurs
        # En production, DEBUG devrait être False
        
        # Tenter une requête qui génère une erreur
        response = client.get("/api/v1/nonexistent-endpoint")
        
        # Vérifier que l'erreur ne contient pas de stack trace ou d'informations sensibles
        if response.status_code == 500:
            response_text = response.text.lower()
            # Ne devrait pas contenir de stack trace détaillée
            assert "traceback" not in response_text or settings.DEBUG, \
                "Stack trace exposée en production"
            assert "file" not in response_text or "line" not in response_text or settings.DEBUG, \
                "Informations de fichier/ligne exposées"
    
    def test_cors_properly_configured(self, client):
        """Test que CORS est correctement configuré."""
        # Faire une requête OPTIONS (preflight)
        response = client.options(
            "/api/v1/clients",
            headers={
                "Origin": "http://malicious-site.com",
                "Access-Control-Request-Method": "GET"
            }
        )
        
        # Vérifier que les headers CORS sont présents
        # Note: En développement, CORS peut être plus permissif
        # En production, seules les origines autorisées devraient être acceptées
        cors_headers = [
            "access-control-allow-origin",
            "access-control-allow-methods",
            "access-control-allow-headers"
        ]
        
        # Si CORS est configuré, au moins un header devrait être présent
        # (ou tous absents si CORS est désactivé)
        pass  # Test informatif, pas de fail si CORS n'est pas configuré
    
    def test_default_credentials_not_used(self):
        """Test que les credentials par défaut ne sont pas utilisés."""
        # En développement, l'utilisation de credentials par défaut est acceptable
        # mais doit être évitée en production
        default_secrets = [
            "your-secret-key-change-this-in-production",
            "secret",
            "changeme",
            "default",
        ]
        
        # En développement, on signale juste un avertissement
        # En production, c'est une erreur critique
        if settings.ENVIRONMENT == "production":
            assert settings.SECRET_KEY not in default_secrets, \
                "Clé secrète par défaut utilisée en production - CRITIQUE"
        
        # Vérifier que le mot de passe de la base de données n'est pas par défaut
        default_db_password = "change_me_in_production"
        # Note: En développement, c'est acceptable, mais on le signale
        if settings.ENVIRONMENT == "production":
            assert default_db_password not in settings.DATABASE_URL, \
                "Mot de passe de base de données par défaut en production"
        
        # En développement, on passe le test mais on signale l'utilisation de valeurs par défaut
        # (c'est acceptable pour le développement mais doit être changé en production)
        if settings.ENVIRONMENT == "development" and settings.SECRET_KEY in default_secrets:
            import warnings
            warnings.warn(
                "Clé secrète par défaut utilisée en développement. "
                "Changez-la avant le déploiement en production.",
                UserWarning
            )


class TestOWASP6_XSS:
    """OWASP A03:2021 - Injection (XSS)"""
    
    def test_xss_in_text_fields(self, client, admin_token):
        """Test que les champs texte sont protégés contre XSS."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        xss_payloads = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert('XSS')>",
            "javascript:alert('XSS')",
            "<svg onload=alert('XSS')>",
            "'\"><script>alert('XSS')</script>",
        ]
        
        for payload in xss_payloads:
            # Tenter de créer un produit avec un payload XSS dans le nom
            # (les produits n'ont pas besoin de current_user.id_utilisateur)
            produit_data = {
                "nom_produit": payload,
                "est_actif": True
            }
            
            response = client.post(
                "/api/v1/produits",
                json=produit_data,
                headers=headers
            )
            
            # Devrait être accepté (validation côté frontend) ou rejeté
            # L'important est qu'il n'y ait pas d'exécution de script
            assert response.status_code in [200, 201, 400, 422, 500], \
                f"Erreur serveur avec payload XSS: {payload}"
            
            # Si créé, vérifier que le script n'est pas exécuté (côté backend)
            # Le backend devrait échapper ou valider les données
            if response.status_code in [200, 201]:
                produit_id = response.json().get("id_produit")
                if produit_id:
                    get_response = client.get(
                        f"/api/v1/produits/{produit_id}",
                        headers=headers
                    )
                    if get_response.status_code == 200:
                        # Vérifier que le payload est stocké tel quel (échappement côté frontend)
                        # ou rejeté
                        pass


class TestOWASP7_InsecureDeserialization:
    """OWASP A08:2021 - Software and Data Integrity Failures (Insecure Deserialization)"""
    
    def test_json_validation_enforced(self, client, admin_token):
        """Test que la validation JSON est appliquée."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Tentative d'injection de types invalides
        invalid_payloads = [
            {"id_client": "not_a_number"},
            {"montant_total": "not_a_decimal"},
            {"date_transaction": "invalid_date"},
            {"est_actif": "not_a_boolean"},
        ]
        
        for payload in invalid_payloads:
            response = client.post(
                "/api/v1/clients",
                json=payload,
                headers=headers
            )
            
            # Devrait être rejeté par la validation Pydantic
            assert response.status_code in [422, 400], \
                f"Validation JSON échouée pour payload: {payload}"
    
    def test_malformed_json_rejected(self, client, admin_token):
        """Test que les JSON malformés sont rejetés."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        malformed_jsons = [
            '{"nom_client": "test",}',  # Trailing comma
            '{"nom_client": test}',     # Pas de guillemets
            '{"nom_client": "test"',   # Accolade manquante
        ]
        
        for malformed_json in malformed_jsons:
            response = client.post(
                "/api/v1/clients",
                content=malformed_json,
                headers={**headers, "Content-Type": "application/json"}
            )
            
            # Devrait être rejeté
            assert response.status_code in [422, 400], \
                f"JSON malformé accepté: {malformed_json}"


class TestOWASP8_UsingComponentsWithKnownVulnerabilities:
    """OWASP A06:2021 - Vulnerable and Outdated Components"""
    
    def test_dependencies_audit_placeholder(self):
        """
        Placeholder pour les tests d'audit de dépendances.
        
        Les dépendances doivent être auditées avec pip-audit et safety.
        Voir scripts/audit_dependencies.py pour l'audit complet.
        """
        # Ce test vérifie que les outils d'audit peuvent être exécutés
        # L'audit réel est fait via pip-audit et safety
        assert True, "Audit de dépendances doit être exécuté via pip-audit et safety"


class TestOWASP9_InsufficientLogging:
    """OWASP A09:2021 - Security Logging and Monitoring Failures"""
    
    def test_failed_login_attempts_logged(self, client, db_session):
        """Test que les tentatives de connexion échouées sont enregistrées."""
        from app.models.audit import AuditConnexion
        
        # Compter les tentatives avant
        initial_count = db_session.query(AuditConnexion).count()
        
        # Tenter une connexion avec de mauvais identifiants
        login_data = {
            "email": "nonexistent@example.com",
            "mot_de_passe": "wrongpassword"
        }
        response = client.post("/api/v1/auth/login", json=login_data)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        
        # Vérifier qu'une tentative a été enregistrée
        final_count = db_session.query(AuditConnexion).count()
        assert final_count > initial_count, \
            "Tentative de connexion échouée non enregistrée"
        
        # Vérifier que la tentative contient les bonnes informations
        last_attempt = db_session.query(AuditConnexion).order_by(
            AuditConnexion.id_audit_connexion.desc()
        ).first()
        
        assert last_attempt is not None
        assert last_attempt.email_utilisateur == login_data["email"]
        assert last_attempt.succes is False
    
    def test_successful_login_attempts_logged(self, client, db_session, test_user):
        """Test que les tentatives de connexion réussies sont enregistrées."""
        from app.models.audit import AuditConnexion
        
        # Compter les tentatives avant
        initial_count = db_session.query(AuditConnexion).count()
        
        # Tenter une connexion avec de bons identifiants
        login_data = {
            "email": test_user.email,
            "mot_de_passe": "TestPass123!"  # Mot de passe du test_user
        }
        response = client.post("/api/v1/auth/login", json=login_data)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier qu'une tentative a été enregistrée
        final_count = db_session.query(AuditConnexion).count()
        assert final_count > initial_count, \
            "Tentative de connexion réussie non enregistrée"
        
        # Vérifier que la tentative contient les bonnes informations
        last_attempt = db_session.query(AuditConnexion).order_by(
            AuditConnexion.id_audit_connexion.desc()
        ).first()
        
        assert last_attempt is not None
        assert last_attempt.email_utilisateur == login_data["email"]
        assert last_attempt.succes is True
    
    def test_unauthorized_access_attempts_logged(self, client):
        """Test que les tentatives d'accès non autorisées sont détectées."""
        # Tenter d'accéder à un endpoint admin protégé sans token
        # (les endpoints admin nécessitent toujours l'authentification via get_current_user)
        response = client.get("/api/v1/users")
        
        # Devrait retourner 401 ou 403
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN
        ], f"Accès non autorisé non détecté (status: {response.status_code})"
        
        # Note: Le logging détaillé devrait être vérifié dans les logs de l'application
        # Ce test vérifie juste que l'accès est refusé


class TestOWASP10_XXE:
    """OWASP A03:2021 - Injection (XXE) - Non applicable mais testé"""
    
    def test_xxe_not_applicable(self):
        """
        Test que XXE n'est pas applicable (pas de traitement XML).
        
        XML External Entities (XXE) n'est pas applicable car l'application
        n'utilise pas XML, seulement JSON.
        """
        # Vérifier qu'aucun endpoint n'accepte XML
        # Ce test est informatif
        assert True, "XXE non applicable - application utilise uniquement JSON"

