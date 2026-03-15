"""
Schémas Pydantic pour la validation des données de paiements.
"""
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional
from datetime import datetime, date
from decimal import Decimal


class PaiementBase(BaseModel):
    """
    Schéma de base pour un paiement.
    Contient les champs communs à tous les schémas de paiement.
    """
    date_paiement: date = Field(..., description="Date du paiement")
    montant: Decimal = Field(..., gt=0, description="Montant du paiement (doit être > 0)")
    type_paiement: str = Field(
        ...,
        description="Type de paiement (cash, cheque, virement, carte, traite, compensation, autre)"
    )
    
    # Informations pour les chèques
    numero_cheque: Optional[str] = Field(None, max_length=50, description="Numéro du chèque")
    banque: Optional[str] = Field(None, max_length=100, description="Banque émettrice")
    date_encaissement_prevue: Optional[date] = Field(None, description="Date prévue d'encaissement du chèque")
    statut_cheque: Optional[str] = Field(
        None,
        description="Statut du chèque (emis, a_encaisser, encaisse, rejete, annule)"
    )
    
    # Informations pour les virements
    reference_virement: Optional[str] = Field(None, max_length=100, description="Référence du virement")
    
    # Informations pour les Lettres de Crédit
    id_lc: Optional[int] = Field(None, description="ID de la Lettre de Crédit associée")
    
    # Informations générales
    notes: Optional[str] = Field(None, description="Notes ou commentaires")
    
    @field_validator('type_paiement')
    @classmethod
    def validate_type_paiement(cls, v: str) -> str:
        """Valide que le type de paiement est dans la liste autorisée."""
        types_valides = ['cash', 'cheque', 'virement', 'carte', 'traite', 'compensation', 'lc', 'autre']
        if v.lower() not in types_valides:
            raise ValueError(
                f"Type de paiement invalide. Doit être l'un de: {', '.join(types_valides)}"
            )
        return v.lower()
    
    @field_validator('statut_cheque')
    @classmethod
    def validate_statut_cheque(cls, v: Optional[str]) -> Optional[str]:
        """Valide que le statut du chèque est dans la liste autorisée."""
        if v is None:
            return v
        statuts_valides = ['emis', 'a_encaisser', 'encaisse', 'rejete', 'annule']
        if v.lower() not in statuts_valides:
            raise ValueError(
                f"Statut de chèque invalide. Doit être l'un de: {', '.join(statuts_valides)}"
            )
        return v.lower()


class PaiementCreate(PaiementBase):
    """
    Schéma pour créer un nouveau paiement.
    """
    id_transaction: int = Field(..., description="ID de la transaction associée")
    
    @field_validator('montant')
    @classmethod
    def validate_montant(cls, v: Decimal) -> Decimal:
        """Valide que le montant est positif."""
        if v <= 0:
            raise ValueError("Le montant doit être supérieur à 0")
        return v
    
    @model_validator(mode='after')
    def validate_lc_presence(self):
        """Valide que si le type est 'lc', id_lc est fourni."""
        if self.type_paiement == 'lc' and self.id_lc is None:
            raise ValueError("L'identifiant de la Lettre de Crédit (id_lc) est requis pour ce type de paiement.")
        return self


class PaiementUpdate(BaseModel):
    """
    Schéma pour mettre à jour un paiement.
    Tous les champs sont optionnels pour permettre des mises à jour partielles.
    """
    date_paiement: Optional[date] = Field(None, description="Date du paiement")
    montant: Optional[Decimal] = Field(None, gt=0, description="Montant du paiement")
    type_paiement: Optional[str] = Field(None, description="Type de paiement")
    numero_cheque: Optional[str] = Field(None, max_length=50, description="Numéro du chèque")
    banque: Optional[str] = Field(None, max_length=100, description="Banque émettrice")
    date_encaissement_prevue: Optional[date] = Field(None, description="Date prévue d'encaissement")
    date_encaissement_effective: Optional[date] = Field(None, description="Date effective d'encaissement")
    statut_cheque: Optional[str] = Field(None, description="Statut du chèque")
    motif_rejet: Optional[str] = Field(None, description="Motif du rejet du chèque")
    reference_virement: Optional[str] = Field(None, max_length=100, description="Référence du virement")
    id_lc: Optional[int] = Field(None, description="ID de la Lettre de Crédit")
    notes: Optional[str] = Field(None, description="Notes ou commentaires")
    statut: Optional[str] = Field(None, description="Statut du paiement (valide, en_attente, rejete, annule)")
    
    @field_validator('statut')
    @classmethod
    def validate_statut(cls, v: Optional[str]) -> Optional[str]:
        """Valide que le statut est dans la liste autorisée."""
        if v is None:
            return v
        statuts_valides = ['valide', 'en_attente', 'rejete', 'annule']
        if v.lower() not in statuts_valides:
            raise ValueError(
                f"Statut invalide. Doit être l'un de: {', '.join(statuts_valides)}"
            )
        return v.lower()


class PaiementRead(PaiementBase):
    """
    Schéma pour lire un paiement.
    Inclut les champs générés automatiquement (id, dates, statut, etc.).
    """
    id_paiement: int = Field(..., description="Identifiant unique du paiement")
    id_transaction: int = Field(..., description="ID de la transaction associée")
    date_encaissement_effective: Optional[date] = Field(None, description="Date effective d'encaissement")
    motif_rejet: Optional[str] = Field(None, description="Motif du rejet")
    statut: str = Field(..., description="Statut du paiement")
    date_creation: datetime = Field(..., description="Date de création de l'enregistrement")
    date_modification: datetime = Field(..., description="Date de dernière modification")
    
    model_config = ConfigDict(from_attributes=True)


class PaiementWithTransaction(PaiementRead):
    """
    Schéma pour un paiement avec les informations de la transaction associée.
    Utile pour les listes de paiements.
    """
    # On pourrait ajouter des champs de la transaction si nécessaire
    pass


class StatutPaiementTransaction(BaseModel):
    """
    Schéma pour obtenir le statut de paiement d'une transaction.
    """
    id_transaction: int = Field(..., description="ID de la transaction")
    montant_total: Decimal = Field(..., description="Montant total de la transaction")
    montant_paye: Decimal = Field(..., description="Montant déjà payé")
    montant_restant: Decimal = Field(..., description="Montant restant à payer")
    pourcentage_paye: float = Field(..., description="Pourcentage payé (0-100)")
    statut_paiement: str = Field(..., description="Statut du paiement (paye, partiel, impaye)")
    est_en_retard: bool = Field(..., description="Indique si le paiement est en retard")
    nombre_paiements: int = Field(..., description="Nombre de paiements effectués")


class PaiementSummary(BaseModel):
    """
    Schéma pour un résumé des paiements (utilisé dans les statistiques).
    """
    type_paiement: str = Field(..., description="Type de paiement")
    nombre_paiements: int = Field(..., description="Nombre de paiements de ce type")
    montant_total: Decimal = Field(..., description="Montant total de ce type de paiement")

