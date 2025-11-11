"""
Tests pour les utilitaires de sécurité (hashage, JWT).
Vérifie que toutes les fonctions de sécurité fonctionnent correctement.
"""
import pytest
from datetime import datetime, timedelta
from jose import JWTError

from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.config import settings


class TestPasswordHashing:
    """Tests pour le hashage et la vérification des mots de passe."""
    
    def test_hash_password_creates_hash(self):
        """Test que hash_password crée un hash différent du mot de passe original."""
        password = "SecurePass123!"
        hashed = hash_password(password)
        
        assert hashed != password
        assert len(hashed) > 0
        assert hashed.startswith("$2b$")  # Format bcrypt
    
    def test_hash_password_different_hashes(self):
        """Test que le même mot de passe produit des hash différents (salt)."""
        password = "SecurePass123!"
        hashed1 = hash_password(password)
        hashed2 = hash_password(password)
        
        # Les hash doivent être différents à cause du salt
        assert hashed1 != hashed2
    
    def test_verify_password_correct(self):
        """Test que verify_password retourne True pour un mot de passe correct."""
        password = "SecurePass123!"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True
    
    def test_verify_password_incorrect(self):
        """Test que verify_password retourne False pour un mot de passe incorrect."""
        password = "SecurePass123!"
        wrong_password = "WrongPassword123!"
        hashed = hash_password(password)
        
        assert verify_password(wrong_password, hashed) is False
    
    def test_verify_password_empty_password(self):
        """Test avec un mot de passe vide."""
        password = ""
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True
    
    def test_verify_password_special_characters(self):
        """Test avec des caractères spéciaux dans le mot de passe."""
        password = "P@ssw0rd!#$%^&*()_+-=[]{}|;:,.<>?"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True
        assert verify_password("P@ssw0rd!#$%^&*()_+-=[]{}|;:,.<>", hashed) is False


