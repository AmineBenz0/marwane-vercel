"""
Schémas Pydantic pour la validation des données fournisseurs.
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional
from datetime import datetime


class FournisseurBase(BaseModel):
    """
    Schéma de base pour un fournisseur.
    Contient les champs communs à tous les schémas fournisseur.
    """
    nom_fournisseur: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Nom du fournisseur"
    )
    est_actif: bool = Field(
        True,
        description="Indique si le fournisseur est actif (soft delete)"
    )


class FournisseurCreate(FournisseurBase):
    """
    Schéma pour créer un nouveau fournisseur.
    """
    @field_validator('nom_fournisseur')
    @classmethod
    def validate_nom_fournisseur(cls, v: str) -> str:
        """Valide que le nom du fournisseur n'est pas vide après trim."""
        v = v.strip()
        if not v:
            raise ValueError("Le nom du fournisseur ne peut pas être vide")
        return v


class FournisseurUpdate(BaseModel):
    """
    Schéma pour mettre à jour un fournisseur.
    Tous les champs sont optionnels pour permettre des mises à jour partielles.
    """
    nom_fournisseur: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Nom du fournisseur"
    )
    est_actif: Optional[bool] = Field(
        None,
        description="Indique si le fournisseur est actif (soft delete)"
    )

    @field_validator('nom_fournisseur')
    @classmethod
    def validate_nom_fournisseur(cls, v: Optional[str]) -> Optional[str]:
        """Valide le nom du fournisseur si fourni."""
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom du fournisseur ne peut pas être vide")
        return v


class FournisseurRead(FournisseurBase):
    """
    Schéma pour lire un fournisseur.
    Inclut les champs générés automatiquement (id, dates).
    """
    id_fournisseur: int = Field(..., description="Identifiant unique du fournisseur")
    date_creation: datetime = Field(..., description="Date de création du fournisseur")
    date_modification: datetime = Field(..., description="Date de dernière modification")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy

