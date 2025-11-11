"""
Utilitaires de sécurité pour l'authentification JWT et le hashage des mots de passe.
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from passlib.context import CryptContext
from jose import JWTError, jwt
from app.config import settings

# Configuration du contexte de hashage bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """
    Hash un mot de passe en utilisant bcrypt.
    
    Args:
        password: Mot de passe en clair
        
    Returns:
        Hash bcrypt du mot de passe
        
    Example:
        >>> hashed = hash_password("MonMotDePasse123!")
        >>> verify_password("MonMotDePasse123!", hashed)
        True
    """
    try:
        return pwd_context.hash(password)
    except ValueError as e:
        # Fallback vers bcrypt direct si passlib échoue (problème de détection de version)
        if "password cannot be longer than 72 bytes" in str(e):
            import bcrypt
            password_bytes = password.encode('utf-8')
            salt = bcrypt.gensalt()
            return bcrypt.hashpw(password_bytes, salt).decode('utf-8')
        raise


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Vérifie qu'un mot de passe en clair correspond au hash stocké.
    
    Args:
        plain_password: Mot de passe en clair à vérifier
        hashed_password: Hash bcrypt stocké en base de données
        
    Returns:
        True si le mot de passe correspond, False sinon
        
    Example:
        >>> hashed = hash_password("MonMotDePasse123!")
        >>> verify_password("MonMotDePasse123!", hashed)
        True
        >>> verify_password("MauvaisMotDePasse", hashed)
        False
    """
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (ValueError, AttributeError):
        # Fallback vers bcrypt direct si passlib échoue (problème de compatibilité)
        import bcrypt
        try:
            password_bytes = plain_password.encode('utf-8')
            hash_bytes = hashed_password.encode('utf-8')
            return bcrypt.checkpw(password_bytes, hash_bytes)
        except Exception:
            return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Crée un token JWT d'accès avec les données fournies.
    
    Le token expire par défaut après 15 minutes (configuré dans settings).
    Un délai d'expiration personnalisé peut être fourni.
    
    Args:
        data: Dictionnaire contenant les données à encoder dans le token
               (typiquement: {"sub": user_id, "email": user_email, "role": user_role})
               Note: "sub" sera automatiquement converti en string si c'est un entier
        expires_delta: Délai d'expiration personnalisé (optionnel)
        
    Returns:
        Token JWT encodé en string
        
    Example:
        >>> token = create_access_token({"sub": 1, "email": "user@example.com"})
        >>> decoded = decode_token(token)
        >>> decoded["sub"]
        '1'
    """
    to_encode = data.copy()
    
    # Convertir "sub" en string si c'est un entier (requis par JWT standard)
    if "sub" in to_encode and isinstance(to_encode["sub"], int):
        to_encode["sub"] = str(to_encode["sub"])
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "iat": datetime.utcnow(), "type": "access"})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """
    Crée un token JWT de rafraîchissement avec les données fournies.
    
    Le token expire après 7 jours (configuré dans settings).
    Ce token est utilisé pour obtenir un nouveau token d'accès sans redemander
    les identifiants de l'utilisateur.
    
    Args:
        data: Dictionnaire contenant les données à encoder dans le token
               (typiquement: {"sub": user_id, "email": user_email})
               Note: "sub" sera automatiquement converti en string si c'est un entier
    
    Returns:
        Token JWT de rafraîchissement encodé en string
        
    Example:
        >>> token = create_refresh_token({"sub": 1, "email": "user@example.com"})
        >>> decoded = decode_token(token)
        >>> decoded["type"]
        'refresh'
    """
    to_encode = data.copy()
    
    # Convertir "sub" en string si c'est un entier (requis par JWT standard)
    if "sub" in to_encode and isinstance(to_encode["sub"], int):
        to_encode["sub"] = str(to_encode["sub"])
    
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({"exp": expire, "iat": datetime.utcnow(), "type": "refresh"})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    
    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """
    Décode et valide un token JWT.
    
    Vérifie la signature, l'expiration et retourne le payload décodé.
    
    Args:
        token: Token JWT à décoder
        
    Returns:
        Dictionnaire contenant le payload décodé du token
        
    Raises:
        JWTError: Si le token est invalide, expiré ou mal formé
        
    Example:
        >>> token = create_access_token({"sub": 1, "email": "user@example.com"})
        >>> payload = decode_token(token)
        >>> payload["sub"]
        '1'
        >>> payload["email"]
        'user@example.com'
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError as e:
        raise JWTError(f"Token invalide: {str(e)}")

