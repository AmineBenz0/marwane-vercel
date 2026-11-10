"""Read-only correction history for the first controlled production increment.

The mutation endpoints from staging are deliberately *not* mounted: they depend on
later financial/stock/cheque migrations and acceptance tests.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.transaction import Transaction
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
