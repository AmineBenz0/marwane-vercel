"""Controlled scheduled jobs for Vercel Cron."""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
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
    created = create_overdue_alerts(db)
    return {"status": "ok", "business_date": business_date().isoformat(), "created": created}