class TestAccessToken:
    """Tests pour les tokens JWT d'accès."""
    
    def test_create_access_token_creates_token(self):
        """Test que create_access_token crée un token valide."""
        data = {"sub": 1, "email": "user@example.com", "role": "admin"}
        token = create_access_token(data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_create_access_token_contains_data(self):
        """Test que le token contient les données encodées."""
        data = {"sub": 1, "email": "user@example.com", "role": "admin"}
        token = create_access_token(data)
        decoded = decode_token(token)
        
        assert decoded["sub"] == "1"  # JWT standard : sub est une string
        assert decoded["email"] == "user@example.com"
        assert decoded["role"] == "admin"
        assert decoded["type"] == "access"
    
    def test_create_access_token_has_expiration(self):
        """Test que le token a une date d'expiration."""
        data = {"sub": 1, "email": "user@example.com"}
        token = create_access_token(data)
        decoded = decode_token(token)
        
        assert "exp" in decoded
        assert "iat" in decoded
        assert isinstance(decoded["exp"], (int, float))
        assert isinstance(decoded["iat"], (int, float))
    
    def test_create_access_token_custom_expiration(self):
        """Test avec une expiration personnalisée."""
        data = {"sub": 1, "email": "user@example.com"}
        custom_delta = timedelta(minutes=30)
        token = create_access_token(data, expires_delta=custom_delta)
        decoded = decode_token(token)
        
        exp_time = datetime.fromtimestamp(decoded["exp"])
        iat_time = datetime.fromtimestamp(decoded["iat"])
        actual_delta = exp_time - iat_time
        
        # Vérifier que l'expiration est proche de 30 minutes (tolérance de 1 seconde)
        assert abs(actual_delta.total_seconds() - 30 * 60) < 1
    
    def test_create_access_token_default_expiration(self):
        """Test que l'expiration par défaut est de 15 minutes."""
        data = {"sub": 1, "email": "user@example.com"}
        token = create_access_token(data)
        decoded = decode_token(token)
        
        exp_time = datetime.fromtimestamp(decoded["exp"])
        iat_time = datetime.fromtimestamp(decoded["iat"])
        actual_delta = exp_time - iat_time
        
        # Vérifier que l'expiration est proche de 15 minutes (tolérance de 1 seconde)
        expected_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
        assert abs(actual_delta.total_seconds() - expected_minutes * 60) < 1


class TestRefreshToken:
    """Tests pour les tokens JWT de rafraîchissement."""
    
    def test_create_refresh_token_creates_token(self):
        """Test que create_refresh_token crée un token valide."""
        data = {"sub": 1, "email": "user@example.com"}
        token = create_refresh_token(data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_create_refresh_token_contains_data(self):
        """Test que le token contient les données encodées."""
        data = {"sub": 1, "email": "user@example.com"}
        token = create_refresh_token(data)
        decoded = decode_token(token)
        
        assert decoded["sub"] == "1"  # JWT standard : sub est une string
        assert decoded["email"] == "user@example.com"
        assert decoded["type"] == "refresh"
    
    def test_create_refresh_token_has_expiration(self):
        """Test que le token a une date d'expiration."""
        data = {"sub": 1, "email": "user@example.com"}
        token = create_refresh_token(data)
        decoded = decode_token(token)
        
        assert "exp" in decoded
        assert "iat" in decoded
    
    def test_create_refresh_token_expiration_7_days(self):
        """Test que l'expiration est de 7 jours."""
        data = {"sub": 1, "email": "user@example.com"}
        token = create_refresh_token(data)
        decoded = decode_token(token)
        
        exp_time = datetime.fromtimestamp(decoded["exp"])
        iat_time = datetime.fromtimestamp(decoded["iat"])
        actual_delta = exp_time - iat_time
        
        # Vérifier que l'expiration est proche de 7 jours (tolérance de 1 minute)
        expected_days = settings.REFRESH_TOKEN_EXPIRE_DAYS
        assert abs(actual_delta.total_seconds() - expected_days * 24 * 60 * 60) < 60


class TestDecodeToken:
    """Tests pour le décodage des tokens JWT."""
    
    def test_decode_token_valid_access_token(self):
        """Test le décodage d'un token d'accès valide."""
        data = {"sub": 1, "email": "user@example.com", "role": "admin"}
        token = create_access_token(data)
        decoded = decode_token(token)
        
        assert decoded["sub"] == "1"  # JWT standard : sub est une string
        assert decoded["email"] == "user@example.com"
        assert decoded["role"] == "admin"
        assert decoded["type"] == "access"
    
    def test_decode_token_valid_refresh_token(self):
        """Test le décodage d'un token de rafraîchissement valide."""
        data = {"sub": 1, "email": "user@example.com"}
        token = create_refresh_token(data)
        decoded = decode_token(token)
        
        assert decoded["sub"] == "1"  # JWT standard : sub est une string
        assert decoded["email"] == "user@example.com"
        assert decoded["type"] == "refresh"
    
    def test_decode_token_invalid_token(self):
        """Test qu'un token invalide lève une exception."""
        invalid_token = "invalid.token.here"
        
        with pytest.raises(JWTError):
            decode_token(invalid_token)
    
    def test_decode_token_expired_token(self):
        """Test qu'un token expiré lève une exception."""
        data = {"sub": 1, "email": "user@example.com"}
        # Créer un token avec expiration dans le passé
        expired_delta = timedelta(minutes=-1)
        token = create_access_token(data, expires_delta=expired_delta)
        
        # Attendre un peu pour s'assurer que le token est expiré
        import time
        time.sleep(1)
        
        with pytest.raises(JWTError):
            decode_token(token)
    
    def test_decode_token_wrong_secret(self):
        """Test qu'un token avec une mauvaise clé secrète lève une exception."""
        # Créer un token avec les settings actuels
        data = {"sub": 1, "email": "user@example.com"}
        token = create_access_token(data)
        
        # Modifier temporairement la clé secrète
        original_secret = settings.SECRET_KEY
        settings.SECRET_KEY = "wrong-secret-key"
        
        try:
            with pytest.raises(JWTError):
                decode_token(token)
        finally:
            # Restaurer la clé secrète originale
            settings.SECRET_KEY = original_secret
    
    def test_decode_token_empty_token(self):
        """Test avec un token vide."""
        with pytest.raises(JWTError):
            decode_token("")


class TestTokenIntegration:
    """Tests d'intégration pour le workflow complet."""
    
    def test_full_authentication_flow(self):
        """Test le flux complet d'authentification."""
        # 1. Hashage du mot de passe
        password = "SecurePass123!"
        hashed = hash_password(password)
        
        # 2. Vérification du mot de passe
        assert verify_password(password, hashed) is True
        
        # 3. Création des tokens après authentification réussie
        user_data = {"sub": 1, "email": "user@example.com", "role": "admin"}
        access_token = create_access_token(user_data)
        refresh_token = create_refresh_token(user_data)
        
        # 4. Décodage des tokens
        access_decoded = decode_token(access_token)
        refresh_decoded = decode_token(refresh_token)
        
        # 5. Vérification des données
        assert access_decoded["sub"] == "1"  # JWT standard : sub est une string
        assert access_decoded["email"] == "user@example.com"
        assert access_decoded["type"] == "access"
        
        assert refresh_decoded["sub"] == "1"  # JWT standard : sub est une string
        assert refresh_decoded["email"] == "user@example.com"
        assert refresh_decoded["type"] == "refresh"
    
    def test_token_types_different(self):
        """Test que les tokens d'accès et de rafraîchissement sont différents."""
        data = {"sub": 1, "email": "user@example.com"}
        access_token = create_access_token(data)
        refresh_token = create_refresh_token(data)
        
        assert access_token != refresh_token
        
        access_decoded = decode_token(access_token)
        refresh_decoded = decode_token(refresh_token)
        
        assert access_decoded["type"] == "access"
        assert refresh_decoded["type"] == "refresh"

