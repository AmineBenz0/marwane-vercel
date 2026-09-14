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


class ProduitAchete(BaseModel):
    """
    Schéma pour un produit acheté par un client avec ses statistiques.
    """
    id_produit: int = Field(..., description="Identifiant du produit")
    nom_produit: str = Field(..., description="Nom du produit")
    quantite_totale: int = Field(..., description="Quantité totale achetée")
    montant_total: Decimal = Field(..., description="Montant total dépensé pour ce produit")
    nombre_achats: int = Field(..., description="Nombre de fois que ce produit a été acheté")
    prix_moyen: Decimal = Field(..., description="Prix moyen d'achat (montant_total / quantite_totale)")
    derniere_date_achat: Optional[date] = Field(None, description="Date du dernier achat de ce produit")
    premiere_date_achat: Optional[date] = Field(None, description="Date du premier achat de ce produit")


class ClientProduitsAchetes(BaseModel):
    """
    Schéma pour la liste des produits achetés par un client avec statistiques globales.
    """
    client_id: int = Field(..., description="Identifiant du client")
    nombre_produits_differents: int = Field(..., description="Nombre de produits différents achetés")
    quantite_totale_tous_produits: int = Field(..., description="Quantité totale tous produits confondus")
    montant_total_tous_produits: Decimal = Field(..., description="Montant total dépensé tous produits confondus")
    produits: List[ProduitAchete] = Field(default_factory=list, description="Liste des produits achetés")


class ClientInsightsFinanciers(BaseModel):
    """
    Schéma pour les insights financiers avancés d'un client.
    """
    taux_paiement: float = Field(0.0, description="Pourcentage du montant total qui a été payé (0-100)")
    montant_impaye: Decimal = Field(Decimal('0'), description="Montant total impayé (créances)")
    delai_moyen_paiement: Optional[float] = Field(None, description="Délai moyen en jours entre transaction et paiement")
    frequence_moyenne: Optional[float] = Field(None, description="Nombre de jours moyens entre deux transactions")
    jours_depuis_derniere_transaction: Optional[int] = Field(None, description="Nombre de jours depuis la dernière transaction")
    nombre_transactions_en_retard: int = Field(0, description="Nombre de transactions avec paiement en retard")
    montant_en_retard: Decimal = Field(Decimal('0'), description="Montant total des transactions en retard")
    tendance: Optional[str] = Field(None, description="Tendance des ventes: 'hausse', 'baisse', ou 'stable'")


class ClientScore(BaseModel):
    """
    Schéma pour le score de fiabilité d'un client.
    
    Le score est calculé sur 100 points basé sur :
    - Taux de paiement (40 points) : Pourcentage des montants payés
    - Respect des délais (30 points) : Ratio transactions à l'heure vs en retard
    - Régularité des achats (20 points) : Fréquence et constance des transactions
    - Ancienneté de la relation (10 points) : Durée de la relation commerciale
    """
    score_total: float = Field(..., ge=0, le=100, description="Score total sur 100")
    
    # Détail des composantes du score
    score_paiement: float = Field(..., ge=0, le=40, description="Score basé sur le taux de paiement (max 40)")
    score_delais: float = Field(..., ge=0, le=30, description="Score basé sur le respect des délais (max 30)")
    score_regularite: float = Field(..., ge=0, le=20, description="Score basé sur la régularité des achats (max 20)")
    score_anciennete: float = Field(..., ge=0, le=10, description="Score basé sur l'ancienneté (max 10)")
    
    # Catégorisation et interprétation
    categorie: str = Field(..., description="Catégorie: 'excellent', 'bon', 'moyen', 'risque'")
    label: str = Field(..., description="Label lisible: 'Excellent', 'Bon', 'Moyen', 'À risque'")
    couleur: str = Field(..., description="Couleur associée: 'success', 'info', 'warning', 'error'")
    
    # Métriques utilisées pour le calcul
    taux_paiement: float = Field(..., description="Taux de paiement utilisé (0-100)")
    taux_respect_delais: float = Field(..., description="Taux de transactions sans retard (0-100)")
    frequence_jours: Optional[float] = Field(None, description="Fréquence moyenne entre transactions en jours")
    anciennete_mois: Optional[int] = Field(None, description="Nombre de mois depuis première transaction")
    
    # Recommandations
    recommandation: Optional[str] = Field(None, description="Recommandation basée sur le score")