"""
Schémas Pydantic pour la validation des données clients.
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional
from datetime import datetime


class ClientBase(BaseModel):
    """
    Schéma de base pour un client.
    Contient les champs communs à tous les schémas client.
    """
    nom_client: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Nom du client"
    )
    est_actif: bool = Field(
        True,
        description="Indique si le client est actif (soft delete)"
    )


class ClientCreate(ClientBase):
    """
    Schéma pour créer un nouveau client.
    """
    @field_validator('nom_client')
    @classmethod
    def validate_nom_client(cls, v: str) -> str:
        """Valide que le nom du client n'est pas vide après trim."""
        v = v.strip()
        if not v:
            raise ValueError("Le nom du client ne peut pas être vide")
        return v


class ClientUpdate(BaseModel):
    """
    Schéma pour mettre à jour un client.
    Tous les champs sont optionnels pour permettre des mises à jour partielles.
    """
    nom_client: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Nom du client"
    )
    est_actif: Optional[bool] = Field(
        None,
        description="Indique si le client est actif (soft delete)"
    )

    @field_validator('nom_client')
    @classmethod
    def validate_nom_client(cls, v: Optional[str]) -> Optional[str]:
        """Valide le nom du client si fourni."""
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom du client ne peut pas être vide")
        return v


class ClientRead(ClientBase):
    """
    Schéma pour lire un client.
    Inclut les champs générés automatiquement (id, dates).
    """
    id_client: int = Field(..., description="Identifiant unique du client")
    date_creation: datetime = Field(..., description="Date de création du client")
    date_modification: datetime = Field(..., description="Date de dernière modification")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy

