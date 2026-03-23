"""
Schémas Pydantic pour la validation des données transactions.
"""
from __future__ import annotations
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from app.schemas.paiement import PaiementRead


class TransactionBase(BaseModel):
    """
    Schéma de base pour une transaction.
    Chaque transaction représente une ligne de vente/achat avec un seul produit.
    """
    date_transaction: date = Field(
        ...,
        description="Date de la transaction"
    )
    id_produit: int = Field(
        ...,
        description="ID du produit concerné"
    )
    quantite: int = Field(
        ...,
        gt=0,
        description="Quantité du produit (doit être positive)"
    )
    prix_unitaire: Decimal = Field(
        ...,
        gt=0,
        description="Prix unitaire du produit (doit être positif)"
    )
    montant_total: Decimal = Field(
        ...,
        gt=0,
        description="Montant total de la transaction (quantite × prix_unitaire)"
    )
    est_actif: bool = Field(
        True,
        description="Indique si la transaction est active (pour l'annulation)"
    )
    id_client: Optional[int] = Field(
        None,
        description="ID du client concerné (exclusion mutuelle avec id_fournisseur)"
    )
    id_fournisseur: Optional[int] = Field(
        None,
        description="ID du fournisseur concerné (exclusion mutuelle avec id_client)"
    )
    date_echeance: Optional[date] = Field(
        None,
        description="Date d'échéance du paiement (optionnelle)"
    )


class TransactionCreate(TransactionBase):
    """
    Schéma pour créer une nouvelle transaction.
    Le montant_total est calculé automatiquement si non fourni.
    """
    montant_total: Optional[Decimal] = Field(
        None,
        gt=0,
        description="Montant total (calculé automatiquement si non fourni)"
    )
    
    @field_validator('quantite')
    @classmethod
    def validate_quantite(cls, v: int) -> int:
        """Valide que la quantité est strictement positive."""
        if v <= 0:
            raise ValueError("La quantité doit être strictement positive")
        return v
    
    @field_validator('prix_unitaire')
    @classmethod
    def validate_prix_unitaire(cls, v: Decimal) -> Decimal:
        """Valide que le prix unitaire est strictement positif."""
        if v <= 0:
            raise ValueError("Le prix unitaire doit être strictement positif")
        return v
    
    @model_validator(mode='after')
    def validate_client_ou_fournisseur(self):
        """
        Valide l'exclusion mutuelle : une transaction concerne SOIT un client, SOIT un fournisseur (pas les deux).
        """
        id_client = self.id_client
        id_fournisseur = self.id_fournisseur
        
        if id_client is not None and id_fournisseur is not None:
            raise ValueError("Une transaction ne peut concerner qu'un client OU un fournisseur, pas les deux")
        
        if id_client is None and id_fournisseur is None:
            raise ValueError("Une transaction doit concerner soit un client, soit un fournisseur")
        
        return self
    
    @model_validator(mode='after')
    def calculate_montant_total(self):
        """Calcule le montant_total si non fourni."""
        if self.montant_total is None:
            self.montant_total = Decimal(str(self.quantite)) * self.prix_unitaire
        return self


