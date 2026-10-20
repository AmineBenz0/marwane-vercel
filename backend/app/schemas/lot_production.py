from datetime import date
from pydantic import BaseModel, Field, model_validator


class LotAllocation(BaseModel):
    id_batiment: int = Field(..., gt=0)
    effectif_initial: int = Field(..., gt=0)


class LotProductionCreate(BaseModel):
    nom_lot: str = Field(..., min_length=1, max_length=100)
    date_debut: date
    age_depart_semaines: int = Field(0, ge=0)
    effectif_initial: int = Field(..., gt=0)
    souche: str | None = Field(None, max_length=100)
    duree_semaines: int = Field(100, gt=0)
    date_fin_prevue: date | None = None
    notes: str | None = None
    repartitions: list[LotAllocation] = Field(..., min_length=1, max_length=1)

    @model_validator(mode="after")
    def validate_single_building_lot(self):
        if len(self.repartitions) != 1:
            raise ValueError("Un lot doit être rattaché à un seul bâtiment.")
        allocation = self.repartitions[0]
        if allocation.effectif_initial != self.effectif_initial:
            raise ValueError("L'effectif initial du lot doit correspondre à celui de son cycle bâtiment.")
        if self.date_fin_prevue and self.date_fin_prevue < self.date_debut:
            raise ValueError("La date de fin prévue doit suivre l'arrivée.")
        return self
