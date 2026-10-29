"""Shared envelope for future preview/apply commands, with no financial bypass."""
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


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
