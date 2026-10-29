"""Shared envelope for future preview/apply commands, with no financial bypass."""
from datetime import date
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class CorrectionTarget(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    entity_type: Literal["transaction", "paiement"]
    entity_id: int = Field(gt=0)
    expected_version: int = Field(gt=0)


class CorrectionEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    operation_id: UUID
    reason: str = Field(min_length=1, max_length=1000)
    target: CorrectionTarget


class CorrectionChanges(BaseModel):
    """Validated fields currently supported by the shared correction command."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    date_echeance: Optional[date] = None
    date_transaction: Optional[date] = None
    id_client: Optional[int] = Field(None, gt=0)
    id_fournisseur: Optional[int] = Field(None, gt=0)
    prix_unitaire: Optional[Decimal] = Field(None, gt=0, max_digits=15, decimal_places=2)
    date_paiement: Optional[date] = None
    montant: Optional[Decimal] = Field(None, gt=0, max_digits=15, decimal_places=2)
    type_paiement: Optional[Literal["cash", "virement", "carte", "compensation", "autre"]] = None
    id_compte: Optional[int] = Field(None, gt=0)
    source_reglement: Optional[Literal["caisse", "banque"]] = None
    notes: Optional[str] = Field(None, max_length=4000)

    @model_validator(mode="after")
    def require_one_field(self):
        if not self.model_fields_set:
            raise ValueError("Indiquez au moins une modification.")
        return self


class CorrectionCommand(CorrectionEnvelope):
    changes: CorrectionChanges


class CorrectionApplyCommand(CorrectionCommand):
    dependency_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")


class CorrectionPreviewRead(BaseModel):
    operation_id: UUID
    target: CorrectionTarget
    changes: dict
    before: dict
    after: dict
    impact: dict
    dependency_fingerprint: str
    can_apply: bool = True


class CorrectionApplyRead(BaseModel):
    operation_id: UUID
    replayed: bool = False
    target: CorrectionTarget
    record: dict
    impact: dict
