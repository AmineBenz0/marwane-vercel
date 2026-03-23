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
    montant: Decimal = Field(..., description="Montant total des transactions du mois (Achats)")
    paiements: Decimal = Field(Decimal('0'), description="Montant total des paiements effectués au mois")
    solde_cumule: Decimal = Field(Decimal('0'), description="Solde cumulé à la fin du mois (Total Achats - Total Paiements)")
    nb_transactions: int = Field(..., description="Nombre de transactions du mois")


class FournisseurStatsMensuelles(BaseModel):
    """
    Schéma pour les statistiques mensuelles d'un fournisseur.
    """
    periode: str = Field(..., description="Période sélectionnée (6_mois ou 12_mois)")
    data: List[FournisseurStatsMensuellesItem] = Field(..., description="Liste des statistiques par mois")


class ProduitVendu(BaseModel):
    """
    Schéma pour un produit vendu par un fournisseur avec ses statistiques.
    """
    id_produit: int = Field(..., description="Identifiant du produit")
    nom_produit: str = Field(..., description="Nom du produit")
    quantite_totale: int = Field(..., description="Quantité totale vendue")
    montant_total: Decimal = Field(..., description="Montant total reçu pour ce produit")
    nombre_ventes: int = Field(..., description="Nombre de fois que ce produit a été vendu")
    prix_moyen: Decimal = Field(..., description="Prix moyen de vente (montant_total / quantite_totale)")
    derniere_date_vente: Optional[date] = Field(None, description="Date de la dernière vente de ce produit")
    premiere_date_vente: Optional[date] = Field(None, description="Date de la première vente de ce produit")


class FournisseurProduitsVendus(BaseModel):
    """
    Schéma pour la liste des produits vendus par un fournisseur avec statistiques globales.
    """
    fournisseur_id: int = Field(..., description="Identifiant du fournisseur")
    nombre_produits_differents: int = Field(..., description="Nombre de produits différents vendus")
    quantite_totale_tous_produits: int = Field(..., description="Quantité totale tous produits confondus")
    montant_total_tous_produits: Decimal = Field(..., description="Montant total reçu tous produits confondus")
    produits: List[ProduitVendu] = Field(default_factory=list, description="Liste des produits vendus")


class FournisseurInsightsFinanciers(BaseModel):
    """
    Schéma pour les insights financiers avancés d'un fournisseur.
    """
    taux_paiement: float = Field(0.0, description="Pourcentage du montant total qui a été payé (0-100)")
    montant_impaye: Decimal = Field(Decimal('0'), description="Montant total impayé (factures)")
    delai_moyen_paiement: Optional[float] = Field(None, description="Délai moyen en jours entre transaction et paiement")
    frequence_moyenne: Optional[float] = Field(None, description="Nombre de jours moyens entre deux transactions")
    jours_depuis_derniere_transaction: Optional[int] = Field(None, description="Nombre de jours depuis la dernière transaction")
    nombre_transactions_en_retard: int = Field(0, description="Nombre de transactions avec paiement en retard")
    montant_en_retard: Decimal = Field(Decimal('0'), description="Montant total des transactions en retard")
    tendance: Optional[str] = Field(None, description="Tendance des achats: 'hausse', 'baisse', ou 'stable'")


class FournisseurScore(BaseModel):
    """
    Schéma pour le score de performance d'un fournisseur.
    
    Le score est calculé sur 100 points basé sur :
    - Taux de paiement de notre part (40 points) : Notre fiabilité de paiement
    - Respect de nos engagements (30 points) : Ratio de paiements à l'heure
    - Régularité de collaboration (20 points) : Fréquence et constance des commandes
    - Ancienneté de la relation (10 points) : Durée de la relation commerciale
    """
    score_total: float = Field(..., ge=0, le=100, description="Score total sur 100")
    
    # Détail des composantes du score
    score_paiement: float = Field(..., ge=0, le=40, description="Score basé sur notre taux de paiement (max 40)")
    score_delais: float = Field(..., ge=0, le=30, description="Score basé sur notre respect des délais (max 30)")
    score_regularite: float = Field(..., ge=0, le=20, description="Score basé sur la régularité des commandes (max 20)")
    score_anciennete: float = Field(..., ge=0, le=10, description="Score basé sur l'ancienneté (max 10)")
    
    # Catégorisation et interprétation
    categorie: str = Field(..., description="Catégorie: 'excellent', 'bon', 'moyen', 'risque'")
    label: str = Field(..., description="Label lisible: 'Excellent', 'Bon', 'Moyen', 'À risque'")
    couleur: str = Field(..., description="Couleur associée: 'success', 'info', 'warning', 'error'")
    
    # Métriques utilisées pour le calcul
    taux_paiement: float = Field(..., description="Notre taux de paiement (0-100)")
    taux_respect_delais: float = Field(..., description="Notre taux de paiements sans retard (0-100)")
    frequence_jours: Optional[float] = Field(None, description="Fréquence moyenne entre commandes en jours")
    anciennete_mois: Optional[int] = Field(None, description="Nombre de mois depuis première commande")
    
    # Recommandations
    recommandation: Optional[str] = Field(None, description="Recommandation basée sur le score")