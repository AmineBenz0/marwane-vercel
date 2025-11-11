"""
Schémas Pydantic pour la validation des données transactions.
"""
from __future__ import annotations
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


class TransactionCreateWithLines(BaseModel):
    """
    Schéma pour créer une transaction avec ou sans lignes.
    Si des lignes sont fournies, le montant_total est calculé automatiquement.
    Sinon, montant_total doit être fourni explicitement.
    """
    date_transaction: date = Field(
        ...,
        description="Date de la transaction"
    )
    montant_total: Optional[Decimal] = Field(
        None,
        gt=0,
        description="Montant total de la transaction (requis si lignes non fournies)"
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
    lignes: Optional[list[LigneTransactionBaseWithPrice]] = Field(
        None,
        description="Liste des lignes de transaction (optionnel, mais requis pour calcul automatique du montant)"
    )
    
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
    def validate_montant_or_lignes(self):
        """
        Valide que soit montant_total est fourni, soit lignes est fourni (pour calcul automatique).
        """
        if self.lignes is None or len(self.lignes) == 0:
            if self.montant_total is None:
                raise ValueError("Soit montant_total doit être fourni, soit lignes doit être fourni pour calculer le montant")
        return self
    
    def calculate_montant_total(self) -> Decimal:
        """
        Calcule le montant total à partir des lignes.
        """
        if not self.lignes or len(self.lignes) == 0:
            if self.montant_total is None:
                raise ValueError("Impossible de calculer le montant total : aucune ligne fournie")
            return self.montant_total
        
        total = Decimal('0')
        for ligne in self.lignes:
            total += Decimal(str(ligne.prix_unitaire)) * Decimal(str(ligne.quantite))
        return total


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


class TransactionReadWithLines(TransactionRead):
    """
    Schéma pour lire une transaction avec ses lignes.
    """
    lignes_transaction: list[LigneTransactionRead] = Field(
        default_factory=list,
        description="Listes des lignes de transaction"
    )


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


class LigneTransactionBaseWithPrice(LigneTransactionBase):
    """
    Schéma de base pour une ligne de transaction avec prix unitaire.
    Utilisé pour le calcul automatique du montant total.
    """
    prix_unitaire: Decimal = Field(
        ...,
        gt=0,
        description="Prix unitaire du produit (doit être positif)"
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

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy
