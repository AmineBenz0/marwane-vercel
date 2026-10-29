"""Shared envelope for future preview/apply commands, with no financial bypass."""
from datetime import date
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
    """Fields supported by the first adapter slice of the correction command.

    Financial dates, amounts, party/product identity, and quantities are kept
    out until their ledger and stock adapters land in later phases.
    """
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    date_echeance: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=4000)

    @model_validator(mode="after")
    def require_one_field(self):
        if not self.model_fields_set:
            raise ValueError("Indiquez au moins une modification.")
        return self


class CorrectionCommand(CorrectionEnvelope):
    changes: CorrectionChanges


class CorrectionPreviewRead(BaseModel):
    operation_id: UUID
    target: CorrectionTarget
    changes: dict
    before: dict
    after: dict
    impact: dict
    can_apply: bool = True


class CorrectionApplyRead(BaseModel):
    operation_id: UUID
    replayed: bool = False
    target: CorrectionTarget
    record: dict
    impact: dict
