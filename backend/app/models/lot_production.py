"""One arrival shared by all of its building allocations."""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class LotProduction(Base):
    __tablename__ = "lots_production"

    id_lot = Column(Integer, primary_key=True, index=True)
    nom_lot = Column(String(100), nullable=False)
    souche = Column(String(100))
    date_debut = Column(Date, nullable=False, index=True)
    age_depart_semaines = Column(Integer, nullable=False, default=0)
    effectif_initial = Column(Integer)  # Unknown only for imported historical lots.
    duree_semaines = Column(Integer, nullable=False, default=100)
    date_fin_prevue = Column(Date, nullable=False)
    date_fin_reelle = Column(Date)
    statut = Column(String(30), nullable=False, default="actif", index=True)
    notes = Column(Text)
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"))
    id_utilisateur_modification = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"))

    allocations = relationship("CycleProduction", back_populates="lot", order_by="CycleProduction.id_batiment")
