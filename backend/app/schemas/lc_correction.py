"""Explicit corrections to a letter of credit and its current usage."""
from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class LCChanges(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    montant: Decimal | None = Field(None, gt=0, max_digits=15, decimal_places=2)
    date_emission: date | None = None
    date_disponibilite: date | None = None
    id_client: int | None = Field(None, gt=0)
    id_fournisseur: int | None = Field(None, gt=0)
    date_effet: date | None = None
    id_compte: int | None = Field(None, gt=0)
    notes: str | None = Field(None, max_length=4000)

    @model_validator(mode='after')
    def validate_fields(self):
        if any(getattr(self, k) is None for k in self.model_fields_set - {'notes', 'id_client', 'id_fournisseur'}):
            raise ValueError('Les valeurs financières et les dates doivent être renseignées.')
        if {'id_client', 'id_fournisseur'}.intersection(self.model_fields_set):
            if (self.id_client is None) == (self.id_fournisseur is None):
                raise ValueError('Sélectionnez un seul détenteur.')
        return self


class LCCorrectionCommand(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    operation_id: UUID
    id_lc: int = Field(gt=0)
    expected_version: int = Field(ge=0)
    action: Literal['correct', 'cancel_usage'] = 'correct'
    reason: str = Field(min_length=3, max_length=1000)
    changes: LCChanges = Field(default_factory=LCChanges)

    @model_validator(mode='after')
    def validate_action(self):
        if (self.action == 'correct') != bool(self.changes.model_fields_set):
            raise ValueError('Indiquez les corrections ou choisissez uniquement l’annulation de l’utilisation.')
        return self


class LCCorrectionApply(BaseModel):
    model_config = ConfigDict(extra='forbid')
    command: LCCorrectionCommand
    dependency_fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
