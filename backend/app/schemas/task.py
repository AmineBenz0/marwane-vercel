"""
Schémas Pydantic pour la validation des données des tâches.
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional
from datetime import datetime


class TacheBase(BaseModel):
    """
    Schéma de base pour une tâche.
    """
    titre: str = Field(..., min_length=1, max_length=255, description="Titre de la tâche")
    description: Optional[str] = Field(None, description="Description de la tâche")
    date_debut: datetime = Field(..., description="Date et heure de début")
    date_fin: Optional[datetime] = Field(None, description="Date et heure de fin")
    est_toute_la_journee: bool = Field(False, description="Événement sur toute la journée")
    statut: str = Field('en_attente', description="Statut (en_attente, en_cours, complete, annule)")
    priorite: str = Field('moyenne', description="Priorité (basse, moyenne, haute)")
    categorie: Optional[str] = Field(None, description="Catégorie (travail, personnel, rdv, etc.)")

    @field_validator('statut')
    @classmethod
    def validate_statut(cls, v: str) -> str:
        valid_statuts = ['en_attente', 'en_cours', 'complete', 'annule']
        if v not in valid_statuts:
            raise ValueError(f"Le statut doit être l'un de : {', '.join(valid_statuts)}")
        return v

    @field_validator('priorite')
    @classmethod
    def validate_priorite(cls, v: str) -> str:
        valid_priorites = ['basse', 'moyenne', 'haute']
        if v not in valid_priorites:
            raise ValueError(f"La priorité doit être l'une de : {', '.join(valid_priorites)}")
        return v


class TacheCreate(TacheBase):
    """
    Schéma pour créer une tâche.
    """
    pass


class TacheUpdate(BaseModel):
    """
    Schéma pour mettre à jour une tâche.
    """
    titre: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    date_debut: Optional[datetime] = None
    date_fin: Optional[datetime] = None
    est_toute_la_journee: Optional[bool] = None
    statut: Optional[str] = None
    priorite: Optional[str] = None
    categorie: Optional[str] = None

    @field_validator('statut')
    @classmethod
    def validate_statut(cls, v: Optional[str]) -> Optional[str]:
        if v is None: return v
        return TacheBase.validate_statut(v)

    @field_validator('priorite')
    @classmethod
    def validate_priorite(cls, v: Optional[str]) -> Optional[str]:
        if v is None: return v
        return TacheBase.validate_priorite(v)


class TacheRead(TacheBase):
    """
    Schéma pour lire une tâche.
    """
    id_tache: int
    id_utilisateur: int
    date_creation: datetime
    date_modification: datetime

    model_config = ConfigDict(from_attributes=True)
