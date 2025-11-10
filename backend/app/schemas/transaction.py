"""
Schémas Pydantic pour la validation des données transactions.
"""
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class TransactionBase(BaseModel):
    """
    Schéma de base pour une transaction.
    Contient les champs communs à tous les schémas transaction.
    """
    date_transaction: date = Field(
        ...,
        description="Date de la transaction"
    )
    montant_total: Decimal = Field(
        ...,
        gt=0,
        description="Montant total de la transaction (doit être positif)"
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


class TransactionCreate(TransactionBase):
    """
    Schéma pour créer une nouvelle transaction.
    """
    @field_validator('montant_total')
    @classmethod
    def validate_montant_total(cls, v: Decimal) -> Decimal:
        """Valide que le montant est strictement positif."""
        if v <= 0:
            raise ValueError("Le montant total doit être strictement positif")
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


class TransactionUpdate(BaseModel):
    """
    Schéma pour mettre à jour une transaction.
    Tous les champs sont optionnels pour permettre des mises à jour partielles.
    """
    date_transaction: Optional[date] = Field(
        None,
        description="Date de la transaction"
    )
    montant_total: Optional[Decimal] = Field(
        None,
        gt=0,
        description="Montant total de la transaction (doit être positif)"
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
    
    @field_validator('montant_total')
    @classmethod
    def validate_montant_total(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        """Valide que le montant est strictement positif si fourni."""
        if v is not None and v <= 0:
            raise ValueError("Le montant total doit être strictement positif")
        return v
    
    @model_validator(mode='after')
    def validate_client_ou_fournisseur(self):
        """
        Valide l'exclusion mutuelle lors de la mise à jour.
        Si les deux sont fournis, c'est une erreur.
        Si aucun n'est fourni dans la mise à jour, on laisse passer (pas de changement).
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
    Inclut les champs générés automatiquement (id, dates, utilisateurs).
    """
    id_transaction: int = Field(..., description="Identifiant unique de la transaction")
    date_creation: datetime = Field(..., description="Date de création de la transaction")
    date_modification: datetime = Field(..., description="Date de dernière modification")
    id_utilisateur_creation: Optional[int] = Field(None, description="ID de l'utilisateur qui a créé la transaction")
    id_utilisateur_modification: Optional[int] = Field(None, description="ID de l'utilisateur qui a modifié la transaction")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy


# ============================================================================
# Schémas pour les lignes de transaction
# ============================================================================

class LigneTransactionBase(BaseModel):
    """
    Schéma de base pour une ligne de transaction.
    Contient les champs communs à tous les schémas ligne de transaction.
    """
    id_produit: int = Field(
        ...,
        description="ID du produit concerné"
    )
    quantite: int = Field(
        ...,
        gt=0,
        description="Quantité du produit (doit être positive)"
    )


class LigneTransactionCreate(LigneTransactionBase):
    """
    Schéma pour créer une nouvelle ligne de transaction.
    """
    @field_validator('quantite')
    @classmethod
    def validate_quantite(cls, v: int) -> int:
        """Valide que la quantité est strictement positive."""
        if v <= 0:
            raise ValueError("La quantité doit être strictement positive")
        return v


class LigneTransactionRead(LigneTransactionBase):
    """
    Schéma pour lire une ligne de transaction.
    Inclut les champs générés automatiquement (id).
    """
    id_ligne_transaction: int = Field(..., description="Identifiant unique de la ligne de transaction")
    id_transaction: int = Field(..., description="ID de la transaction parente")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy

