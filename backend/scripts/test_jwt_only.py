"""
Script de test pour les fonctions JWT uniquement (sans bcrypt).
"""
import sys
from pathlib import Path

# Ajouter le répertoire parent au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timedelta
from jose import JWTError

from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.config import settings


def test_jwt_functions():
    """Test les fonctions JWT."""
    print("\n" + "="*60)
    print("TEST: Fonctions JWT (sans bcrypt)")
    print("="*60)
    
    # Test 1: Token d'accès
    print("\n1. Test du token d'accès:")
    data = {"sub": 1, "email": "user@example.com", "role": "admin"}
    token = create_access_token(data)
    print(f"   ✅ Token créé: {token[:50]}...")
    
    decoded = decode_token(token)
    assert decoded["sub"] == "1"  # sub est converti en string par JWT
    assert decoded["email"] == "user@example.com"
    assert decoded["role"] == "admin"
    assert decoded["type"] == "access"
    print(f"   ✅ Token décodé avec succès")
    print(f"      - Sub: {decoded['sub']}")
    print(f"      - Email: {decoded['email']}")
    print(f"      - Role: {decoded['role']}")
    print(f"      - Type: {decoded['type']}")
    
    # Vérifier l'expiration
    exp_time = datetime.fromtimestamp(decoded["exp"])
    iat_time = datetime.fromtimestamp(decoded["iat"])
    actual_delta = exp_time - iat_time
    expected_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    assert abs(actual_delta.total_seconds() - expected_minutes * 60) < 1
    print(f"   ✅ Expiration: {expected_minutes} minutes")
    
    # Test 2: Token de rafraîchissement
    print("\n2. Test du token de rafraîchissement:")
    refresh_data = {"sub": 1, "email": "user@example.com"}
    refresh_token = create_refresh_token(refresh_data)
    print(f"   ✅ Token créé: {refresh_token[:50]}...")
    
    refresh_decoded = decode_token(refresh_token)
    assert refresh_decoded["sub"] == "1"  # sub est converti en string par JWT
    assert refresh_decoded["email"] == "user@example.com"
    assert refresh_decoded["type"] == "refresh"
    print(f"   ✅ Token décodé avec succès")
    print(f"      - Sub: {refresh_decoded['sub']}")
    print(f"      - Email: {refresh_decoded['email']}")
    print(f"      - Type: {refresh_decoded['type']}")
    
    # Vérifier l'expiration
    exp_time = datetime.fromtimestamp(refresh_decoded["exp"])
    iat_time = datetime.fromtimestamp(refresh_decoded["iat"])
    actual_delta = exp_time - iat_time
    expected_days = settings.REFRESH_TOKEN_EXPIRE_DAYS
    assert abs(actual_delta.total_seconds() - expected_days * 24 * 60 * 60) < 60
    print(f"   ✅ Expiration: {expected_days} jours")
    
    # Test 3: Expiration personnalisée
    print("\n3. Test de l'expiration personnalisée:")
    custom_delta = timedelta(minutes=30)
    custom_token = create_access_token(data, expires_delta=custom_delta)
    custom_decoded = decode_token(custom_token)
    exp_time = datetime.fromtimestamp(custom_decoded["exp"])
    iat_time = datetime.fromtimestamp(custom_decoded["iat"])
    actual_delta = exp_time - iat_time
    assert abs(actual_delta.total_seconds() - 30 * 60) < 1
    print(f"   ✅ Expiration personnalisée: 30 minutes")
    
    # Test 4: Gestion des erreurs
    print("\n4. Test de la gestion des erreurs:")
    try:
        decode_token("invalid.token.here")
        assert False, "Devrait lever une exception"
    except JWTError:
        print(f"   ✅ Token invalide correctement rejeté")
    
    # Test 5: Tokens différents
    print("\n5. Test que les tokens sont différents:")
    assert token != refresh_token
    print(f"   ✅ Les tokens d'accès et de rafraîchissement sont différents")
    
    print("\n" + "="*60)
    print("✅ TOUS LES TESTS JWT SONT PASSÉS!")
    print("="*60)
    return True


if __name__ == "__main__":
    try:
        test_jwt_functions()
        print("\n✅ Implémentation JWT validée avec succès!")
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        exit(1)

