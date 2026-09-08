from pydantic import BaseModel, ConfigDict, Field, field_validator
from decimal import Decimal
from datetime import datetime
from typing import Optional, Literal

class CompteBancaireBase(BaseModel):
    nom_banque: str
    numero_compte: str
    solde_actuel: Decimal = Decimal('0.00')

class CompteBancaireCreate(BaseModel):
    nom_banque: str
    numero_compte: str
    solde_initial: Decimal = Decimal('0.00')

class MouvementBancaireCreate(BaseModel):
    montant: Decimal = Field(..., gt=0)
    type_mouvement: Literal['ENTREE', 'SORTIE']
    source: Literal['virement', 'cheque', 'lc', 'autre']
    reference: Optional[str] = None
    notes: Optional[str] = None

    @field_validator('reference', 'notes')
    @classmethod
    def empty_to_none(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None

class CompteBancaireRead(BaseModel):
    id_compte: int
    nom_banque: str
    numero_compte: str
    solde_actuel: Decimal
    date_modification: datetime

    model_config = ConfigDict(from_attributes=True)

class MouvementBancaireRead(BaseModel):
    id_mouvement: int
    id_compte: int
    date_mouvement: datetime
    montant: Decimal
    type_mouvement: str
    source: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    statut: str = "active"
    id_paiement: Optional[int] = None
    id_charge: Optional[int] = None
    motif_annulation: Optional[str] = None
    date_annulation: Optional[datetime] = None
    id_utilisateur_annulation: Optional[int] = None
    id_mouvement_inverse: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)
