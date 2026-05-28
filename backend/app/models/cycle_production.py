"""
SQLAlchemy model for production cycles/lots.
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class CycleProduction(Base):
    """
    Represents one flock/lot cycle inside a building.
    """
    __tablename__ = "cycles_production"

    id_cycle = Column(Integer, primary_key=True, index=True)
    id_batiment = Column(Integer, ForeignKey("batiments.id_batiment"), nullable=False, index=True)
    nom_cycle = Column(String(100), nullable=False)
    souche = Column(String(100), nullable=True)
    date_debut = Column(Date, nullable=False, index=True)
    age_depart_semaines = Column(Integer, nullable=False, default=0)
    effectif_initial = Column(Integer, nullable=True)
    duree_semaines = Column(Integer, nullable=False, default=100)
    date_fin_prevue = Column(Date, nullable=False, index=True)
    date_fin_reelle = Column(Date, nullable=True, index=True)
    statut = Column(String(30), nullable=False, default="actif", index=True)
    notes = Column(Text, nullable=True)
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    id_utilisateur_modification = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)

    batiment = relationship("Batiment", back_populates="cycles_production")
    productions = relationship("Production", back_populates="cycle")
    transactions = relationship("Transaction", back_populates="cycle")
    utilisateur_creation = relationship("Utilisateur", foreign_keys=[id_utilisateur_creation])
    utilisateur_modification = relationship("Utilisateur", foreign_keys=[id_utilisateur_modification])
