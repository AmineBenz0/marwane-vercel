"""Explicit return of an existing transaction credit."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import Utilisateur
from app.schemas.refund import RefundCommand, RefundApplyCommand
from app.services.refunds import preview_refund, apply_refund
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix='/remboursements', tags=['Remboursements'])


@router.post('/preview')
def preview(command: RefundCommand, db: Session = Depends(get_db),
            actor: Utilisateur = Depends(get_current_active_user)):
    return preview_refund(db, command)


@router.post('/apply')
def apply(command: RefundApplyCommand, db: Session = Depends(get_db),
          actor: Utilisateur = Depends(get_current_active_user)):
    return apply_refund(db, command, actor)
