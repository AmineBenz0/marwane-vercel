"""
Schémas Pydantic pour les Transformations de produits.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal


class TransformationLigneBase(BaseModel):
    id_produit: int
    quantite: Decimal = Field(..., gt=0)
    type_ligne: str = Field(..., description="'INPUT' ou 'OUTPUT'")


class TransformationLigneCreate(TransformationLigneBase):
    pass


class TransformationLigneRead(TransformationLigneBase):
    id_ligne: int
    nom_produit: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class TransformationBase(BaseModel):
    date_transformation: date
    notes: Optional[str] = None


class TransformationCreate(TransformationBase):
    lignes: List[TransformationLigneCreate]


class TransformationRead(TransformationBase):
    id_transformation: int
    date_creation: datetime
    id_utilisateur: Optional[int]
    lignes: List[TransformationLigneRead]
    
    model_config = ConfigDict(from_attributes=True)


class TransformationSummary(TransformationBase):
    id_transformation: int
    nb_entrees: int
    nb_sorties: int
    
    model_config = ConfigDict(from_attributes=True)
