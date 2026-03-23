from pydantic import BaseModel, Field, model_validator
from datetime import date, datetime
from typing import Optional, List, Literal
from decimal import Decimal

class ProductionBase(BaseModel):
    date_production: date = Field(..., description="Date de la production")
    id_batiment: int = Field(..., description="ID du bâtiment")
    type_oeuf: Literal["normal", "double_jaune", "double_jaune_demarrage", "casse", "blanc", "perdu"] = Field(..., description="Type d'œuf")
    calibre: Optional[Literal["demarrage", "moyen", "gros"]] = Field(None, description="Calibre (requis uniquement pour type_oeuf='normal')")
    nombre_oeufs: int = Field(..., gt=0, description="Nombre d'œufs collectés")
    grammage: Decimal = Field(..., ge=0, description="Poids moyen en grammes")

    @model_validator(mode='after')
    def validate_calibre(self) -> 'ProductionBase':
        if self.type_oeuf == 'normal' and not self.calibre:
            raise ValueError("Le calibre est requis pour les œufs de type 'normal'")
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
    id_batiment: Optional[int] = None
    type_oeuf: Optional[Literal["normal", "double_jaune", "double_jaune_demarrage", "casse", "blanc", "perdu"]] = None
    calibre: Optional[Literal["demarrage", "moyen", "gros"]] = None
    nombre_oeufs: Optional[int] = None
    grammage: Optional[Decimal] = None


class ProductionRead(ProductionBase):
    id_production: int
    nombre_cartons: int
    date_creation: datetime
    date_modification: datetime
    id_utilisateur_creation: Optional[int]
    id_utilisateur_modification: Optional[int]
    
    # Pour inclure les détails du bâtiment dans les réponses
    nom_batiment: Optional[str] = None
    
    class Config:
        from_attributes = True


class ProductionDailyStats(BaseModel):
    """Statistiques quotidiennes de production"""
    date: date
    total_oeufs: int
    total_cartons: int
    par_type: List[dict] # [{type: 'normal', count: 100}, ...]
    par_batiment: List[dict] # [{batiment: 'B1', count: 500}, ...]
