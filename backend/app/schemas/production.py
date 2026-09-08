from pydantic import BaseModel, ConfigDict, Field, model_validator
from datetime import date, datetime
from typing import Optional, List, Literal
from decimal import Decimal

class ProductionBase(BaseModel):
    date_production: date = Field(..., description="Date de la production")
    id_cycle: Optional[int] = Field(None, description="ID du lot/cycle de production")
    id_batiment: int = Field(..., description="ID du bâtiment")
    type_oeuf: Literal["normal", "double_jaune", "double_jaune_demarrage", "casse", "blanc", "perdu"] = Field(..., description="Type d'œuf")
    calibre: Optional[Literal["demarrage", "moyen", "gros"]] = Field(None, description="Calibre deduit automatiquement depuis le grammage")
    nombre_oeufs: int = Field(..., gt=0, description="Nombre d'œufs collectés")
    grammage: Decimal = Field(..., ge=0, description="Poids moyen en grammes")
    mortalite: Optional[int] = Field(None, ge=0, description="Nombre de mortalites dans le batiment")
    consommation_aliment_kg: Optional[Decimal] = Field(None, ge=0, description="Aliment consomme en kg")
    formule: Optional[str] = Field(None, max_length=100, description="Formule d'aliment utilisee")

    @model_validator(mode='after')
    def validate_calibre(self) -> 'ProductionBase':
        if self.type_oeuf != 'normal':
            self.calibre = None
        return self


class ProductionCreate(ProductionBase):
    """
    Schema pour la création d'une production.
    Le nombre de cartons est calculé côté serveur.
    """
    pass


class ProductionUpdate(BaseModel):
    """
    Schema pour la mise à jour d'une production.
    """
    date_production: Optional[date] = None
    id_cycle: Optional[int] = None
    id_batiment: Optional[int] = None
    type_oeuf: Optional[Literal["normal", "double_jaune", "double_jaune_demarrage", "casse", "blanc", "perdu"]] = None
    calibre: Optional[Literal["demarrage", "moyen", "gros"]] = None
    nombre_oeufs: Optional[int] = None
    grammage: Optional[Decimal] = None
    mortalite: Optional[int] = None
    consommation_aliment_kg: Optional[Decimal] = None
    formule: Optional[str] = None


class ProductionRead(ProductionBase):
    id_production: int
    nombre_cartons: int
    date_creation: datetime
    date_modification: datetime
    id_utilisateur_creation: Optional[int]
    id_utilisateur_modification: Optional[int]
    
    # Pour inclure les détails du bâtiment dans les réponses
    nom_batiment: Optional[str] = None
    nom_cycle: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class ProductionDailyStats(BaseModel):
    """Statistiques quotidiennes de production"""
    date: date
    total_oeufs: int
    total_cartons: int
    par_type: List[dict] # [{type: 'normal', count: 100}, ...]
    par_batiment: List[dict] # [{batiment: 'B1', count: 500}, ...]


class FormuleAliment(BaseModel):
    value: str
    label: str
    description: Optional[str] = None


class CalibreThreshold(BaseModel):
    value: str
    label: str
    min_grammage: Optional[Decimal] = None
    max_grammage: Optional[Decimal] = None


class ProductionStockTotals(BaseModel):
    cycle: Optional[dict] = None
    produced_eggs: int
    sold_eggs: int
    lost_eggs: int
    available_eggs: int
    unassigned_sold_eggs: int
    buildings_count: int
    missing_buildings_count: int


class ProductionStockCategory(BaseModel):
    type_oeuf: str
    calibre: Optional[str] = None
    label: str
    produced_eggs: int
    lost_eggs: int
    sold_eggs: int
    available_eggs: int


class ProductionStockBuilding(BaseModel):
    id_batiment: int
    nom_batiment: str
    cycle: Optional[dict] = None
    produced_eggs: int
    sold_eggs: int
    lost_eggs: int
    available_eggs: int
    mortalite: int
    consommation_aliment_kg: Decimal
    formules: List[str]
    entries_count: int
    status: str
    categories: List[ProductionStockCategory]


class ProductionStockMovement(BaseModel):
    time: Optional[str] = None
    type: str
    label: str
    detail: str
    quantity: int
    id_batiment: Optional[int] = None
    nom_batiment: Optional[str] = None


class ProductionStockDaily(BaseModel):
    date: date
    totals: ProductionStockTotals
    batiments: List[ProductionStockBuilding]
    movements: List[ProductionStockMovement]


class ProductionPerformanceRow(BaseModel):
    id: str
    rowType: str
    date: str
    mort: Optional[int] = None
    mort_pct: Optional[Decimal | str] = None
    oeufs: Optional[int] = None
    oeufs_cumul: Optional[int] = None
    ponte_pct: Optional[Decimal | str] = None
    formule: Optional[str] = None
    aliment_kg: Optional[Decimal] = None
    g_poule: Optional[Decimal | str] = None
    g_oeuf: Optional[Decimal | str] = None
    calibre: Optional[str] = None
    effectif_debut: Optional[int] = None
    effectif_fin: Optional[int] = None
    age_semaines: Optional[int] = None


class ProductionPerformanceResponse(BaseModel):
    cycle: dict
    rows: List[ProductionPerformanceRow]
