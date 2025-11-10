"""
Dépendances FastAPI pour l'authentification et l'autorisation.
Gère l'extraction et la validation des tokens JWT, ainsi que la vérification des rôles.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError
from app.database import get_db
from app.models.user import Utilisateur
from app.utils.security import decode_token
from app.config import settings

# Configuration du schéma OAuth2 pour l'extraction du token depuis l'en-tête Authorization
# Le tokenUrl est utilisé par la documentation Swagger pour l'authentification
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Utilisateur:
    """
    Dépendance FastAPI pour obtenir l'utilisateur actuel depuis le token JWT.
    
    Extrait le token depuis l'en-tête Authorization, le valide et retourne
    l'utilisateur correspondant depuis la base de données.
    
    Args:
        token: Token JWT extrait depuis l'en-tête Authorization (via oauth2_scheme)
        db: Session de base de données
        
    Returns:
        Utilisateur: L'utilisateur correspondant au token
        
    Raises:
        HTTPException 401: Si le token est invalide, expiré ou si l'utilisateur n'existe pas
        
    Example:
        @router.get("/protected")
        def protected_route(current_user: Utilisateur = Depends(get_current_user)):
            return {"user_id": current_user.id_utilisateur}
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Impossible de valider les identifiants",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Décoder et valider le token JWT
        payload = decode_token(token)
        
        # Vérifier que c'est bien un token d'accès (et non un refresh token)
        token_type = payload.get("type")
        if token_type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalide: ce n'est pas un token d'accès",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Extraire l'ID de l'utilisateur depuis le payload
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        
        # Convertir l'ID en entier
        try:
            user_id_int = int(user_id)
        except (ValueError, TypeError):
            raise credentials_exception
        
        # Récupérer l'utilisateur depuis la base de données
        user = db.query(Utilisateur).filter(Utilisateur.id_utilisateur == user_id_int).first()
        if user is None:
            raise credentials_exception
        
        return user
        
    except JWTError:
        raise credentials_exception


def get_current_active_user(
    current_user: Utilisateur = Depends(get_current_user)
) -> Utilisateur:
    """
    Dépendance FastAPI pour obtenir l'utilisateur actuel actif.
    
    Vérifie que l'utilisateur existe (implicitement actif).
    Cette fonction peut être étendue pour vérifier un champ "est_actif" si ajouté au modèle.
    
    Args:
        current_user: Utilisateur obtenu via get_current_user
        
    Returns:
        Utilisateur: L'utilisateur actif
        
    Raises:
        HTTPException 400: Si l'utilisateur n'est pas actif
        
    Example:
        @router.get("/protected")
        def protected_route(user: Utilisateur = Depends(get_current_active_user)):
            return {"user_id": user.id_utilisateur}
    """
    # Pour l'instant, on considère qu'un utilisateur qui existe est actif
    # Si un champ "est_actif" est ajouté au modèle, décommenter le code suivant:
    # if not current_user.est_actif:
    #     raise HTTPException(
    #         status_code=status.HTTP_400_BAD_REQUEST,
    #         detail="Utilisateur inactif"
    #     )
    
    return current_user


def get_current_admin_user(
    current_user: Utilisateur = Depends(get_current_user)
) -> Utilisateur:
    """
    Dépendance FastAPI pour obtenir l'utilisateur actuel avec le rôle admin.
    
    Vérifie que l'utilisateur a le rôle "admin". Les routes protégées par cette
    dépendance ne sont accessibles qu'aux administrateurs.
    
    Args:
        current_user: Utilisateur obtenu via get_current_user
        
    Returns:
        Utilisateur: L'utilisateur admin
        
    Raises:
        HTTPException 403: Si l'utilisateur n'a pas le rôle admin
        
    Example:
        @router.delete("/users/{user_id}")
        def delete_user(
            user_id: int,
            admin: Utilisateur = Depends(get_current_admin_user)
        ):
            # Seul un admin peut supprimer un utilisateur
            ...
    """
    # Vérifier que l'utilisateur a le rôle admin
    # Si le rôle est None ou différent de "admin", accès refusé
    if not current_user.role or current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé: droits administrateur requis"
        )
    
    return current_user

