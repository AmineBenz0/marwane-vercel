"""Bill of materials (BOM) definitions."""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Nomenclature(Base):
    """Versioned recipe describing how raw materials create a finished product."""

    __tablename__ = "nomenclatures"

    id_nomenclature = Column(Integer, primary_key=True, index=True)
    id_produit_sortie = Column(
        Integer,
        ForeignKey("produits.id_produit"),
        nullable=False,
        index=True,
    )
    version = Column(Integer, nullable=False, default=1)
    est_active = Column(Boolean, nullable=False, default=True, index=True)
    date_debut = Column(Date, nullable=True)
    date_fin = Column(Date, nullable=True)
    quantite_sortie = Column(Numeric(15, 3), nullable=False, default=1)
    rendement_pct = Column(Numeric(5, 2), nullable=False, default=100)
    notes = Column(Text, nullable=True)
    date_creation = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    id_utilisateur = Column(
        Integer,
        ForeignKey("utilisateurs.id_utilisateur"),
        nullable=True,
    )

    produit_sortie = relationship(
        "Produit",
        foreign_keys=[id_produit_sortie],
        backref="nomenclatures_sortie",
    )
    lignes = relationship(
        "NomenclatureLigne",
        back_populates="nomenclature",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("version > 0", name="check_bom_version_positive"),
        CheckConstraint("quantite_sortie > 0", name="check_bom_output_positive"),
        CheckConstraint(
            "rendement_pct > 0 AND rendement_pct <= 100",
            name="check_bom_yield_range",
        ),
        UniqueConstraint(
            "id_produit_sortie",
            "version",
            name="uq_bom_product_version",
        ),
    )


class NomenclatureLigne(Base):
    """Raw-material requirement for a BOM."""

    __tablename__ = "nomenclature_lignes"

    id_ligne = Column(Integer, primary_key=True, index=True)
    id_nomenclature = Column(
        Integer,
        ForeignKey("nomenclatures.id_nomenclature"),
        nullable=False,
        index=True,
    )
    id_produit_entree = Column(
        Integer,
        ForeignKey("produits.id_produit"),
        nullable=False,
        index=True,
    )
    quantite = Column(Numeric(15, 3), nullable=False)

    nomenclature = relationship("Nomenclature", back_populates="lignes")
    produit_entree = relationship("Produit", backref="nomenclatures_entree")

    __table_args__ = (
        CheckConstraint("quantite > 0", name="check_bom_line_positive"),
        UniqueConstraint(
            "id_nomenclature",
            "id_produit_entree",
            name="uq_bom_input_product",
        ),
    )
