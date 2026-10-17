"""Request and response schemas for atomic transaction/payment creation."""

from typing import List

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.paiement import PaiementBase, PaiementRead
from app.schemas.transaction import TransactionCreate, TransactionRead


class TransactionPaymentBatchItem(BaseModel):
    """One transaction and the payments that belong to it."""

    model_config = ConfigDict(extra="forbid")

    client_ref: str = Field(..., min_length=1, max_length=100)
    transaction: TransactionCreate
    paiements: List[PaiementBase] = Field(default_factory=list)


class TransactionPaymentBatchCreate(BaseModel):
    """Atomic batch request; empty payment lists mean pay later."""

    model_config = ConfigDict(extra="forbid")

    items: List[TransactionPaymentBatchItem] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_unique_client_refs(self):
        refs = [item.client_ref for item in self.items]
        if len(refs) != len(set(refs)):
            raise ValueError("Chaque transaction doit avoir un client_ref unique")
        return self


class TransactionPaymentBatchItemRead(BaseModel):
    """Result preserving the client row reference for clear response mapping."""

    client_ref: str
    transaction: TransactionRead
    paiements: List[PaiementRead]
