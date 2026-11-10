"""Current records remain addressable; their revisions are immutable history."""
from sqlalchemy import BigInteger, CheckConstraint, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base

SNAPSHOT = JSON().with_variant(JSONB(), "postgresql")


class CorrectionOperation(Base):
    __tablename__ = "correction_operations"
    operation_id = Column(Uuid, primary_key=True)
    request_hash = Column(String(64), nullable=False)
    id_utilisateur = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=False)
    reason = Column(Text, nullable=False)
    request_payload = Column(SNAPSHOT, nullable=False)
    result_payload = Column(SNAPSHOT, nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (
        CheckConstraint("length(request_hash) = 64", name="check_operation_hash_length"),
        CheckConstraint("length(trim(reason)) BETWEEN 1 AND 1000", name="check_operation_reason"),
    )


class EntityRevision(Base):
    __tablename__ = "entity_revisions"
    id_revision = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    entity_type = Column(String(20), nullable=False)
    entity_id = Column(Integer, nullable=False)
    revision = Column(BigInteger, nullable=False)
    operation_id = Column(Uuid, ForeignKey("correction_operations.operation_id"))
    event_kind = Column(String(12), nullable=False)
    before_snapshot = Column(SNAPSHOT)
    after_snapshot = Column(SNAPSHOT, nullable=False)
    id_utilisateur = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"))
    recorded_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "revision", name="uq_entity_revision"),
        CheckConstraint("entity_type IN ('transaction','paiement')", name="check_revision_type"),
        CheckConstraint("entity_id > 0 AND revision > 0", name="check_revision_positive"),
        CheckConstraint("event_kind IN ('baseline','insert','update')", name="check_revision_kind"),
    )
