"""
Modèle SQLAlchemy pour la table Produits.
"""
from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


class Produit(Base):
    """
    Modèle représentant un produit.
    
    Attributs:
        id_produit: Identifiant unique du produit (PK)
        nom_produit: Nom du produit (UNIQUE, NOT NULL)
        est_actif: Indique si le produit est actif (soft delete, DEFAULT true)
    """
    __tablename__ = "produits"
    
    id_produit = Column(Integer, primary_key=True, index=True)
    nom_produit = Column(String(255), unique=True, nullable=False)
    est_actif = Column(Boolean, default=True, nullable=False)
    
    # Relations
    lignes_transaction = relationship("LigneTransaction", back_populates="produit")

