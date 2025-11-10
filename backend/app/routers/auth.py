"""
Router FastAPI pour l'authentification.
Gère les endpoints de connexion et de rafraîchissement de tokens.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import Utilisateur
from app.models.audit import AuditConnexion
from app.schemas.auth import LoginRequest, TokenResponse, RefreshTokenRequest, RefreshTokenResponse
from app.utils.security import verify_password, create_access_token, create_refresh_token, decode_token
from app.utils.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_client_ip(request: Request) -> str:
    """
    Extrait l'adresse IP du client depuis la requête.
    Gère les proxies et les headers X-Forwarded-For.
    
    Args:
        request: Objet Request FastAPI
        
    Returns:
        Adresse IP du client
    """
    # Vérifier d'abord les headers de proxy
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Prendre la première IP (client original)
        return forwarded_for.split(",")[0].strip()
    
    # Vérifier le header X-Real-IP
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # Sinon, utiliser l'adresse IP directe
    if request.client:
        return request.client.host
    
    return "unknown"


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def login(
    login_data: LoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Endpoint de connexion.
    
    Authentifie un utilisateur avec son email et mot de passe.
    Retourne un access token et un refresh token si les identifiants sont valides.
    Enregistre la tentative de connexion dans Audit_Connexions.
    
    Args:
        login_data: Données de connexion (email et mot de passe)
        request: Objet Request FastAPI pour extraire l'IP et le user agent
        db: Session de base de données
        
    Returns:
        TokenResponse contenant access_token et refresh_token
        
    Raises:
        HTTPException 401: Si les identifiants sont invalides
    """
    # Extraire l'adresse IP et le user agent
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "unknown")
    
    # Rechercher l'utilisateur par email
    user = db.query(Utilisateur).filter(Utilisateur.email == login_data.email).first()
    
    # Vérifier si l'utilisateur existe et si le mot de passe est correct
    if not user or not verify_password(login_data.mot_de_passe, user.mot_de_passe_hash):
        # Enregistrer la tentative échouée dans Audit_Connexions
        audit_connexion = AuditConnexion(
            email_utilisateur=login_data.email,
            succes=False,
            adresse_ip=client_ip,
            user_agent=user_agent
        )
        db.add(audit_connexion)
        db.commit()
        
        # Lever une exception 401
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Créer les tokens JWT
    token_data = {
        "sub": str(user.id_utilisateur),
        "email": user.email,
        "role": user.role
    }
    
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)
    
    # Enregistrer la tentative réussie dans Audit_Connexions
    audit_connexion = AuditConnexion(
        email_utilisateur=user.email,
        succes=True,
        adresse_ip=client_ip,
        user_agent=user_agent
    )
    db.add(audit_connexion)
    db.commit()
    
    # Retourner les tokens
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer"
    )


@router.post("/refresh", response_model=RefreshTokenResponse, status_code=status.HTTP_200_OK)
async def refresh_token(
    refresh_data: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """
    Endpoint de rafraîchissement de token.
    
    Valide un refresh token et retourne un nouveau access token.
    Le refresh token doit être valide et de type "refresh".
    
    Args:
        refresh_data: Données contenant le refresh token à valider
        db: Session de base de données
        
    Returns:
        RefreshTokenResponse contenant le nouveau access_token
        
    Raises:
        HTTPException 401: Si le refresh token est invalide, expiré ou n'est pas de type "refresh"
    """
    from jose import JWTError
    
    try:
        # Décoder et valider le refresh token
        payload = decode_token(refresh_data.refresh_token)
        
        # Vérifier que c'est bien un refresh token
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalide: ce n'est pas un refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Extraire les informations de l'utilisateur depuis le payload
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalide: informations utilisateur manquantes",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Vérifier que l'utilisateur existe toujours
        user = db.query(Utilisateur).filter(Utilisateur.id_utilisateur == int(user_id)).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalide: utilisateur introuvable",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Créer un nouveau access token avec les données de l'utilisateur
        token_data = {
            "sub": str(user.id_utilisateur),
            "email": user.email,
            "role": user.role
        }
        
        new_access_token = create_access_token(data=token_data)
        
        # Retourner le nouveau access token
        return RefreshTokenResponse(
            access_token=new_access_token,
            token_type="bearer"
        )
        
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )

