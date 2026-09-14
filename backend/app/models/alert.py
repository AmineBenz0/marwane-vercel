"""Persistent in-app alerts."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class Alerte(Base):
    """An idempotent alert visible to authenticated application users."""

    __tablename__ = "alertes"

    id_alerte = Column(Integer, primary_key=True, index=True)
    id_transaction = Column(
        Integer,
        ForeignKey("transactions.id_transaction"),
        nullable=True,
        index=True,
    )
    type_alerte = Column(String(40), nullable=False, index=True)
    titre = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    date_reference = Column(Date, nullable=False, index=True)
    est_lue = Column(Boolean, nullable=False, default=False, index=True)
    date_lecture = Column(DateTime(timezone=True), nullable=True)
    date_creation = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    transaction = relationship("Transaction", backref="alertes")

    __table_args__ = (
        UniqueConstraint(
            "id_transaction",
            "type_alerte",
            "date_reference",
            name="uq_alert_transaction_type_date",
        ),
    )
