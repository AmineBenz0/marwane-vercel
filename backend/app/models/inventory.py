"""Append-only inventory movements for general products."""

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class MouvementStock(Base):
    """Immutable stock movement used to derive product quantities and costs."""

    __tablename__ = "mouvements_stock"

    id_mouvement_stock = Column(Integer, primary_key=True, index=True)
    id_produit = Column(
        Integer,
        ForeignKey("produits.id_produit"),
        nullable=False,
        index=True,
    )
    quantite_delta = Column(Numeric(15, 3), nullable=False)
    cout_unitaire = Column(Numeric(15, 4), nullable=False, default=0)
    type_mouvement = Column(String(40), nullable=False, index=True)
    source_type = Column(String(40), nullable=False, index=True)
    source_id = Column(Integer, nullable=True, index=True)
    cle_idempotence = Column(String(120), nullable=True, unique=True, index=True)
    id_mouvement_inverse = Column(
        Integer,
        ForeignKey("mouvements_stock.id_mouvement_stock"),
        nullable=True,
        index=True,
    )
    date_mouvement = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    id_utilisateur = Column(
        Integer,
        ForeignKey("utilisateurs.id_utilisateur"),
        nullable=True,
        index=True,
    )
    notes = Column(Text, nullable=True)

    produit = relationship("Produit", backref="mouvements_stock")
    inverse = relationship(
        "MouvementStock",
        remote_side=[id_mouvement_stock],
        foreign_keys=[id_mouvement_inverse],
        uselist=False,
    )

    __table_args__ = (
        CheckConstraint("quantite_delta <> 0", name="check_stock_delta_nonzero"),
        CheckConstraint("cout_unitaire >= 0", name="check_stock_cost_nonnegative"),
        UniqueConstraint(
            "source_type",
            "source_id",
            "type_mouvement",
            "id_produit",
            "id_mouvement_inverse",
            name="uq_stock_source_movement",
        ),
        Index(
            "uq_stock_source_movement_active",
            "source_type",
            "source_id",
            "type_mouvement",
            "id_produit",
            unique=True,
            postgresql_where=id_mouvement_inverse.is_(None),
            sqlite_where=id_mouvement_inverse.is_(None),
        ),
    )
