from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


CycleStatus = Literal["actif", "a_cloturer", "termine"]


class CycleProductionBase(BaseModel):
    id_batiment: int = Field(..., description="Batiment du lot")
    nom_cycle: str = Field(..., min_length=1, max_length=100, description="Nom du lot")
    souche: Optional[str] = Field(None, max_length=100, description="Souche du lot")
    date_debut: date = Field(..., description="Date de debut du lot")
    age_depart_semaines: int = Field(0, ge=0, description="Age des poussins au debut du lot")
    effectif_initial: Optional[int] = Field(None, gt=0, description="Nombre de poussins entrants")
    duree_semaines: int = Field(100, gt=0, description="Duree prevue du lot en semaines")
    date_fin_prevue: Optional[date] = Field(None, description="Date de fin prevue")
    notes: Optional[str] = Field(None, description="Notes internes")

    @model_validator(mode="after")
    def validate_dates(self):
        if self.date_fin_prevue and self.date_fin_prevue < self.date_debut:
            raise ValueError("La date de fin prevue doit etre apres la date de debut")
        return self


class CycleProductionCreate(CycleProductionBase):
    effectif_initial: int = Field(..., gt=0, description="Nombre de poussins entrants")


class CycleProductionUpdate(BaseModel):
    nom_cycle: Optional[str] = Field(None, min_length=1, max_length=100)
    souche: Optional[str] = Field(None, max_length=100)
    date_debut: Optional[date] = None
    age_depart_semaines: Optional[int] = Field(None, ge=0)
    effectif_initial: Optional[int] = Field(None, gt=0)
    duree_semaines: Optional[int] = Field(None, gt=0)
    date_fin_prevue: Optional[date] = None
    notes: Optional[str] = None


class CycleProductionTerminate(BaseModel):
    date_fin_reelle: Optional[date] = None


class CycleProductionRead(BaseModel):
    id_cycle: int
    id_batiment: int
    nom_batiment: Optional[str] = None
    nom_cycle: str
    souche: Optional[str] = None
    date_debut: date
    age_depart_semaines: int
    effectif_initial: Optional[int] = None
    duree_semaines: int
    date_fin_prevue: date
    date_fin_reelle: Optional[date] = None
    statut: CycleStatus
    notes: Optional[str] = None
    effectif_actuel: Optional[int] = None
    age_semaines: Optional[int] = None
    semaine_cycle: Optional[int] = None
    phase_code: Optional[str] = None
    phase_label: Optional[str] = None
    jours_restants: Optional[int] = None
    date_creation: datetime
    date_modification: datetime
    id_utilisateur_creation: Optional[int] = None
    id_utilisateur_modification: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)
