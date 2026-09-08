from datetime import date
from decimal import Decimal
from typing import List
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
    ventes: Decimal
    achats: Decimal
    charges: Decimal
    caisse_entrees: Decimal
    caisse_sorties: Decimal
    solde_caisse: Decimal
    banques_entrees: Decimal
    banques_sorties: Decimal
    soldes_bancaires: List[BankBalance]
    creances: Decimal
    dettes: Decimal
    top_clients: List[RankedTotal]
    top_fournisseurs: List[RankedTotal]
    top_produits: List[RankedTotal]
    inventory_movements: int
    inventory_quantity_delta: Decimal
