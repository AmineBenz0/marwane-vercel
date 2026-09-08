from datetime import date
from decimal import Decimal
from typing import List
from pydantic import BaseModel


class RankedTotal(BaseModel):
    id: int
    label: str
    total: Decimal


class MonthlyReport(BaseModel):
    month: str
    date_debut: date
    date_fin: date
    ventes: Decimal
    achats: Decimal
    charges: Decimal
    caisse_entrees: Decimal
    caisse_sorties: Decimal
    banques_entrees: Decimal
    banques_sorties: Decimal
    creances: Decimal
    dettes: Decimal
    top_clients: List[RankedTotal]
    top_fournisseurs: List[RankedTotal]
    top_produits: List[RankedTotal]
    inventory_movements: Decimal

