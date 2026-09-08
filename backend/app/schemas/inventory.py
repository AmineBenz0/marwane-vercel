"""API schemas for the inventory ledger."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StockBalanceRead(BaseModel):
    id_produit: int
    nom_produit: str
    type_produit: str
    quantite_disponible: Decimal
    cout_unitaire_moyen: Decimal
    valeur_stock: Decimal


class MouvementStockRead(BaseModel):
    id_mouvement_stock: int
    id_produit: int
    quantite_delta: Decimal
    cout_unitaire: Decimal
    type_mouvement: str
    source_type: str
    source_id: Optional[int] = None
    date_mouvement: datetime
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StockAdjustmentCreate(BaseModel):
    id_produit: int
    quantite_delta: Decimal
    cout_unitaire: Decimal = Field(0, ge=0)
    notes: str = Field(..., min_length=3, max_length=500)

    @field_validator("quantite_delta")
    @classmethod
    def validate_delta(cls, value: Decimal) -> Decimal:
        if value == 0:
            raise ValueError("La variation de stock ne peut pas être nulle")
        return value


class StockReversalCreate(BaseModel):
    raison: str = Field(..., min_length=3, max_length=500)
