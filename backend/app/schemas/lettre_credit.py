"""
Schémas Pydantic pour la validation des données des Lettres de Crédit (LC).
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal


class LettreCreditBase(BaseModel):
    """
    Schéma de base pour une Lettre de Crédit.
    """
    numero_reference: str = Field(..., max_length=50, description="Numéro de référence unique")
    banque_emettrice: str = Field(..., max_length=100, description="Banque émettrice")
    montant: Decimal = Field(..., gt=0, description="Montant total de la LC")
    date_emission: date = Field(..., description="Date d'émission")
    date_disponibilite: date = Field(..., description="Date à laquelle la LC devient utilisable")
    date_expiration: date = Field(..., description="Date d'expiration")
    type_detenteur: str = Field(..., description="Type du détenteur (client ou fournisseur)")
    id_client: Optional[int] = Field(None, description="ID du client détenteur")
    id_fournisseur: Optional[int] = Field(None, description="ID du fournisseur détenteur")
    notes: Optional[str] = Field(None, description="Notes additionnelles")

    @field_validator('type_detenteur')
    @classmethod
    def validate_type_detenteur(cls, v: str) -> str:
        types_valides = ['client', 'fournisseur']
        if v.lower() not in types_valides:
            raise ValueError(f"Type de détenteur invalide. Doit être: {', '.join(types_valides)}")
        return v.lower()


class LettreCreditCreate(LettreCreditBase):
    """
    Schéma pour créer une nouvelle LC.
    """
    pass


class LettreCreditUpdate(BaseModel):
    """
    Schéma pour mettre à jour une LC.
    """
    numero_reference: Optional[str] = Field(None, max_length=50)
    banque_emettrice: Optional[str] = Field(None, max_length=100)
    montant: Optional[Decimal] = Field(None, gt=0)
    date_emission: Optional[date] = Field(None)
    date_disponibilite: Optional[date] = Field(None)
    date_expiration: Optional[date] = Field(None)
    statut: Optional[str] = Field(None)
    type_detenteur: Optional[str] = Field(None)
    id_client: Optional[int] = Field(None)
    id_fournisseur: Optional[int] = Field(None)
    notes: Optional[str] = Field(None)

    @field_validator('statut')
    @classmethod
    def validate_statut(cls, v: Optional[str]) -> Optional[str]:
        if v is None: return v
        statuts_valides = ['active', 'utilisee', 'cedee', 'expiree', 'annulee']
        if v.lower() not in statuts_valides:
            raise ValueError(f"Statut invalide. Doit être: {', '.join(statuts_valides)}")
        return v.lower()


class LettreCreditRead(LettreCreditBase):
    """
    Schéma pour lire une LC.
    """
    id_lc: int
    statut: str
    date_creation: datetime
    date_modification: datetime
    id_utilisateur_creation: Optional[int]
    id_utilisateur_modification: Optional[int]
    
    # Champs additionnels utiles pour le frontend
    est_disponible: bool = False
    detenteur_nom: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class LettreCreditSummary(BaseModel):
    """
    Résumé d'une LC pour les listes.
    """
    id_lc: int
    numero_reference: str
    banque_emettrice: str
    montant: Decimal
    statut: str
    date_disponibilite: date
    date_expiration: date
    detenteur_nom: Optional[str] = None
    est_disponible: bool = False

    model_config = ConfigDict(from_attributes=True)
