"""
Modèle SQLAlchemy pour la table Utilisateurs.
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Utilisateur(Base):
    """
    Modèle représentant un utilisateur du système.
    
    Attributs:
        id_utilisateur: Identifiant unique de l'utilisateur (PK)
        nom_utilisateur: Nom de l'utilisateur (NOT NULL)
        email: Email de l'utilisateur (UNIQUE, NOT NULL)
        mot_de_passe_hash: Hash du mot de passe (NOT NULL)
        role: Rôle de l'utilisateur (admin, comptable, etc.)
        est_actif: Indique si l'utilisateur est actif (soft delete, DEFAULT true)
        date_creation: Date de création de l'utilisateur
        date_modification: Date de dernière modification
    """
    __tablename__ = "utilisateurs"
    
    id_utilisateur = Column(Integer, primary_key=True, index=True)
    nom_utilisateur = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    mot_de_passe_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=True)
    est_actif = Column(Boolean, default=True, nullable=False)
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relations
    # Note: Les foreign_keys sont définies dans les modèles enfants (Client, Fournisseur, Transaction)
    # SQLAlchemy résoudra automatiquement les relations via les ForeignKey définis dans ces modèles
    clients_crees = relationship("Client", foreign_keys="[Client.id_utilisateur_creation]", back_populates="utilisateur_creation")
    clients_modifies = relationship("Client", foreign_keys="[Client.id_utilisateur_modification]", back_populates="utilisateur_modification")
    fournisseurs_crees = relationship("Fournisseur", foreign_keys="[Fournisseur.id_utilisateur_creation]", back_populates="utilisateur_creation")
    fournisseurs_modifies = relationship("Fournisseur", foreign_keys="[Fournisseur.id_utilisateur_modification]", back_populates="utilisateur_modification")
    transactions_crees = relationship("Transaction", foreign_keys="[Transaction.id_utilisateur_creation]", back_populates="utilisateur_creation")
    transactions_modifies = relationship("Transaction", foreign_keys="[Transaction.id_utilisateur_modification]", back_populates="utilisateur_modification")
    audits_transactions = relationship("TransactionAudit", back_populates="utilisateur")

