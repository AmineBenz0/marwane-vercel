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
    repartitions: list[LotAllocation] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_distribution(self):
        ids = [row.id_batiment for row in self.repartitions]
        if len(ids) != len(set(ids)):
            raise ValueError("Un bâtiment ne peut apparaître qu'une fois dans la répartition.")
        if sum(row.effectif_initial for row in self.repartitions) != self.effectif_initial:
            raise ValueError("La répartition doit correspondre au nombre total de poussins entrants.")
        if self.date_fin_prevue and self.date_fin_prevue < self.date_debut:
            raise ValueError("La date de fin prévue doit suivre l'arrivée.")
        return self
