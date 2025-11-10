"""
Schémas Pydantic pour la validation des données caisse.
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Literal
from datetime import datetime
from decimal import Decimal


class MouvementCaisseBase(BaseModel):
    """
    Schéma de base pour un mouvement de caisse.
    Contient les champs communs à tous les schémas mouvement de caisse.
    """
    montant: Decimal = Field(
        ...,
        gt=0,
        description="Montant du mouvement (doit être strictement positif)"
    )
    type_mouvement: Literal['ENTREE', 'SORTIE'] = Field(
        ...,
        description="Type de mouvement : 'ENTREE' ou 'SORTIE'"
    )
    id_transaction: int = Field(
        ...,
        description="ID de la transaction associée"
    )


class MouvementCaisseCreate(MouvementCaisseBase):
    """
    Schéma pour créer un nouveau mouvement de caisse.
    """
    @field_validator('montant')
    @classmethod
    def validate_montant(cls, v: Decimal) -> Decimal:
        """Valide que le montant est strictement positif."""
        if v <= 0:
            raise ValueError("Le montant doit être strictement positif")
        return v
    
    @field_validator('type_mouvement')
    @classmethod
    def validate_type_mouvement(cls, v: str) -> str:
        """Valide que le type de mouvement est 'ENTREE' ou 'SORTIE'."""
        if v not in ['ENTREE', 'SORTIE']:
            raise ValueError("Le type de mouvement doit être 'ENTREE' ou 'SORTIE'")
        return v


class MouvementCaisseRead(MouvementCaisseBase):
    """
    Schéma pour lire un mouvement de caisse.
    Inclut les champs générés automatiquement (id, date).
    """
    id_mouvement: int = Field(..., description="Identifiant unique du mouvement de caisse")
    date_mouvement: datetime = Field(..., description="Date et heure du mouvement")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy

