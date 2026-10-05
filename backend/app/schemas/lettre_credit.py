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
    numero_serie: Optional[str] = Field(None, max_length=50, description="Numéro de série interne ou supplémentaire")
    banque_emettrice: Optional[str] = Field(None, max_length=100, description="Banque émettrice (optionnel)")
    montant: Decimal = Field(..., gt=0, description="Montant total de la LC")
    date_emission: date = Field(..., description="Date d'émission")
    date_disponibilite: date = Field(..., description="Date à laquelle la LC devient utilisable")
    id_client: Optional[int] = Field(None, description="ID du client détenteur")
    notes: Optional[str] = Field(None, description="Notes additionnelles")


class LettreCreditCreate(LettreCreditBase):
    """
    Schéma pour créer une nouvelle LC.
    Le type_detenteur est toujours 'client', pas besoin de le spécifier.
    """
    pass


class LettreCreditUpdate(BaseModel):
    """
    Schéma pour mettre à jour une LC.
    """
    numero_reference: Optional[str] = Field(None, max_length=50)
    numero_serie: Optional[str] = Field(None, max_length=50)
    banque_emettrice: Optional[str] = Field(None, max_length=100)
    montant: Optional[Decimal] = Field(None, gt=0)
    date_emission: Optional[date] = Field(None)
    date_disponibilite: Optional[date] = Field(None)
    id_client: Optional[int] = Field(None)
    notes: Optional[str] = Field(None)

class LettreCreditRead(BaseModel):
    """
    Schéma pour lire une LC.
    """
    id_lc: int
    numero_reference: str
    numero_serie: Optional[str] = None
    banque_emettrice: Optional[str] = None
    montant: Decimal
    date_emission: date
    date_disponibilite: date
    type_detenteur: str = 'client'
    id_client: Optional[int] = None
    id_fournisseur: Optional[int] = None
    notes: Optional[str] = None
    statut: str
    version_utilisation: int = 0
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
    numero_serie: Optional[str] = None
    banque_emettrice: Optional[str] = None
    montant: Decimal
    statut: str
    version_utilisation: int = 0
    date_disponibilite: date
    type_detenteur: str = 'client'
    detenteur_nom: Optional[str] = None
    est_disponible: bool = False

    model_config = ConfigDict(from_attributes=True)


class LettreCreditVerserBanque(BaseModel):
    id_compte: int = Field(..., description="Compte bancaire qui recoit la valeur de la LC")
    version_utilisation: int = Field(..., ge=0, description="Version de la LC affichée au moment de l'action")
    notes: Optional[str] = Field(None, description="Notes optionnelles")


class LettreCreditPayerFournisseur(BaseModel):
    id_fournisseur: int = Field(..., description="Fournisseur paye avec la LC")
    date_cession: date = Field(..., description="Date du paiement fournisseur")
    version_utilisation: int = Field(..., ge=0, description="Version de la LC affichée au moment de l'action")
    notes: Optional[str] = Field(None, description="Notes optionnelles")


class LettreCreditAnnuler(BaseModel):
    raison: str = Field(..., min_length=1, max_length=1000, description="Raison de l'annulation")
    version_utilisation: int = Field(..., ge=1, description="Version de l'utilisation à annuler")

    @field_validator("raison")
    @classmethod
    def validate_raison(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("La raison de l'annulation est obligatoire")
        return value
