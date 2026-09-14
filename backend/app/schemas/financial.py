"""Schemas for receivables and payables reporting."""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class FinancialTransactionRead(BaseModel):
    id_transaction: int
    date_transaction: date
    date_echeance: Optional[date] = None
    id_client: Optional[int] = None
    id_fournisseur: Optional[int] = None
    id_produit: int
    client_nom: Optional[str] = None
    fournisseur_nom: Optional[str] = None
    produit_nom: Optional[str] = None
    montant_total: Decimal
    montant_paye: Decimal
    montant_restant: Decimal
    statut_paiement: str
    est_en_retard: bool
    nombre_paiements: int
    date_creation: datetime

    model_config = ConfigDict(from_attributes=True)


class FinancialSummary(BaseModel):
    total: Decimal
    paye: Decimal
    reste: Decimal
    count: int
    overdue_count: int


class FinancialCollectionRead(BaseModel):
    items: List[FinancialTransactionRead]
    summary: FinancialSummary
    skip: int
    limit: int

