"""
Modèle SQLAlchemy pour la table Transactions.
"""
from sqlalchemy import Column, Integer, Date, Numeric, Boolean, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
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

