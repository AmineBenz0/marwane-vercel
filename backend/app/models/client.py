"""
Modèle SQLAlchemy pour la table Clients.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Client(Base):
    """
    Modèle représentant un client.
    
    Attributs:
        id_client: Identifiant unique du client (PK)
        nom_client: Nom du client (NOT NULL)
        est_actif: Indique si le client est actif (soft delete, DEFAULT true)
        date_creation: Date de création
        date_modification: Date de dernière modification
        id_utilisateur_creation: ID de l'utilisateur qui a créé le client (FK)
        id_utilisateur_modification: ID de l'utilisateur qui a modifié le client (FK)
    """
    __tablename__ = "clients"
    
    id_client = Column(Integer, primary_key=True, index=True)
    nom_client = Column(String(255), nullable=False)
    est_actif = Column(Boolean, default=True, nullable=False)
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    id_utilisateur_modification = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    
    # Relations
    utilisateur_creation = relationship("Utilisateur", foreign_keys=[id_utilisateur_creation], back_populates="clients_crees")
    utilisateur_modification = relationship("Utilisateur", foreign_keys=[id_utilisateur_modification], back_populates="clients_modifies")
    transactions = relationship("Transaction", back_populates="client")

