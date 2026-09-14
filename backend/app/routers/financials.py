"""Receivables and payables endpoints."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import Utilisateur
from app.schemas.financial import FinancialCollectionRead, FinancialSummary
from app.schemas.paiement import StatutPaiementTransaction
from app.models.transaction import Transaction
from app.services.financial import (
    payment_status,
    query_financial_transactions,
    serialize_financial_transaction,
    summarize_financial_transactions,
)
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/transactions", tags=["Receivables / Payables"])


def _collection(
    db: Session,
    *,
    direction: str,
    statut: Optional[str],
    id_tiers: Optional[int],
    date_debut: Optional[date],
    date_fin: Optional[date],
    echeance_debut: Optional[date],
    echeance_fin: Optional[date],
    overdue_only: bool,
    recherche: Optional[str],
    sort_by: str,
    sort_order: str,
    skip: int,
    limit: int,
) -> FinancialCollectionRead:
    rows = query_financial_transactions(
        db,
        direction=direction,
        statut=statut,
        id_tiers=id_tiers,
        date_debut=date_debut,
        date_fin=date_fin,
        echeance_debut=echeance_debut,
        echeance_fin=echeance_fin,
        overdue_only=overdue_only,
        recherche=recherche,
        sort_by=sort_by,
        sort_order=sort_order,
        skip=skip,
        limit=limit,
    )
    serialized = [serialize_financial_transaction(row) for row in rows]
    summary = FinancialSummary(
        **summarize_financial_transactions(
            db,
            direction=direction,
            statut=statut,
            id_tiers=id_tiers,
            date_debut=date_debut,
            date_fin=date_fin,
            echeance_debut=echeance_debut,
            echeance_fin=echeance_fin,
            overdue_only=overdue_only,
            recherche=recherche,
        )
    )
    return FinancialCollectionRead(items=serialized, summary=summary, skip=skip, limit=limit)


@router.get("/creances", response_model=FinancialCollectionRead)
def get_creances(
    statut: Optional[str] = None,
    id_client: Optional[int] = None,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    echeance_debut: Optional[date] = None,
    echeance_fin: Optional[date] = None,
    overdue_only: bool = Query(False),
    recherche: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort_by: str = Query("date_echeance", pattern="^(date_echeance|date_transaction|montant_total|montant_restant)$"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    return _collection(db, direction="receivable", statut=statut, id_tiers=id_client, date_debut=date_debut,
                       date_fin=date_fin, echeance_debut=echeance_debut, echeance_fin=echeance_fin,
                       overdue_only=overdue_only, recherche=recherche, sort_by=sort_by, sort_order=sort_order,
                       skip=skip, limit=limit)


@router.get("/dettes", response_model=FinancialCollectionRead)
def get_dettes(
    statut: Optional[str] = None,
    id_fournisseur: Optional[int] = None,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    echeance_debut: Optional[date] = None,
    echeance_fin: Optional[date] = None,
    overdue_only: bool = Query(False),
    recherche: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort_by: str = Query("date_echeance", pattern="^(date_echeance|date_transaction|montant_total|montant_restant)$"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    return _collection(db, direction="payable", statut=statut, id_tiers=id_fournisseur, date_debut=date_debut,
                       date_fin=date_fin, echeance_debut=echeance_debut, echeance_fin=echeance_fin,
                       overdue_only=overdue_only, recherche=recherche, sort_by=sort_by, sort_order=sort_order,
                       skip=skip, limit=limit)


@router.get("/{id}/payment-summary", response_model=StatutPaiementTransaction)
def get_payment_summary(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    return StatutPaiementTransaction(
        id_transaction=transaction.id_transaction,
        montant_total=transaction.montant_total,
        montant_paye=transaction.montant_paye,
        montant_restant=transaction.montant_restant,
        pourcentage_paye=transaction.pourcentage_paye,
        statut_paiement=payment_status(transaction),
        est_en_retard=payment_status(transaction) == "en_retard",
        nombre_paiements=len(transaction.paiements),
    )
