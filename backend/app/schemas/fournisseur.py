"""
Schémas Pydantic pour la validation des données fournisseurs.
"""
from __future__ import annotations
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime, date
from decimal import Decimal

if TYPE_CHECKING:
    from app.schemas.transaction import TransactionRead


class FournisseurBase(BaseModel):
    """
    Schéma de base pour un fournisseur.
    Contient les champs communs à tous les schémas fournisseur.
    """
    nom_fournisseur: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Nom du fournisseur"
    )
    est_actif: bool = Field(
        True,
        description="Indique si le fournisseur est actif (soft delete)"
    )


class FournisseurCreate(FournisseurBase):
    """
    Schéma pour créer un nouveau fournisseur.
    """
    @field_validator('nom_fournisseur')
    @classmethod
    def validate_nom_fournisseur(cls, v: str) -> str:
        """Valide que le nom du fournisseur n'est pas vide après trim."""
        v = v.strip()
        if not v:
            raise ValueError("Le nom du fournisseur ne peut pas être vide")
        return v


class FournisseurUpdate(BaseModel):
    """
    Schéma pour mettre à jour un fournisseur.
    Tous les champs sont optionnels pour permettre des mises à jour partielles.
    """
    nom_fournisseur: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Nom du fournisseur"
    )
    est_actif: Optional[bool] = Field(
        None,
        description="Indique si le fournisseur est actif (soft delete)"
    )

    @field_validator('nom_fournisseur')
    @classmethod
    def validate_nom_fournisseur(cls, v: Optional[str]) -> Optional[str]:
        """Valide le nom du fournisseur si fourni."""
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom du fournisseur ne peut pas être vide")
        return v


class FournisseurRead(FournisseurBase):
    """
    Schéma pour lire un fournisseur.
    Inclut les champs générés automatiquement (id, dates).
    """
    id_fournisseur: int = Field(..., description="Identifiant unique du fournisseur")
    date_creation: datetime = Field(..., description="Date de création du fournisseur")
    date_modification: datetime = Field(..., description="Date de dernière modification")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy


class FournisseurProfileStats(BaseModel):
    """
    Schéma pour les statistiques agrégées d'un fournisseur.
    """
    total_transactions: int = Field(
        0,
        description="Nombre total de transactions du fournisseur"
    )
    montant_total_achats: Decimal = Field(
        Decimal('0'),
        description="Somme totale des montants des transactions (achats)"
    )
    montant_moyen_transaction: Optional[Decimal] = Field(
        None,
        description="Montant moyen par transaction (None si aucune transaction)"
    )
    date_premiere_transaction: Optional[date] = Field(
        None,
        description="Date de la première transaction (None si aucune transaction)"
    )
    date_derniere_transaction: Optional[date] = Field(
        None,
        description="Date de la dernière transaction (None si aucune transaction)"
    )


class FournisseurProfile(BaseModel):
    """
    Schéma pour le profil complet d'un fournisseur.
    Inclut les informations du fournisseur, ses statistiques et sa liste de transactions paginée.
    """
    fournisseur: FournisseurRead = Field(..., description="Informations du fournisseur")
    statistiques: FournisseurProfileStats = Field(..., description="Statistiques agrégées du fournisseur")
    transactions: List["TransactionRead"] = Field(
        default_factory=list,
        description="Liste paginée des transactions du fournisseur"
    )

    model_config = ConfigDict(from_attributes=True)


# Résoudre la référence forward après l'import de TransactionRead
def _rebuild_fournisseur_profile():
    """Rebuild FournisseurProfile après l'import de TransactionRead pour résoudre les références forward."""
    from app.schemas.transaction import TransactionRead
    FournisseurProfile.model_rebuild()


# Appeler automatiquement lors de l'import du module
try:
    _rebuild_fournisseur_profile()
except ImportError:
    # Si TransactionRead n'est pas encore disponible, on laisse passer
    # Il sera reconstruit lors de l'import dans __init__.py
    pass


class FournisseurStatsMensuellesItem(BaseModel):
    """
    Schéma pour un élément de statistiques mensuelles d'un fournisseur.
    """
    mois: str = Field(..., description="Mois au format YYYY-MM (ex: 2024-01)")
    montant: Decimal = Field(..., description="Montant total des transactions du mois")
    nb_transactions: int = Field(..., description="Nombre de transactions du mois")


class FournisseurStatsMensuelles(BaseModel):
    """
    Schéma pour les statistiques mensuelles d'un fournisseur.
    """
    periode: str = Field(..., description="Période sélectionnée (6_mois ou 12_mois)")
    data: List[FournisseurStatsMensuellesItem] = Field(..., description="Liste des statistiques par mois")
