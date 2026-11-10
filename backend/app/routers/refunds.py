"""Explicit return of an existing transaction credit."""
from fastapi import APIRouter, Depends, HTTPException
from app.config import settings
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import Utilisateur
from app.schemas.refund import RefundCommand, RefundApplyCommand
from app.services.refunds import preview_refund, apply_refund
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix='/remboursements', tags=['Remboursements'])


def _require_release():
    if not settings.ENABLE_CREDIT_REFUND_WRITES:
        raise HTTPException(503, "Les remboursements ne sont pas encore activés.")



@router.post('/preview')
def preview(command: RefundCommand, db: Session = Depends(get_db),
            actor: Utilisateur = Depends(get_current_active_user)):
    _require_release()
    return preview_refund(db, command)


@router.post('/apply')
def apply(command: RefundApplyCommand, db: Session = Depends(get_db),
          actor: Utilisateur = Depends(get_current_active_user)):
    _require_release()
    return apply_refund(db, command, actor)
