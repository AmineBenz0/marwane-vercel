"""Auditable outgoing uses of a business-held letter of credit."""
from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class LettreCreditUtilisation(Base):
    __tablename__ = "utilisations_lettre_credit"

    id_utilisation = Column(Integer, primary_key=True, index=True)
    id_lc = Column(Integer, ForeignKey("lettres_credit.id_lc", ondelete="RESTRICT"), nullable=False, index=True)
    type_utilisation = Column(String(20), nullable=False)
    date_utilisation = Column(Date, nullable=False, index=True)
    id_fournisseur = Column(Integer, ForeignKey("fournisseurs.id_fournisseur"), nullable=True)
    id_compte = Column(Integer, ForeignKey("comptes_bancaires.id_compte"), nullable=True)
    id_paiement = Column(Integer, ForeignKey("paiements.id_paiement", ondelete="RESTRICT"), nullable=True)
    id_cession = Column(Integer, ForeignKey("cessions_lc.id_cession", ondelete="RESTRICT"), nullable=True)
    id_mouvement_bancaire = Column(
        Integer,
        ForeignKey("mouvements_bancaires.id_mouvement", ondelete="RESTRICT"),
        nullable=True,
    )
    statut = Column(String(20), nullable=False, default="active", server_default="active", index=True)
    motif_annulation = Column(Text, nullable=True)
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)

    lettre_credit = relationship("LettreDeCredit", back_populates="utilisations")
    fournisseur = relationship("Fournisseur")
    compte_bancaire = relationship("CompteBancaire")
    paiement = relationship("Paiement")
    cession = relationship("CessionLC")
    mouvement_bancaire = relationship("MouvementBancaire")

    __table_args__ = (
        CheckConstraint("type_utilisation IN ('fournisseur', 'banque')", name="check_lc_usage_type"),
        CheckConstraint("statut IN ('active', 'annulee')", name="check_lc_usage_status"),
        CheckConstraint(
            "(type_utilisation = 'fournisseur' AND id_fournisseur IS NOT NULL AND id_compte IS NULL "
            "AND id_mouvement_bancaire IS NULL AND (id_paiement IS NOT NULL OR id_cession IS NOT NULL)) "
            "OR (type_utilisation = 'banque' AND id_fournisseur IS NULL AND id_compte IS NOT NULL "
            "AND id_paiement IS NULL AND id_cession IS NULL AND id_mouvement_bancaire IS NOT NULL)",
            name="check_lc_usage_target",
        ),
        Index(
            "uq_lc_one_active_usage",
            "id_lc",
            unique=True,
            postgresql_where=text("statut = 'active'"),
            sqlite_where=text("statut = 'active'"),
        ),
        Index("uq_lc_usage_payment", "id_paiement", unique=True, postgresql_where=text("id_paiement IS NOT NULL"), sqlite_where=text("id_paiement IS NOT NULL")),
        Index("uq_lc_usage_cession", "id_cession", unique=True, postgresql_where=text("id_cession IS NOT NULL"), sqlite_where=text("id_cession IS NOT NULL")),
        Index("uq_lc_usage_bank_movement", "id_mouvement_bancaire", unique=True, postgresql_where=text("id_mouvement_bancaire IS NOT NULL"), sqlite_where=text("id_mouvement_bancaire IS NOT NULL")),
    )
