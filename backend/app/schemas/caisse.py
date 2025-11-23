"""
Schémas Pydantic pour la validation des données caisse.
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Literal
from datetime import datetime
from decimal import Decimal


class MouvementCaisseBase(BaseModel):
    """
    Schéma de base pour un mouvement de caisse.
    Contient les champs communs à tous les schémas mouvement de caisse.
    """
    montant: Decimal = Field(
        ...,
        gt=0,
        description="Montant du mouvement (doit être strictement positif)"
    )
    type_mouvement: Literal['ENTREE', 'SORTIE'] = Field(
        ...,
        description="Type de mouvement : 'ENTREE' ou 'SORTIE'"
    )
    id_transaction: int = Field(
        ...,
        description="ID de la transaction associée"
    )


class MouvementCaisseCreate(MouvementCaisseBase):
    """
    Schéma pour créer un nouveau mouvement de caisse.
    """
    @field_validator('montant')
    @classmethod
    def validate_montant(cls, v: Decimal) -> Decimal:
        """Valide que le montant est strictement positif."""
        if v <= 0:
            raise ValueError("Le montant doit être strictement positif")
        return v
    
    @field_validator('type_mouvement')
    @classmethod
    def validate_type_mouvement(cls, v: str) -> str:
        """Valide que le type de mouvement est 'ENTREE' ou 'SORTIE'."""
        if v not in ['ENTREE', 'SORTIE']:
            raise ValueError("Le type de mouvement doit être 'ENTREE' ou 'SORTIE'")
        return v


class MouvementCaisseRead(MouvementCaisseBase):
    """
    Schéma pour lire un mouvement de caisse.
    Inclut les champs générés automatiquement (id, date).
    """
    id_mouvement: int = Field(..., description="Identifiant unique du mouvement de caisse")
    date_mouvement: datetime = Field(..., description="Date et heure du mouvement")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy


class SoldeCaisseRead(BaseModel):
    """
    Schéma pour le solde actuel de la caisse.
    """
    solde_actuel: Decimal = Field(..., description="Solde actuel de la caisse (entrées - sorties)")
    derniere_maj: datetime = Field(..., description="Date et heure du dernier mouvement")

    model_config = ConfigDict(from_attributes=True)


class SoldeCaisseCompletRead(BaseModel):
    """
    Schéma pour le solde complet de la caisse avec vision théorique et réelle.
    
    Deux visions de la caisse :
    - Solde Théorique (Expected) : Basé sur les transactions enregistrées
    - Solde Réel (Actual) : Basé sur les paiements effectivement encaissés
    """
    # Solde Théorique (basé sur les transactions)
    solde_theorique: Decimal = Field(
        ..., 
        description="Solde théorique calculé sur les transactions (entrées - sorties)"
    )
    entrees_theoriques: Decimal = Field(
        ..., 
        description="Total des entrées théoriques (transactions clients)"
    )
    sorties_theoriques: Decimal = Field(
        ..., 
        description="Total des sorties théoriques (transactions fournisseurs)"
    )
    
    # Solde Réel (basé sur les paiements)
    solde_reel: Decimal = Field(
        ..., 
        description="Solde réel basé sur les paiements effectivement encaissés"
    )
    entrees_reelles: Decimal = Field(
        ..., 
        description="Total des entrées réelles (paiements clients encaissés)"
    )
    sorties_reelles: Decimal = Field(
        ..., 
        description="Total des sorties réelles (paiements fournisseurs effectués)"
    )
    
    # Écart entre théorique et réel
    ecart: Decimal = Field(
        ..., 
        description="Écart entre le solde théorique et le solde réel (créances non encaissées)"
    )
    
    # Détails de l'écart
    creances_clients: Decimal = Field(
        ..., 
        description="Montant des créances clients (transactions clients non payées)"
    )
    dettes_fournisseurs: Decimal = Field(
        ..., 
        description="Montant des dettes fournisseurs (transactions fournisseurs non payées)"
    )
    
    # Métadonnées
    derniere_maj_transaction: datetime | None = Field(
        None, 
        description="Date du dernier mouvement de transaction"
    )
    derniere_maj_paiement: datetime | None = Field(
        None, 
        description="Date du dernier paiement enregistré"
    )
    
    model_config = ConfigDict(from_attributes=True)


class HistoriqueSoldeRead(BaseModel):
    """
    Schéma pour un enregistrement d'historique du solde de la caisse.
    """
    id_historique: int = Field(..., description="Identifiant unique de l'historique")
    date_snapshot: datetime = Field(..., description="Date et heure du snapshot")
    solde: Decimal = Field(..., description="Solde de la caisse au moment du snapshot")
    id_mouvement: int | None = Field(None, description="ID du mouvement associé (si disponible)")

    model_config = ConfigDict(from_attributes=True)
