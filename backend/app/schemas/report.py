from datetime import date
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel


class RankedTotal(BaseModel):
    id: int
    label: str
    total: Decimal


class BankBalance(BaseModel):
    id_compte: int
    nom_banque: str
    numero_compte: str
    solde: Decimal


class MonthlyReport(BaseModel):
    month: str
    date_debut: date
    date_fin: date
    date_soldes_actuels: Optional[date] = None
    date_soldes_historiques: date
    creances_actuelles: Optional[Decimal] = None
    dettes_actuelles: Optional[Decimal] = None
    ventes: Decimal
    achats: Decimal
    charges: Decimal
    caisse_entrees: Decimal
    caisse_sorties: Decimal
    solde_caisse: Decimal
    solde_caisse_historique: Decimal
    banques_entrees: Decimal
    banques_sorties: Decimal
    soldes_bancaires: List[BankBalance]
    soldes_bancaires_historiques: List[BankBalance]
    creances: Decimal
    dettes: Decimal
    top_clients: List[RankedTotal]
    top_fournisseurs: List[RankedTotal]
    top_produits: List[RankedTotal]
    inventory_movements: int
    inventory_quantity_delta: Decimal
