"""Advance allocation and optional real payment under one confirmation."""
from datetime import date
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.schemas.credit import CreditBase
from app.schemas.paiement import PaiementBase


class SettlementTarget(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id_transaction: int = Field(gt=0)
    montant: Decimal = Field(ge=0, max_digits=15, decimal_places=2)


class AdvanceSettlementCommand(CreditBase):
    date_effet: date
    id_transaction: int | None = Field(None, gt=0)
    id_client: int | None = Field(None, gt=0)
    id_fournisseur: int | None = Field(None, gt=0)
    id_avance: UUID | None = None
    montant_avance: Decimal | None = Field(None, ge=0, max_digits=15, decimal_places=2)
    cibles: list[SettlementTarget] | None = None
    paiement: PaiementBase | None = None

    @model_validator(mode='after')
    def validate_scope(self):
        if sum(v is not None for v in [self.id_transaction, self.id_client, self.id_fournisseur]) != 1:
            raise ValueError('Choisissez une transaction ou un seul contact.')
        if self.id_transaction is not None and self.cibles is not None:
            raise ValueError('Une transaction ciblée ne reçoit pas de liste de destinations.')
        if self.paiement is not None:
            if self.id_transaction is None or self.paiement.type_paiement not in {'cash', 'virement'}:
                raise ValueError('Le complément concerne une transaction et des espèces ou un virement.')
            if self.paiement.date_paiement != self.date_effet:
                raise ValueError('Le complément et l’utilisation de l’avance doivent avoir la même date.')
            if self.paiement.cle_idempotence is not None or self.paiement.id_lc is not None:
                raise ValueError('La confirmation fournit déjà l’identité de ce règlement.')
            if self.paiement.montant != self.paiement.montant.quantize(Decimal('0.01')) or self.paiement.montant > Decimal('9999999999999.99'):
                raise ValueError('Le complément doit être exprimé au centime et respecter la limite du paiement.')
        if self.cibles is not None and len({t.id_transaction for t in self.cibles}) != len(self.cibles):
            raise ValueError('Une destination ne peut apparaître qu’une fois.')
        return self


class AdvanceSettlementApply(BaseModel):
    model_config = ConfigDict(extra='forbid')
    command: AdvanceSettlementCommand
    dependency_fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