class TransactionUpdate(BaseModel):
    """
    Schéma pour mettre à jour une transaction.
    Tous les champs sont optionnels pour permettre des mises à jour partielles.
    """
    date_transaction: Optional[date] = Field(
        None,
        description="Date de la transaction"
    )
    id_produit: Optional[int] = Field(
        None,
        description="ID du produit concerné"
    )
    quantite: Optional[int] = Field(
        None,
        gt=0,
        description="Quantité du produit (doit être positive)"
    )
    prix_unitaire: Optional[Decimal] = Field(
        None,
        gt=0,
        description="Prix unitaire du produit (doit être positif)"
    )
    montant_total: Optional[Decimal] = Field(
        None,
        gt=0,
        description="Montant total de la transaction (recalculé si quantite ou prix_unitaire changent)"
    )
    est_actif: Optional[bool] = Field(
        None,
        description="Indique si la transaction est active (pour l'annulation)"
    )
    id_client: Optional[int] = Field(
        None,
        description="ID du client concerné (exclusion mutuelle avec id_fournisseur)"
    )
    id_fournisseur: Optional[int] = Field(
        None,
        description="ID du fournisseur concerné (exclusion mutuelle avec id_client)"
    )
    
    @field_validator('quantite')
    @classmethod
    def validate_quantite(cls, v: Optional[int]) -> Optional[int]:
        """Valide que la quantité est strictement positive si fournie."""
        if v is not None and v <= 0:
            raise ValueError("La quantité doit être strictement positive")
        return v
    
    @field_validator('prix_unitaire')
    @classmethod
    def validate_prix_unitaire(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        """Valide que le prix unitaire est strictement positif si fourni."""
        if v is not None and v <= 0:
            raise ValueError("Le prix unitaire doit être strictement positif")
        return v
    
    @field_validator('montant_total')
    @classmethod
    def validate_montant_total(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        """Valide que le montant est strictement positif si fourni."""
        if v is not None and v <= 0:
            raise ValueError("Le montant total doit être strictement positif")
        return v
    
    @model_validator(mode='after')
    def calculate_montant_total(self):
        """
        Recalcule le montant_total si la quantité ET le prix unitaire sont fournis.
        """
        qty = self.quantite
        price = self.prix_unitaire
        if qty is not None and price is not None:
            self.montant_total = Decimal(str(qty)) * price
        return self

    @model_validator(mode='after')
    def validate_client_ou_fournisseur(self):
        """
        Valide l'exclusion mutuelle lors de la mise à jour.
        Si les deux sont fournis, c'est une erreur.
        """
        id_client = self.id_client
        id_fournisseur = self.id_fournisseur
        
        # Si les deux sont fournis, c'est une erreur
        if id_client is not None and id_fournisseur is not None:
            raise ValueError("Une transaction ne peut concerner qu'un client OU un fournisseur, pas les deux")
        
        return self


class TransactionRead(TransactionBase):
    """
    Schéma pour lire une transaction.
    Inclut les champs générés automatiquement (id, dates, utilisateurs) et les informations de paiement calculées.
    """
    id_transaction: int = Field(..., description="Identifiant unique de la transaction")
    date_creation: datetime = Field(..., description="Date de création de la transaction")
    date_modification: datetime = Field(..., description="Date de dernière modification")
    id_utilisateur_creation: Optional[int] = Field(None, description="ID de l'utilisateur qui a créé la transaction")
    id_utilisateur_modification: Optional[int] = Field(None, description="ID de l'utilisateur qui a modifié la transaction")
    
    # Champs de paiement (ajoutés pour la gestion des paiements)
    date_echeance: Optional[date] = Field(None, description="Date d'échéance du paiement")
    
    # Champs calculés (via les propriétés @property du modèle Transaction)
    montant_paye: Decimal = Field(default=Decimal('0'), description="Montant total payé (calculé)")
    montant_restant: Decimal = Field(default=Decimal('0'), description="Montant restant à payer (calculé)")
    statut_paiement: str = Field(default='impaye', description="Statut du paiement (calculé)")
    est_en_retard: bool = Field(default=False, description="Indique si le paiement est en retard (calculé)")
    pourcentage_paye: float = Field(default=0.0, description="Pourcentage du montant payé (calculé)")
    
    # Liste des paiements associés
    paiements: List[PaiementRead] = Field(default_factory=list, description="Liste des paiements associés")

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Schémas pour l'audit des transactions
# ============================================================================

class TransactionAuditRead(BaseModel):
    """
    Schéma pour lire un enregistrement d'audit de transaction.
    Contient toutes les informations sur une modification : qui, quand, quel champ, ancienne/nouvelle valeur.
    """
    id_audit: int = Field(..., description="Identifiant unique de l'audit")
    id_transaction: int = Field(..., description="ID de la transaction modifiée")
    id_utilisateur: int = Field(..., description="ID de l'utilisateur responsable de la modification")
    nom_utilisateur: Optional[str] = Field(None, description="Nom de l'utilisateur qui a effectué la modification")
    email_utilisateur: Optional[str] = Field(None, description="Email de l'utilisateur qui a effectué la modification")
    date_changement: datetime = Field(..., description="Date et heure du changement")
    champ_modifie: Optional[str] = Field(None, description="Nom du champ modifié")
    ancienne_valeur: Optional[str] = Field(None, description="Valeur avant modification")
    nouvelle_valeur: Optional[str] = Field(None, description="Valeur après modification")

    model_config = ConfigDict(from_attributes=True)
