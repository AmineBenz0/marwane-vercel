"""Vaccine catalogue. Expense prices are independent historical snapshots."""
from sqlalchemy import Boolean, CheckConstraint, Column, Integer, Numeric, String
from app.database import Base


class Vaccin(Base):
    __tablename__ = "vaccins"
    id_vaccin = Column(Integer, primary_key=True)
    nom = Column(String(150), nullable=False, unique=True)
    prix_defaut = Column(Numeric(15, 2), nullable=True)
    unite = Column(String(40), nullable=False, default="unité", server_default="unité")
    est_actif = Column(Boolean, nullable=False, default=True, server_default="true")
    __table_args__ = (
        CheckConstraint("prix_defaut IS NULL OR prix_defaut > 0", name="check_vaccin_prix_positif"),
    )