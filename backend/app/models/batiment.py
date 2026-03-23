"""
Modèle SQLAlchemy pour la table Batiments.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Batiment(Base):
    """
    Modèle représentant un bâtiment de production.
    """
    __tablename__ = "batiments"
    
    id_batiment = Column(Integer, primary_key=True, index=True)
    nom = Column(String(50), nullable=False, unique=True)
    description = Column(String(255), nullable=True)
    est_actif = Column(Boolean, default=True, nullable=False)
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relation avec la production
    productions = relationship("Production", back_populates="batiment", cascade="all, delete-orphan")
