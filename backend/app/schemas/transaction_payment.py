"""Request and response schemas for atomic transaction/payment creation."""

from typing import List
from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.paiement import PaiementBase, PaiementRead
from app.schemas.transaction import TransactionCreate, TransactionRead


class TransactionPaymentBatchItem(BaseModel):
    """One transaction and the payments that belong to it."""

    model_config = ConfigDict(extra="forbid")

    client_ref: str = Field(..., min_length=1, max_length=100)
    transaction: TransactionCreate
    paiements: List[PaiementBase] = Field(default_factory=list)
    montant_avance: Decimal = Field(default=Decimal('0'), ge=0, max_digits=15, decimal_places=2)
    date_avance: date | None = None

    @model_validator(mode='after')
    def validate_mixed_money(self):
        if self.montant_avance > 0 and any(p.montant != p.montant.quantize(Decimal('0.01'))
                or p.montant > Decimal('9999999999999.99') for p in self.paiements):
            raise ValueError('Le complément doit être exprimé au centime et respecter la limite du paiement.')
        return self


class TransactionPaymentBatchCreate(BaseModel):
    """Atomic batch request; empty payment lists mean pay later."""

    model_config = ConfigDict(extra="forbid")

    items: List[TransactionPaymentBatchItem] = Field(..., min_length=1)
    operation_id: UUID | None = None

    @model_validator(mode="after")
    def validate_unique_client_refs(self):
        refs = [item.client_ref for item in self.items]
        if len(refs) != len(set(refs)):
            raise ValueError("Chaque transaction doit avoir un client_ref unique")
        if any(item.montant_avance > 0 for item in self.items) and self.operation_id is None:
            raise ValueError('La création avec avance nécessite une identité de confirmation.')
        return self


class TransactionPaymentBatchItemRead(BaseModel):
    """Result preserving the client row reference for clear response mapping."""

    client_ref: str
    transaction: TransactionRead
    paiements: List[PaiementRead]

