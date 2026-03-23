"""
Schémas Pydantic pour la validation des données des Charges (Dépenses).
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal


class ChargeBase(BaseModel):
    """
    Schéma de base pour une charge.
    """
    libelle: str = Field(..., max_length=200, description="Libellé de la dépense")
    montant: Decimal = Field(..., gt=0, description="Montant de la dépense")
    date_charge: date = Field(..., description="Date de la dépense")
    categorie: str = Field(..., max_length=50, description="Catégorie (Fixe, Variable, Divers)")
    notes: Optional[str] = Field(None, description="Notes additionnelles")
    id_compte: Optional[int] = Field(None, description="ID du compte bancaire (optionnel)")


class ChargeCreate(ChargeBase):
    """
    Schéma pour créer une nouvelle charge.
    """
    pass


class ChargeUpdate(BaseModel):
    """
    Schéma pour mettre à jour une charge.
    """
    libelle: Optional[str] = Field(None, max_length=200)
    montant: Optional[Decimal] = Field(None, gt=0)
    date_charge: Optional[date] = Field(None)
    categorie: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None)


class ChargeRead(ChargeBase):
    """
    Schéma pour lire une charge.
    """
    id_charge: int
    date_creation: datetime
    date_modification: datetime
    id_utilisateur_creation: Optional[int]
    id_utilisateur_modification: Optional[int]

    model_config = ConfigDict(from_attributes=True)


class ChargeSummary(BaseModel):
    """
    Résumé des charges par catégorie.
    """
    categorie: str
    total: Decimal
    count: int
