"""
Script de test standalone pour les utilitaires de sécurité.
Ce script peut être exécuté sans dépendre de la base de données.
"""
import sys
from pathlib import Path

# Ajouter le répertoire parent au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))

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


def test_password_hashing():
    """Test le hashage et la vérification des mots de passe."""
    print("\n" + "="*60)
    print("TEST: Hashage et vérification des mots de passe")
    print("="*60)
    
    # Test 1: Hashage basique
    password = "SecurePass123!"
    hashed = hash_password(password)
    print(f"✅ Hashage réussi")
    print(f"   Mot de passe: {password}")
    print(f"   Hash: {hashed[:50]}...")
    
    # Test 2: Vérification correcte
    assert verify_password(password, hashed), "La vérification du mot de passe correct a échoué"
    print(f"✅ Vérification correcte réussie")
    
    # Test 3: Vérification incorrecte
    wrong_password = "WrongPassword123!"
    assert not verify_password(wrong_password, hashed), "La vérification du mot de passe incorrect a échoué"
    print(f"✅ Vérification incorrecte réussie (rejette le mauvais mot de passe)")
    
    # Test 4: Hashages différents pour le même mot de passe (salt)
    hashed2 = hash_password(password)
    assert hashed != hashed2, "Les hash devraient être différents (salt)"
    assert verify_password(password, hashed2), "Le deuxième hash devrait aussi fonctionner"
    print(f"✅ Salt fonctionnel (hash différents pour le même mot de passe)")
    
    print("✅ Tous les tests de hashage sont passés!\n")


def test_access_token():
    """Test la création et le décodage des tokens d'accès."""
    print("="*60)
    print("TEST: Tokens JWT d'accès")
    print("="*60)
    
    # Test 1: Création basique
    data = {"sub": 1, "email": "user@example.com", "role": "admin"}
    token = create_access_token(data)
    print(f"✅ Token d'accès créé")
    print(f"   Token: {token[:50]}...")
    
    # Test 2: Décodage
    decoded = decode_token(token)
    assert decoded["sub"] == 1, "Le sub ne correspond pas"
    assert decoded["email"] == "user@example.com", "L'email ne correspond pas"
    assert decoded["role"] == "admin", "Le rôle ne correspond pas"
    assert decoded["type"] == "access", "Le type devrait être 'access'"
    print(f"✅ Décodage réussi")
    print(f"   Sub: {decoded['sub']}")
    print(f"   Email: {decoded['email']}")
    print(f"   Role: {decoded['role']}")
    print(f"   Type: {decoded['type']}")
    
    # Test 3: Expiration
    assert "exp" in decoded, "Le token devrait avoir une date d'expiration"
    assert "iat" in decoded, "Le token devrait avoir une date d'émission"
    exp_time = datetime.fromtimestamp(decoded["exp"])
    iat_time = datetime.fromtimestamp(decoded["iat"])
    actual_delta = exp_time - iat_time
    expected_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    assert abs(actual_delta.total_seconds() - expected_minutes * 60) < 1, \
        f"L'expiration devrait être de {expected_minutes} minutes"
    print(f"✅ Expiration configurée correctement ({expected_minutes} minutes)")
    
    # Test 4: Expiration personnalisée
    custom_delta = timedelta(minutes=30)
    token_custom = create_access_token(data, expires_delta=custom_delta)
    decoded_custom = decode_token(token_custom)
    exp_time_custom = datetime.fromtimestamp(decoded_custom["exp"])
    iat_time_custom = datetime.fromtimestamp(decoded_custom["iat"])
    actual_delta_custom = exp_time_custom - iat_time_custom
    assert abs(actual_delta_custom.total_seconds() - 30 * 60) < 1, \
        "L'expiration personnalisée devrait être de 30 minutes"
    print(f"✅ Expiration personnalisée fonctionnelle (30 minutes)")
    
    print("✅ Tous les tests de tokens d'accès sont passés!\n")


def test_refresh_token():
    """Test la création et le décodage des tokens de rafraîchissement."""
    print("="*60)
    print("TEST: Tokens JWT de rafraîchissement")
    print("="*60)
    
    # Test 1: Création basique
    data = {"sub": 1, "email": "user@example.com"}
    token = create_refresh_token(data)
    print(f"✅ Token de rafraîchissement créé")
    print(f"   Token: {token[:50]}...")
    
    # Test 2: Décodage
    decoded = decode_token(token)
    assert decoded["sub"] == 1, "Le sub ne correspond pas"
    assert decoded["email"] == "user@example.com", "L'email ne correspond pas"
    assert decoded["type"] == "refresh", "Le type devrait être 'refresh'"
    print(f"✅ Décodage réussi")
    print(f"   Sub: {decoded['sub']}")
    print(f"   Email: {decoded['email']}")
    print(f"   Type: {decoded['type']}")
    
    # Test 3: Expiration de 7 jours
    assert "exp" in decoded, "Le token devrait avoir une date d'expiration"
    exp_time = datetime.fromtimestamp(decoded["exp"])
    iat_time = datetime.fromtimestamp(decoded["iat"])
    actual_delta = exp_time - iat_time
    expected_days = settings.REFRESH_TOKEN_EXPIRE_DAYS
    assert abs(actual_delta.total_seconds() - expected_days * 24 * 60 * 60) < 60, \
        f"L'expiration devrait être de {expected_days} jours"
    print(f"✅ Expiration configurée correctement ({expected_days} jours)")
    
    print("✅ Tous les tests de tokens de rafraîchissement sont passés!\n")


def test_token_errors():
    """Test la gestion des erreurs pour les tokens invalides."""
    print("="*60)
    print("TEST: Gestion des erreurs de tokens")
    print("="*60)
    
    # Test 1: Token invalide
    try:
        decode_token("invalid.token.here")
        assert False, "Devrait lever une exception pour un token invalide"
    except JWTError:
        print(f"✅ Token invalide correctement rejeté")
    
    # Test 2: Token vide
    try:
        decode_token("")
        assert False, "Devrait lever une exception pour un token vide"
    except JWTError:
        print(f"✅ Token vide correctement rejeté")
    
    # Test 3: Token expiré
    data = {"sub": 1, "email": "user@example.com"}
    expired_delta = timedelta(minutes=-1)
    expired_token = create_access_token(data, expires_delta=expired_delta)
    import time
    time.sleep(1)  # S'assurer que le token est expiré
    
    try:
        decode_token(expired_token)
        assert False, "Devrait lever une exception pour un token expiré"
    except JWTError:
        print(f"✅ Token expiré correctement rejeté")
    
    print("✅ Tous les tests de gestion d'erreurs sont passés!\n")


def test_integration_flow():
    """Test le flux complet d'authentification."""
    print("="*60)
    print("TEST: Flux complet d'authentification")
    print("="*60)
    
    # 1. Hashage du mot de passe
    password = "SecurePass123!"
    hashed = hash_password(password)
    print(f"✅ Étape 1: Mot de passe hashé")
    
    # 2. Vérification du mot de passe
    assert verify_password(password, hashed), "La vérification du mot de passe a échoué"
    print(f"✅ Étape 2: Mot de passe vérifié")
    
    # 3. Création des tokens après authentification réussie
    user_data = {"sub": 1, "email": "user@example.com", "role": "admin"}
    access_token = create_access_token(user_data)
    refresh_token = create_refresh_token(user_data)
    print(f"✅ Étape 3: Tokens créés (access + refresh)")
    
    # 4. Décodage des tokens
    access_decoded = decode_token(access_token)
    refresh_decoded = decode_token(refresh_token)
    print(f"✅ Étape 4: Tokens décodés")
    
    # 5. Vérification des données
    assert access_decoded["sub"] == 1
    assert access_decoded["email"] == "user@example.com"
    assert access_decoded["type"] == "access"
    assert refresh_decoded["sub"] == 1
    assert refresh_decoded["email"] == "user@example.com"
    assert refresh_decoded["type"] == "refresh"
    print(f"✅ Étape 5: Données validées")
    
    # 6. Vérification que les tokens sont différents
    assert access_token != refresh_token, "Les tokens devraient être différents"
    print(f"✅ Étape 6: Tokens différents confirmés")
    
    print("✅ Flux complet d'authentification réussi!\n")


def main():
    """Exécute tous les tests."""
    print("\n" + "="*60)
    print("TESTS DES UTILITAIRES DE SÉCURITÉ")
    print("="*60)
    print(f"Configuration:")
    print(f"  - SECRET_KEY: {settings.SECRET_KEY[:20]}...")
    print(f"  - ALGORITHM: {settings.ALGORITHM}")
    print(f"  - ACCESS_TOKEN_EXPIRE_MINUTES: {settings.ACCESS_TOKEN_EXPIRE_MINUTES}")
    print(f"  - REFRESH_TOKEN_EXPIRE_DAYS: {settings.REFRESH_TOKEN_EXPIRE_DAYS}")
    
    try:
        test_password_hashing()
        test_access_token()
        test_refresh_token()
        test_token_errors()
        test_integration_flow()
        
        print("="*60)
        print("✅ TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS!")
        print("="*60)
        return 0
    except AssertionError as e:
        print(f"\n❌ ÉCHEC DU TEST: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ ERREUR INATTENDUE: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())

