"""Append-only audit records for financial corrections.

The operational rows keep their current state for efficient reads, while this
journal preserves the correction event and its links to the original and
replacement movement records.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class CorrectionFinanciere(Base):
    """Immutable journal entry for a payment, charge, or ledger correction."""

    __tablename__ = "corrections_financieres"

    id_correction = Column(Integer, primary_key=True, index=True)
    type_entite = Column(String(30), nullable=False, index=True)
    id_entite = Column(Integer, nullable=False, index=True)
    action = Column(String(30), nullable=False)
    id_mouvement_original = Column(Integer, nullable=True, index=True)
    id_mouvement_inverse = Column(Integer, nullable=True, index=True)
    raison = Column(Text, nullable=False)
    details = Column(Text, nullable=True)
    id_utilisateur = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    date_correction = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

