from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional

class CompteBancaireBase(BaseModel):
    nom_banque: str
    numero_compte: str
    solde_actuel: Decimal = Decimal('0.00')

class CompteBancaireCreate(BaseModel):
    nom_banque: str
    numero_compte: str
    solde_initial: Decimal = Decimal('0.00')

class CompteBancaireRead(BaseModel):
    id_compte: int
    nom_banque: str
    numero_compte: str
    solde_actuel: Decimal
    date_modification: datetime

    class Config:
        from_attributes = True

class MouvementBancaireRead(BaseModel):
    id_mouvement: int
    id_compte: int
    date_mouvement: datetime
    montant: Decimal
    type_mouvement: str
    source: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    id_paiement: Optional[int] = None

    class Config:
        from_attributes = True
