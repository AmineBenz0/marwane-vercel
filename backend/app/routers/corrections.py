"""Preview and apply owner corrections under revision and idempotency checks."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import Utilisateur
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand
from app.services.correction_commands import apply_correction, preview_correction
from app.services.correction_history import transaction_correction_history
from app.models.transaction import Transaction
from app.utils.dependencies import get_current_active_user


router = APIRouter(prefix="/corrections", tags=["Corrections"])


@router.get('/history')
def history(transaction_id: int = Query(gt=0), offset: int = Query(0, ge=0),
            limit: int = Query(20, ge=1, le=50), db: Session = Depends(get_db),
            current_user: Utilisateur = Depends(get_current_active_user)):
    if db.get(Transaction, transaction_id) is None:
        raise HTTPException(404, 'Transaction introuvable.')
    return transaction_correction_history(db, transaction_id, offset=offset, limit=limit)


@router.post("/preview")
def preview(
    command: CorrectionCommand,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Read-only impact preview; no ledger, stock, or history writes."""
    return preview_correction(db, command)


@router.post("/apply")
def apply(
    command: CorrectionApplyCommand,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Apply one supported correction and commit its history atomically."""
    return apply_correction(db, command, current_user)
