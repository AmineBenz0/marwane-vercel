"""
Modèle SQLAlchemy pour la table Paiements.
"""
from sqlalchemy import Column, Integer, String, Date, Numeric, DateTime, ForeignKey, CheckConstraint, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Paiement(Base):
    """
    Modèle représentant un paiement effectué pour une transaction.
    
    Une transaction peut avoir plusieurs paiements (paiements échelonnés, partiels, etc.).
    
    Attributs:
        id_paiement: Identifiant unique du paiement (PK)
        id_transaction: ID de la transaction associée (FK, NOT NULL)
        date_paiement: Date à laquelle le paiement a été effectué (NOT NULL)
        montant: Montant de ce paiement (NOT NULL, > 0)
        type_paiement: Type de paiement (cash, cheque, virement, carte, autre)
        
        # Informations pour les chèques
        numero_cheque: Numéro du chèque (nullable)
        banque: Nom de la banque émettrice (nullable)
        date_encaissement_prevue: Date prévue d'encaissement du chèque (nullable)
        date_encaissement_effective: Date réelle d'encaissement du chèque (nullable)
        statut_cheque: Statut du chèque (emis, a_encaisser, encaisse, rejete, annule) (nullable)
        motif_rejet: Motif du rejet si le chèque est rejeté (nullable)
        
        # Informations pour les virements
        reference_virement: Référence du virement bancaire (nullable)
        
        # Informations générales
        notes: Notes ou commentaires additionnels (nullable)
        statut: Statut général du paiement (valide, en_attente, rejete, annule)
        
        # Métadonnées de traçabilité
        date_creation: Date de création de l'enregistrement
        date_modification: Date de dernière modification
        id_utilisateur_creation: ID de l'utilisateur qui a créé le paiement (FK)
        id_utilisateur_modification: ID de l'utilisateur qui a modifié le paiement (FK)
    """
    __tablename__ = "paiements"
    
    # Identifiants
    id_paiement = Column(Integer, primary_key=True, index=True)
    id_transaction = Column(Integer, ForeignKey("transactions.id_transaction"), nullable=False, index=True)
    id_lc = Column(Integer, ForeignKey("lettres_credit.id_lc"), nullable=True, index=True)
    
    # Informations de base du paiement
    date_paiement = Column(Date, nullable=False, index=True)
    montant = Column(Numeric(15, 2), nullable=False)
    type_paiement = Column(String(20), nullable=False, index=True)  # cash, cheque, virement, carte, autre
    
    # Informations pour les chèques
    numero_cheque = Column(String(50), nullable=True, index=True)
    banque = Column(String(100), nullable=True)
    date_encaissement_prevue = Column(Date, nullable=True)
    date_encaissement_effective = Column(Date, nullable=True)
    statut_cheque = Column(String(20), nullable=True)  # emis, a_encaisser, encaisse, rejete, annule
    motif_rejet = Column(Text, nullable=True)
    
    # Informations pour les virements
    reference_virement = Column(String(100), nullable=True)
    
    # Informations générales
    notes = Column(Text, nullable=True)
    statut = Column(String(20), nullable=False, default='valide')  # valide, en_attente, rejete, annule
    
    # Métadonnées de traçabilité
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    id_utilisateur_modification = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    
    # Contraintes
    __table_args__ = (
        CheckConstraint('montant > 0', name='check_paiement_montant_positif'),
        CheckConstraint(
            "type_paiement IN ('cash', 'cheque', 'virement', 'carte', 'compensation', 'lc', 'autre')",
            name='check_type_paiement_valide'
        ),
        CheckConstraint(
            "statut IN ('valide', 'en_attente', 'rejete', 'annule')",
            name='check_statut_paiement_valide'
        ),
        CheckConstraint(
            "statut_cheque IS NULL OR statut_cheque IN ('emis', 'a_encaisser', 'encaisse', 'rejete', 'annule')",
            name='check_statut_cheque_valide'
        ),
    )
    
    # Relations
    transaction = relationship("Transaction", back_populates="paiements")
    lettre_credit = relationship("LettreDeCredit", back_populates="paiements")
    utilisateur_creation = relationship(
        "Utilisateur", 
        foreign_keys=[id_utilisateur_creation],
        backref="paiements_crees"
    )
    utilisateur_modification = relationship(
        "Utilisateur", 
        foreign_keys=[id_utilisateur_modification],
        backref="paiements_modifies"
    )

