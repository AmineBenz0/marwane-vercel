"""
Schémas Pydantic pour l'authentification.
"""
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    """
    Schéma pour la requête de connexion.
    """
    email: EmailStr = Field(..., description="Email de l'utilisateur")
    mot_de_passe: str = Field(..., description="Mot de passe de l'utilisateur")


class TokenResponse(BaseModel):
    """
    Schéma pour la réponse contenant les tokens JWT.
    """
    access_token: str = Field(..., description="Token JWT d'accès (expire en 15 minutes)")
    refresh_token: str = Field(..., description="Token JWT de rafraîchissement (expire en 7 jours)")
    token_type: str = Field(default="bearer", description="Type de token (toujours 'bearer')")


class RefreshTokenRequest(BaseModel):
    """
    Schéma pour la requête de rafraîchissement de token.
    """
    refresh_token: str = Field(..., description="Token JWT de rafraîchissement à valider")


class RefreshTokenResponse(BaseModel):
    """
    Schéma pour la réponse de rafraîchissement de token.
    """
    access_token: str = Field(..., description="Nouveau token JWT d'accès (expire en 15 minutes)")
    token_type: str = Field(default="bearer", description="Type de token (toujours 'bearer')")
