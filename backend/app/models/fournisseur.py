"""
Modèle SQLAlchemy pour la table Fournisseurs.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Fournisseur(Base):
    """
    Modèle représentant un fournisseur.
    
    Attributs:
        id_fournisseur: Identifiant unique du fournisseur (PK)
        nom_fournisseur: Nom du fournisseur (NOT NULL)
        est_actif: Indique si le fournisseur est actif (soft delete, DEFAULT true)
        date_creation: Date de création
        date_modification: Date de dernière modification
        id_utilisateur_creation: ID de l'utilisateur qui a créé le fournisseur (FK)
        id_utilisateur_modification: ID de l'utilisateur qui a modifié le fournisseur (FK)
    """
    __tablename__ = "fournisseurs"
    
    id_fournisseur = Column(Integer, primary_key=True, index=True)
    nom_fournisseur = Column(String(255), nullable=False)
    est_actif = Column(Boolean, default=True, nullable=False)
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    id_utilisateur_modification = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    
    # Relations
    utilisateur_creation = relationship("Utilisateur", foreign_keys=[id_utilisateur_creation], back_populates="fournisseurs_crees")
    utilisateur_modification = relationship("Utilisateur", foreign_keys=[id_utilisateur_modification], back_populates="fournisseurs_modifies")
    transactions = relationship("Transaction", back_populates="fournisseur")

