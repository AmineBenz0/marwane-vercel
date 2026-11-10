"""Explicit advance, return and non-cash allocation commands."""
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, Union
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class CreditBase(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    operation_id: UUID
    reason: str = Field(min_length=3, max_length=1000)


class MoneyCredit(CreditBase):
    date_effet: date
    montant: Decimal = Field(gt=0, max_digits=15, decimal_places=2)
    type_paiement: Literal['cash', 'virement']
    id_compte: int | None = Field(None, gt=0)

    @model_validator(mode='after')
    def account_matches_method(self):
        if (self.type_paiement == 'virement') != (self.id_compte is not None):
            raise ValueError('Choisissez un compte pour un virement et aucun compte pour les espèces.')
        return self


class AdvanceCommand(MoneyCredit):
    action: Literal['advance']
    id_client: int | None = Field(None, gt=0)
    id_fournisseur: int | None = Field(None, gt=0)

    @model_validator(mode='after')
    def one_party(self):
        if (self.id_client is None) == (self.id_fournisseur is None):
            raise ValueError('Choisissez un client ou un fournisseur.')
        return self


class ReturnAdvanceCommand(MoneyCredit):
    action: Literal['return_advance']
    id_avance: UUID


class AllocateCommand(CreditBase):
    action: Literal['allocate']
    id_transaction_cible: int = Field(gt=0)
    id_transaction_source: int | None = Field(None, gt=0)
    id_avance: UUID | None = None
    date_effet: date
    montant: Decimal = Field(gt=0, max_digits=15, decimal_places=2)

    @model_validator(mode='after')
    def one_source(self):
        if (self.id_transaction_source is None) == (self.id_avance is None):
            raise ValueError('Choisissez une seule origine de crédit.')
        if self.id_transaction_source == self.id_transaction_cible:
            raise ValueError('Le crédit doit être affecté à une autre transaction.')
        return self


class CancelAllocationCommand(CreditBase):
    action: Literal['cancel_allocation']
    id_affectation: UUID


class CancelAdvanceCommand(CreditBase):
    action: Literal['cancel_advance']
    id_avance: UUID


CreditCommand = Annotated[Union[AdvanceCommand, ReturnAdvanceCommand, AllocateCommand,
                              CancelAllocationCommand, CancelAdvanceCommand], Field(discriminator='action')]


class CreditApply(BaseModel):
    model_config = ConfigDict(extra='forbid')
    command: CreditCommand
    dependency_fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
