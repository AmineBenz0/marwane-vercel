"""
Modèle SQLAlchemy pour la table Caisse_Solde_Historique.
"""
from sqlalchemy import Column, Integer, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class CaisseSoldeHistorique(Base):
    """
    Modèle représentant un snapshot historique du solde de la caisse.
    
    Attributs:
        id_historique: Identifiant unique de l'historique (PK)
        date_snapshot: Date et heure du snapshot (NOT NULL)
        solde: Solde de la caisse au moment du snapshot (NOT NULL)
        id_mouvement: ID du mouvement de caisse qui a généré ce snapshot (FK, nullable)
    """
    __tablename__ = "caisse_solde_historique"
    
    id_historique = Column(Integer, primary_key=True, index=True)
    date_snapshot = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    solde = Column(Numeric(15, 2), nullable=False)
    id_mouvement = Column(Integer, ForeignKey("caisse.id_mouvement"), nullable=True, index=True)
    
    # Relations
    mouvement = relationship("Caisse", back_populates="historiques_solde")

