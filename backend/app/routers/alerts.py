"""Authenticated in-app alert endpoints."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.alert import Alerte
from app.models.user import Utilisateur
from app.schemas.alert import AlerteRead, AlerteSummary
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("", response_model=List[AlerteRead])
def get_alerts(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    query = db.query(Alerte)
    if unread_only:
        query = query.filter(Alerte.est_lue.is_(False))
    return query.order_by(Alerte.date_creation.desc()).limit(limit).all()


@router.get("/summary", response_model=AlerteSummary)
def get_alert_summary(
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    return AlerteSummary(unread_count=db.query(Alerte).filter(Alerte.est_lue.is_(False)).count())


@router.patch("/{id}/read", response_model=AlerteRead)
def mark_alert_read(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    alert = db.query(Alerte).filter(Alerte.id_alerte == id).first()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerte introuvable")
    alert.est_lue = True
    from datetime import datetime, timezone
    alert.date_lecture = datetime.now(timezone.utc)
    db.commit()
    db.refresh(alert)
    return alert
