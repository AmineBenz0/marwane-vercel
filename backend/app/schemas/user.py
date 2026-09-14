"""
Schémas Pydantic pour la validation des données utilisateurs.
"""
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    """
    Schéma de base pour un utilisateur.
    Contient les champs communs à tous les schémas utilisateur.
    """
    nom_utilisateur: str = Field(
        ...,
        min_length=2,
        max_length=255,
        description="Nom de l'utilisateur"
    )
    email: EmailStr = Field(
        ...,
        description="Email de l'utilisateur (doit être unique)"
    )
    role: Optional[str] = Field(
        None,
        max_length=50,
        description="Rôle de l'utilisateur (admin, comptable, etc.)"
    )


class UserCreate(UserBase):
    """
    Schéma pour créer un nouvel utilisateur.
    Inclut le mot de passe en clair qui sera hashé avant stockage.
    """
    mot_de_passe: str = Field(
        ...,
        max_length=100,
        description="Mot de passe en clair (sera hashé avant stockage)"
    )

    @field_validator('mot_de_passe')
    @classmethod
    def validate_password(cls, v: str) -> str:
        """
        Valide que le mot de passe respecte les règles de sécurité :
        - Minimum 8 caractères
        - Au moins une lettre majuscule
        - Au moins une lettre minuscule
        - Au moins un chiffre
        - Au moins un caractère spécial
        """
        if len(v) < 8:
            raise ValueError("Le mot de passe doit contenir au moins 8 caractères")
        
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in v)
        
        if not has_upper:
            raise ValueError("Le mot de passe doit contenir au moins une lettre majuscule")
        if not has_lower:
            raise ValueError("Le mot de passe doit contenir au moins une lettre minuscule")
        if not has_digit:
            raise ValueError("Le mot de passe doit contenir au moins un chiffre")
        if not has_special:
            raise ValueError("Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&*()_+-=[]{}|;:,.<>?)")
        
        return v

    @field_validator('nom_utilisateur')
    @classmethod
    def validate_nom_utilisateur(cls, v: str) -> str:
        """Valide que le nom d'utilisateur n'est pas vide après trim."""
        v = v.strip()
        if not v:
            raise ValueError("Le nom d'utilisateur ne peut pas être vide")
        return v


class UserUpdate(BaseModel):
    """
    Schéma pour mettre à jour un utilisateur.
    Tous les champs sont optionnels pour permettre des mises à jour partielles.
    """
    nom_utilisateur: Optional[str] = Field(
        None,
        min_length=2,
        max_length=255,
        description="Nom de l'utilisateur"
    )
    email: Optional[EmailStr] = Field(
        None,
        description="Email de l'utilisateur"
    )
    role: Optional[str] = Field(
        None,
        max_length=50,
        description="Rôle de l'utilisateur"
    )
    mot_de_passe: Optional[str] = Field(
        None,
        max_length=100,
        description="Nouveau mot de passe (sera hashé avant stockage)"
    )

    @field_validator('mot_de_passe')
    @classmethod
    def validate_password(cls, v: Optional[str]) -> Optional[str]:
        """Valide le mot de passe si fourni."""
        if v is None:
            return v
        return UserCreate.validate_password(v)

    @field_validator('nom_utilisateur')
    @classmethod
    def validate_nom_utilisateur(cls, v: Optional[str]) -> Optional[str]:
        """Valide le nom d'utilisateur si fourni."""
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom d'utilisateur ne peut pas être vide")
        return v


class UserRead(UserBase):
    """
    Schéma pour lire un utilisateur.
    Inclut les champs générés automatiquement (id, dates, est_actif).
    Ne contient jamais le mot de passe (même hashé).
    """
    id_utilisateur: int = Field(..., description="Identifiant unique de l'utilisateur")
    est_actif: bool = Field(True, description="Indique si l'utilisateur est actif")
    date_creation: datetime = Field(..., description="Date de création de l'utilisateur")
    date_modification: datetime = Field(..., description="Date de dernière modification")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy
