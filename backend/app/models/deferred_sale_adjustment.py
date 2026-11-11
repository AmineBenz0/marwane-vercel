"""Append-only Release 4 commercial adjustments for deferred egg sales.

Phase 2 only: mapped for future read projections and atomic Phase 4 writes.
The PostgreSQL migration is the source of runtime security, trigger and RLS rules.
"""
from sqlalchemy import (
    Column, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric,
    UniqueConstraint, Uuid,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class DeferredSaleAdjustment(Base):
    __tablename__ = "avoirs_livraison_differee"

    id_avoir = Column(
        Uuid, ForeignKey("correction_operations.operation_id", ondelete="RESTRICT"),
        primary_key=True,
    )
    id_transaction = Column(
        Integer, ForeignKey("transactions.id_transaction", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    id_client = Column(Integer, ForeignKey("clients.id_client", ondelete="RESTRICT"), nullable=False)
    id_utilisateur_creation = Column(
        Integer, ForeignKey("utilisateurs.id_utilisateur", ondelete="RESTRICT"), nullable=False,
    )
    date_effet = Column(Date, nullable=False, index=True)
    date_creation = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    quantite_initiale = Column(Integer, nullable=False)
    montant_initial = Column(Numeric(15, 2), nullable=False)
    quantite_annulee_avant = Column(Integer, nullable=False)
    quantite_annulee = Column(Integer, nullable=False)
    quantite_annulee_cumulee = Column(Integer, nullable=False)
    avoir_cumule_avant = Column(Numeric(15, 2), nullable=False)
    montant_avoir = Column(Numeric(15, 2), nullable=False)
    avoir_cumule = Column(Numeric(15, 2), nullable=False)

    transaction = relationship("Transaction", viewonly=True)

    __table_args__ = (
        CheckConstraint("quantite_initiale > 0", name="ck_avoir_q_initiale"),
        CheckConstraint("montant_initial > 0", name="ck_avoir_m_initial"),
        CheckConstraint(
            "quantite_annulee > 0 AND quantite_annulee_avant >= 0 "
            "AND quantite_annulee_cumulee = quantite_annulee_avant + quantite_annulee "
            "AND quantite_annulee_cumulee <= quantite_initiale",
            name="ck_avoir_qty",
        ),
        CheckConstraint(
            "montant_avoir >= 0 AND avoir_cumule_avant >= 0 "
            "AND avoir_cumule = avoir_cumule_avant + montant_avoir "
            "AND avoir_cumule <= montant_initial",
            name="ck_avoir_m",
        ),
        UniqueConstraint("id_transaction", "quantite_annulee_cumulee", name="uq_avoir_chain"),
    )
