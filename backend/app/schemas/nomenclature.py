"""API schemas for product BOMs."""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class NomenclatureLigneCreate(BaseModel):
    id_produit_entree: int
    quantite: Decimal = Field(..., gt=0)


class NomenclatureLigneRead(NomenclatureLigneCreate):
    id_ligne: int
    nom_produit: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NomenclatureCreate(BaseModel):
    id_produit_sortie: int
    version: int = Field(1, gt=0)
    est_active: bool = True
    date_debut: Optional[date] = None
    date_fin: Optional[date] = None
    quantite_sortie: Decimal = Field(1, gt=0)
    rendement_pct: Decimal = Field(100, gt=0, le=100)
    notes: Optional[str] = Field(None, max_length=1000)
    lignes: List[NomenclatureLigneCreate] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_dates_and_duplicates(self):
        if self.date_debut and self.date_fin and self.date_fin < self.date_debut:
            raise ValueError("La date de fin doit être postérieure à la date de début")
        ids = [ligne.id_produit_entree for ligne in self.lignes]
        if len(ids) != len(set(ids)):
            raise ValueError("Un produit ne peut apparaître qu'une seule fois dans une nomenclature")
        if self.id_produit_sortie in ids:
            raise ValueError("Une nomenclature ne peut pas consommer son propre produit fini")
        return self


class NomenclatureRead(NomenclatureCreate):
    id_nomenclature: int
    date_creation: datetime
    id_utilisateur: Optional[int] = None
    produit_sortie_nom: Optional[str] = None
    lignes: List[NomenclatureLigneRead]

    model_config = ConfigDict(from_attributes=True)


class TransformationLigneCreate(BaseModel):
    id_produit: int
    quantite: Decimal = Field(..., gt=0)
    type_ligne: Literal["INPUT", "OUTPUT", "input", "output"]


class TransformationLigneRead(TransformationLigneCreate):
    id_ligne: int
    nom_produit: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TransformationCreate(BaseModel):
    date_transformation: date
    id_nomenclature: Optional[int] = None
    quantite_sortie: Optional[Decimal] = Field(None, gt=0)
    cle_idempotence: Optional[str] = Field(None, min_length=8, max_length=120)
    notes: Optional[str] = Field(None, max_length=1000)
    lignes: List["TransformationLigneCreate"] = Field(default_factory=list)


class TransformationRead(BaseModel):
    id_transformation: int
    id_nomenclature: Optional[int] = None
    date_transformation: date
    quantite_sortie: Optional[Decimal] = None
    cout_total: Optional[Decimal] = None
    notes: Optional[str] = None
    date_creation: datetime
    lignes: List["TransformationLigneRead"]

    model_config = ConfigDict(from_attributes=True)


class TransformationPreviewLine(BaseModel):
    id_produit: int
    nom_produit: str
    quantite_requise: Decimal
    quantite_disponible: Decimal
    cout_unitaire_moyen: Decimal
    suffisant: bool


class TransformationPreviewRead(BaseModel):
    id_nomenclature: Optional[int] = None
    quantite_sortie: Decimal
    cout_total: Decimal
    cout_unitaire_sortie: Decimal
    stock_suffisant: bool
    lignes_entree: List[TransformationPreviewLine]
