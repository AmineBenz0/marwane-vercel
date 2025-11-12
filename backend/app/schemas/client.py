"""
Schémas Pydantic pour la validation des données clients.
"""
from __future__ import annotations
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime, date
from decimal import Decimal

if TYPE_CHECKING:
    from app.schemas.transaction import TransactionRead


class ClientBase(BaseModel):
    """
    Schéma de base pour un client.
    Contient les champs communs à tous les schémas client.
    """
    nom_client: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Nom du client"
    )
    est_actif: bool = Field(
        True,
        description="Indique si le client est actif (soft delete)"
    )


class ClientCreate(ClientBase):
    """
    Schéma pour créer un nouveau client.
    """
    @field_validator('nom_client')
    @classmethod
    def validate_nom_client(cls, v: str) -> str:
        """Valide que le nom du client n'est pas vide après trim."""
        v = v.strip()
        if not v:
            raise ValueError("Le nom du client ne peut pas être vide")
        return v


class ClientUpdate(BaseModel):
    """
    Schéma pour mettre à jour un client.
    Tous les champs sont optionnels pour permettre des mises à jour partielles.
    """
    nom_client: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Nom du client"
    )
    est_actif: Optional[bool] = Field(
        None,
        description="Indique si le client est actif (soft delete)"
    )

    @field_validator('nom_client')
    @classmethod
    def validate_nom_client(cls, v: Optional[str]) -> Optional[str]:
        """Valide le nom du client si fourni."""
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom du client ne peut pas être vide")
        return v


class ClientRead(ClientBase):
    """
    Schéma pour lire un client.
    Inclut les champs générés automatiquement (id, dates).
    """
    id_client: int = Field(..., description="Identifiant unique du client")
    date_creation: datetime = Field(..., description="Date de création du client")
    date_modification: datetime = Field(..., description="Date de dernière modification")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy


class ClientProfileStats(BaseModel):
    """
    Schéma pour les statistiques agrégées d'un client.
    """
    total_transactions: int = Field(
        0,
        description="Nombre total de transactions du client"
    )
    montant_total_ventes: Decimal = Field(
        Decimal('0'),
        description="Somme totale des montants des transactions"
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


class ClientProfile(BaseModel):
    """
    Schéma pour le profil complet d'un client.
    Inclut les informations du client, ses statistiques et sa liste de transactions paginée.
    """
    client: ClientRead = Field(..., description="Informations du client")
    statistiques: ClientProfileStats = Field(..., description="Statistiques agrégées du client")
    transactions: List["TransactionRead"] = Field(
        default_factory=list,
        description="Liste paginée des transactions du client"
    )

    model_config = ConfigDict(from_attributes=True)


# Résoudre la référence forward après l'import de TransactionRead
def _rebuild_client_profile():
    """Rebuild ClientProfile après l'import de TransactionRead pour résoudre les références forward."""
    from app.schemas.transaction import TransactionRead
    ClientProfile.model_rebuild()


# Appeler automatiquement lors de l'import du module
try:
    _rebuild_client_profile()
except ImportError:
    # Si TransactionRead n'est pas encore disponible, on laisse passer
    # Il sera reconstruit lors de l'import dans __init__.py
    pass


class ClientStatsMensuellesItem(BaseModel):
    """
    Schéma pour un élément de statistiques mensuelles d'un client.
    """
    mois: str = Field(..., description="Mois au format YYYY-MM (ex: 2024-01)")
    montant: Decimal = Field(..., description="Montant total des transactions du mois")
    nb_transactions: int = Field(..., description="Nombre de transactions du mois")


class ClientStatsMensuelles(BaseModel):
    """
    Schéma pour les statistiques mensuelles d'un client.
    """
    periode: str = Field(..., description="Période sélectionnée (6_mois ou 12_mois)")
    data: List[ClientStatsMensuellesItem] = Field(..., description="Liste des statistiques par mois")
