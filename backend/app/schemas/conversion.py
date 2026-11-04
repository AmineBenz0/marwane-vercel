"""Explicit sale-to-purchase and purchase-to-sale replacement contract."""
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConversionPreviewCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(gt=0)
    id_contact_cible: int = Field(gt=0)
    id_produit_cible: int = Field(gt=0)
    quantite: int = Field(gt=0)
    prix_unitaire: Decimal = Field(gt=0, max_digits=15, decimal_places=2)

    @field_validator("prix_unitaire")
    @classmethod
    def exact_cents(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class ConversionApplyCommand(ConversionPreviewCommand):
    operation_id: UUID
    dependency_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    annuler_paiements_existants: bool = False
