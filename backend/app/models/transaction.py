"""
Modèle SQLAlchemy pour la table Transactions.
"""
from sqlalchemy import Column, Integer, Date, Numeric, Boolean, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from decimal import Decimal
from datetime import date
from app.database import Base


class Transaction(Base):
    """
    Modèle représentant une transaction financière.
    
    Chaque transaction représente une ligne de vente/achat avec un seul produit.
    
    Attributs:
        id_transaction: Identifiant unique de la transaction (PK)
        date_transaction: Date de la transaction (NOT NULL)
        id_produit: ID du produit concerné (FK, NOT NULL)
        quantite: Quantité du produit (NOT NULL, > 0)
        prix_unitaire: Prix unitaire du produit (NOT NULL, > 0)
        montant_total: Montant total = quantite × prix_unitaire (NOT NULL, > 0)
        est_actif: Indique si la transaction est active (pour l'annulation, DEFAULT true)
        id_client: ID du client concerné (FK, nullable - exclusion mutuelle avec id_fournisseur)
        id_fournisseur: ID du fournisseur concerné (FK, nullable - exclusion mutuelle avec id_client)
        date_creation: Date de création
        date_modification: Date de dernière modification
        id_utilisateur_creation: ID de l'utilisateur qui a créé la transaction (FK)
        id_utilisateur_modification: ID de l'utilisateur qui a modifié la transaction (FK)
    
    Contraintes:
        - Une transaction concerne SOIT un client, SOIT un fournisseur (exclusion mutuelle)
        - Le montant, la quantité et le prix unitaire doivent être positifs
    """
    __tablename__ = "transactions"
    
    id_transaction = Column(Integer, primary_key=True, index=True)
    date_transaction = Column(Date, nullable=False, index=True)
    id_produit = Column(Integer, ForeignKey("produits.id_produit"), nullable=False, index=True)
    quantite = Column(Integer, nullable=False)
    prix_unitaire = Column(Numeric(15, 2), nullable=False)
    montant_total = Column(Numeric(15, 2), nullable=False)
    est_actif = Column(Boolean, default=True, nullable=False)
    id_client = Column(Integer, ForeignKey("clients.id_client"), nullable=True, index=True)
    id_fournisseur = Column(Integer, ForeignKey("fournisseurs.id_fournisseur"), nullable=True, index=True)
    date_echeance = Column(Date, nullable=True, index=True)
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    id_utilisateur_modification = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    
    # Contraintes au niveau SQLAlchemy (seront aussi ajoutées via migrations)
    __table_args__ = (
        CheckConstraint('montant_total > 0', name='check_montant_positif'),
        CheckConstraint('quantite > 0', name='check_quantite_positive'),
        CheckConstraint('prix_unitaire > 0', name='check_prix_unitaire_positive'),
        CheckConstraint(
            '(id_client IS NOT NULL AND id_fournisseur IS NULL) OR (id_fournisseur IS NOT NULL AND id_client IS NULL)',
            name='check_client_ou_fournisseur'
        ),
    )
    
    # Relations
    client = relationship("Client", back_populates="transactions")
    fournisseur = relationship("Fournisseur", back_populates="transactions")
    produit = relationship("Produit", back_populates="transactions")
    utilisateur_creation = relationship("Utilisateur", foreign_keys=[id_utilisateur_creation], back_populates="transactions_crees")
    utilisateur_modification = relationship("Utilisateur", foreign_keys=[id_utilisateur_modification], back_populates="transactions_modifies")
    mouvements_caisse = relationship("Caisse", back_populates="transaction")
    audits = relationship("TransactionAudit", back_populates="transaction")
    paiements = relationship("Paiement", back_populates="transaction", cascade="all, delete-orphan")
    
    # Propriétés calculées pour la gestion des paiements
    @property
    def montant_paye(self) -> Decimal:
        """
        Calcule le montant total payé pour cette transaction.
        Ne compte que les paiements avec statut 'valide' ou statut_cheque 'encaisse'.
        Les paiements rejetés ou annulés ne sont pas comptabilisés.
        
        Returns:
            Decimal: Montant total payé
        """
        if not self.paiements:
            return Decimal('0')
        
        total = Decimal('0')
        for paiement in self.paiements:
            # Pour les paiements non-chèque, on compte si statut est 'valide'
            if paiement.type_paiement != 'cheque' and paiement.statut == 'valide':
                total += Decimal(str(paiement.montant))
            # Pour les chèques, on compte seulement s'ils sont encaissés
            elif paiement.type_paiement == 'cheque' and paiement.statut_cheque == 'encaisse':
                total += Decimal(str(paiement.montant))
        
        return total
    
    @property
    def montant_restant(self) -> Decimal:
        """
        Calcule le montant restant à payer pour cette transaction.
        
        Returns:
            Decimal: Montant restant (montant_total - montant_paye)
        """
        return Decimal(str(self.montant_total)) - self.montant_paye
    
    @property
    def statut_paiement(self) -> str:
        """
        Détermine le statut de paiement de la transaction automatiquement.
        
        Statuts possibles:
        - 'paye': Montant totalement payé
        - 'partiel': Montant partiellement payé
        - 'impaye': Aucun paiement reçu
        - 'en_retard': Paiement incomplet après la date d'échéance
        
        Returns:
            str: Statut du paiement
        """
        montant_paye = self.montant_paye
        montant_total = Decimal(str(self.montant_total))
        
        # Totalement payé (avec une tolérance de 0.01 pour les arrondis)
        if montant_paye >= montant_total - Decimal('0.01'):
            return 'paye'
        
        # Aucun paiement
        if montant_paye == 0:
            return 'impaye'
        
        # Partiellement payé
        return 'partiel'
    
    @property
    def est_en_retard(self) -> bool:
        """
        Vérifie si la transaction est en retard de paiement.
        Une transaction est en retard si elle a une date d'échéance passée
        et qu'elle n'est pas entièrement payée.
        
        Returns:
            bool: True si en retard, False sinon
        """
        # Pas d'échéance définie = pas de retard possible
        if not hasattr(self, 'date_echeance') or self.date_echeance is None:
            return False
        
        # Si entièrement payé, pas de retard
        if self.statut_paiement == 'paye':
            return False
        
        # Vérifier si la date d'échéance est dépassée
        return date.today() > self.date_echeance
    
    @property
    def pourcentage_paye(self) -> float:
        """
        Calcule le pourcentage du montant total qui a été payé.
        
        Returns:
            float: Pourcentage payé (0-100)
        """
        if self.montant_total == 0:
            return 0.0
        
        return float((self.montant_paye / Decimal(str(self.montant_total))) * 100)

