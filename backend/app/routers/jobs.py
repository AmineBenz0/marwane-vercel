"""Controlled scheduled jobs for Vercel Cron."""

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.job_execution import JobExecution
from app.services.alerts import create_overdue_alerts
from app.utils.business_date import business_date

router = APIRouter(prefix="/internal/jobs", tags=["Internal jobs"])


@router.get("/payment-alerts")
def run_payment_alert_job(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    expected = settings.CRON_SECRET
    provided = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not expected or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    execution = JobExecution(job_name="payment-alerts", statut="running")
    db.add(execution)
    db.commit()
    db.refresh(execution)
    try:
        created = create_overdue_alerts(db)
        execution.statut = "succeeded"
        execution.created_count = created
        execution.completed_at = datetime.now(timezone.utc)
        db.commit()
        return {
            "status": "ok",
            "business_date": business_date().isoformat(),
            "created": created,
            "execution_id": execution.id_execution,
        }
    except Exception as exc:
        db.rollback()
        failed_execution = JobExecution(
            job_name="payment-alerts",
            statut="failed",
            completed_at=datetime.now(timezone.utc),
            failure_type=type(exc).__name__,
            failure_message="Le job planifié a échoué. Consultez les logs structurés pour le détail.",
        )
        db.add(failed_execution)
        db.commit()
        raise
