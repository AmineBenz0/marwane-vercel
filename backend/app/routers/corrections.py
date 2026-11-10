"""Versioned correction API; mutation routes are disabled until release approval."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand
from app.services.correction_commands import apply_correction, preview_correction
from app.models.user import Utilisateur
from app.services.correction_history import transaction_correction_history
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/corrections", tags=["Corrections"])


@router.get("/history")
def history(
    transaction_id: int = Query(gt=0),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """View paginated audited operations for an existing transaction."""
    if db.get(Transaction, transaction_id) is None:
        raise HTTPException(status_code=404, detail="Transaction introuvable.")
    return transaction_correction_history(db, transaction_id, offset=offset, limit=limit)


@router.post("/preview")
def preview(
    command: CorrectionCommand,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Read-only validation and impact fingerprint."""
    if not settings.ENABLE_CORRECTION_WRITES:
        raise HTTPException(503, "Les corrections avancées ne sont pas encore activées.")
    return preview_correction(db, command)


@router.post("/apply")
def apply(
    command: CorrectionApplyCommand,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Atomic, idempotent audited correction; unsupported fields are rejected."""
    if not settings.ENABLE_CORRECTION_WRITES:
        raise HTTPException(503, "Les corrections avancées ne sont pas encore activées.")
    return apply_correction(db, command, current_user)
