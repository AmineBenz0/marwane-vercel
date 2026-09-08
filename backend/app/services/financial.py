"""Shared financial projections for receivables and payables."""

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.transaction import Transaction
from app.utils.business_date import business_date


def validate_payment_idempotency(existing, requested) -> None:
    """Reject reuse of a payment key with a different financial identity."""
    same_identity = (
        existing.id_transaction == requested.id_transaction
        and existing.date_paiement == requested.date_paiement
        and Decimal(str(existing.montant)) == Decimal(str(requested.montant))
        and existing.type_paiement == requested.type_paiement.lower()
        and existing.id_lc == requested.id_lc
    )
    if not same_identity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La clé d'idempotence est déjà utilisée pour un autre paiement",
        )


def payment_status(transaction: Transaction, today: Optional[date] = None) -> str:
    """Return the canonical payment status, including the overdue state."""
    status = transaction.statut_paiement
    if today is None:
        today = business_date()
    if status not in {"paye", "surpaye"} and transaction.date_echeance and transaction.date_echeance < today:
        return "en_retard"
    return status


def query_financial_transactions(
    db: Session,
    *,
    direction: str,
    statut: Optional[str] = None,
    id_tiers: Optional[int] = None,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    echeance_debut: Optional[date] = None,
    echeance_fin: Optional[date] = None,
    overdue_only: bool = False,
    recherche: Optional[str] = None,
    sort_by: str = "date_echeance",
    sort_order: str = "asc",
):
    """Build the shared transaction query used by receivables and payables."""
    query = db.query(Transaction).options(
        joinedload(Transaction.paiements),
        joinedload(Transaction.client),
        joinedload(Transaction.fournisseur),
        joinedload(Transaction.produit),
    ).filter(Transaction.est_actif.is_(True))

    if direction == "receivable":
        query = query.filter(Transaction.id_client.isnot(None))
        if id_tiers is not None:
            query = query.filter(Transaction.id_client == id_tiers)
    else:
        query = query.filter(Transaction.id_fournisseur.isnot(None))
        if id_tiers is not None:
            query = query.filter(Transaction.id_fournisseur == id_tiers)

    if date_debut:
        query = query.filter(Transaction.date_transaction >= date_debut)
    if date_fin:
        query = query.filter(Transaction.date_transaction <= date_fin)
    if echeance_debut:
        query = query.filter(Transaction.date_echeance >= echeance_debut)
    if echeance_fin:
        query = query.filter(Transaction.date_echeance <= echeance_fin)
    if recherche:
        term = f"%{recherche.strip()}%"
        query = query.join(Transaction.produit).outerjoin(Transaction.client).outerjoin(Transaction.fournisseur).filter(
            (Transaction.produit.property.mapper.class_.nom_produit.ilike(term))
            | (Transaction.client.property.mapper.class_.nom_client.ilike(term))
            | (Transaction.fournisseur.property.mapper.class_.nom_fournisseur.ilike(term))
        )

    if sort_by not in {"date_echeance", "date_transaction", "montant_total", "montant_restant"}:
        raise ValueError("sort_by invalide")
    if sort_order not in {"asc", "desc"}:
        raise ValueError("sort_order invalide")

    rows = query.order_by(Transaction.date_echeance.asc().nullslast(), Transaction.date_transaction.desc()).all()
    today = business_date()
    if overdue_only:
        rows = [row for row in rows if payment_status(row, today) == "en_retard"]
    if statut:
        wanted = statut.lower()
        rows = [row for row in rows if payment_status(row, today) == wanted]
    if sort_by == "montant_restant":
        rows.sort(key=lambda row: row.montant_restant, reverse=sort_order == "desc")
    elif sort_by == "montant_total":
        rows.sort(key=lambda row: row.montant_total, reverse=sort_order == "desc")
    else:
        rows.sort(
            key=lambda row: getattr(row, sort_by) or date.min,
            reverse=sort_order == "desc",
        )
    return rows


def serialize_financial_transaction(transaction: Transaction, today: Optional[date] = None) -> dict:
    return {
        "id_transaction": transaction.id_transaction,
        "date_transaction": transaction.date_transaction,
        "date_echeance": transaction.date_echeance,
        "id_client": transaction.id_client,
        "id_fournisseur": transaction.id_fournisseur,
        "id_produit": transaction.id_produit,
        "client_nom": transaction.client.nom_client if transaction.client else None,
        "fournisseur_nom": transaction.fournisseur.nom_fournisseur if transaction.fournisseur else None,
        "produit_nom": transaction.produit.nom_produit if transaction.produit else None,
        "montant_total": transaction.montant_total,
        "montant_paye": transaction.montant_paye,
        "montant_restant": transaction.montant_restant,
        "statut_paiement": payment_status(transaction, today),
        "est_en_retard": payment_status(transaction, today) == "en_retard",
        "nombre_paiements": len(transaction.paiements),
        "date_creation": transaction.date_creation,
    }
