"""Preview and apply owner corrections under revision and idempotency checks."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import settings
from app.config import settings
from app.database import get_db
from app.models.user import Utilisateur
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand
from app.services.correction_commands import apply_correction, preview_correction
from app.services.correction_history import transaction_correction_history
from app.models.transaction import Transaction
from app.models.paiement import Paiement
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
    _require_correction_release(db, command)
    return preview_correction(db, command)


@router.post("/apply")
def apply(
    command: CorrectionApplyCommand,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Apply one supported correction and commit its history atomically."""
    _require_correction_release(db, command)
    return apply_correction(db, command, current_user)


def _require_correction_release(db: Session, command: CorrectionCommand) -> None:
    # A route existing in an app bundle does not mean the financial migration
    # is installed. This switch must be explicitly approved after reconciliation.
    if not settings.ENABLE_CORRECTION_WRITES:
        raise HTTPException(503, "Les corrections avancées ne sont pas encore activées.")
    # LC/cheque financial status and lifecycle changes are a separate release:
    # instrument_corrections.sql and lc_lifecycle.sql are NOT installed here.
    fields = command.changes.model_fields_set
    if fields & {"statut_cheque", "date_encaissement_effective"}:
        raise HTTPException(422, "La correction des chèques nécessite le module dédié.")
    if command.target.entity_type == "paiement":
        row = db.get(Paiement, command.target.entity_id)
        if row is not None and (row.type_paiement in {"cheque", "lc"} or row.id_lc is not None):
            raise HTTPException(422, "Ce règlement nécessite la correction dédiée aux instruments.")
