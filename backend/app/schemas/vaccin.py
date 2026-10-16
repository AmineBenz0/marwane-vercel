from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class VaccinRead(BaseModel):
    id_vaccin: int
    nom: str
    prix_defaut: Optional[Decimal] = None
    unite: str
    model_config = ConfigDict(from_attributes=True)


class DepenseVaccinInput(BaseModel):
    id_charge: Optional[int] = Field(None, gt=0)
    id_vaccin: int = Field(..., gt=0)
    quantite: Decimal = Field(..., gt=0, max_digits=12, decimal_places=3)
    prix_unitaire: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    id_compte: Optional[int] = Field(None, gt=0)
