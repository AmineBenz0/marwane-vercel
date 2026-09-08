"""Inventory balances and controlled manual adjustments."""

from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import Utilisateur
from app.schemas.inventory import MouvementStockRead, StockAdjustmentCreate, StockBalanceRead
from app.services.inventory import get_stock_snapshot, record_adjustment
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/stock", tags=["Inventory"])


@router.get("", response_model=List[StockBalanceRead])
def get_stock(
    id_produit: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    return get_stock_snapshot(db, id_produit=id_produit)


@router.post("/adjustments", response_model=MouvementStockRead, status_code=status.HTTP_201_CREATED)
def adjust_stock(
    payload: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    movement = record_adjustment(
        db,
        id_produit=payload.id_produit,
        quantite_delta=Decimal(str(payload.quantite_delta)),
        cout_unitaire=Decimal(str(payload.cout_unitaire)),
        current_user=current_user,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(movement)
    return movement
