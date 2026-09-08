"""Audited execution records for scheduled and operational jobs."""

from sqlalchemy import CheckConstraint, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class JobExecution(Base):
    """One durable outcome for a scheduled job invocation."""

    __tablename__ = "job_executions"

    id_execution = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(100), nullable=False, index=True)
    statut = Column(String(20), nullable=False, default="running", index=True)
    started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_count = Column(Integer, nullable=False, default=0, server_default="0")
    failure_type = Column(String(100), nullable=True)
    failure_message = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "statut IN ('running', 'succeeded', 'failed')",
            name="check_job_execution_status",
        ),
        CheckConstraint("created_count >= 0", name="check_job_execution_count"),
    )
