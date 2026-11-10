"""An explicit money return, separate from correcting a sale or payment."""
from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RefundCommand(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    operation_id: UUID
    id_transaction: int = Field(gt=0)
    date_paiement: date
    montant: Decimal = Field(gt=0, max_digits=15, decimal_places=2)
    type_paiement: Literal['cash', 'virement']
    id_compte: int | None = Field(None, gt=0)
    reason: str = Field(min_length=3, max_length=1000)

    @model_validator(mode='after')
    def validate_account(self):
        if (self.type_paiement == 'virement') != (self.id_compte is not None):
            raise ValueError('Choisissez un compte pour un virement et aucun compte pour les espèces.')
        return self


class RefundApplyCommand(RefundCommand):
    dependency_fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
