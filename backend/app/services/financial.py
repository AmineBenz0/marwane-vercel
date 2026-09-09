"""Shared financial projections for receivables and payables.

The transaction model exposes payment projections as Python properties because
they are also used by the rest of the application.  Collection endpoints,
however, must not load the entire ledger just to calculate a page.  This
module therefore keeps the same effective-payment predicate in SQL for
filtering, sorting, pagination, and summaries, and uses the model properties
only when serializing the small page that was requested.
"""

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, literal, or_
from sqlalchemy.orm import Session, selectinload

from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.produit import Produit
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


def validate_payment_date(transaction: Transaction, payment_date: date) -> None:
    """Reject a payment posted before the transaction it settles."""
    if payment_date < transaction.date_transaction:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date du paiement ne peut pas être antérieure à la transaction",
        )


def payment_status(transaction: Transaction, today: Optional[date] = None) -> str:
    """Return the canonical payment status, including the overdue state."""
    status = transaction.statut_paiement
    if today is None:
        today = business_date()
    if status not in {"paye", "surpaye"} and transaction.date_echeance and transaction.date_echeance < today:
        return "en_retard"
    return status


def payment_total_as_of(transaction: Transaction, as_of: date) -> Decimal:
    """Return effective payments posted on or before an accounting date."""
    return sum(
        (
            Decimal(str(payment.montant))
            for payment in transaction.paiements
            if payment.date_paiement <= as_of and payment.est_effectif
        ),
        Decimal("0"),
    )


def remaining_amount_as_of(transaction: Transaction, as_of: date) -> Decimal:
    """Return the transaction balance at a historical accounting date."""
    return Decimal(str(transaction.montant_total)) - payment_total_as_of(transaction, as_of)


def _effective_payment_predicate():
    """Return the canonical SQL predicate for payments affecting balances."""
    return and_(
        Paiement.statut == "valide",
        or_(Paiement.type_paiement != "cheque", Paiement.statut_cheque == "encaisse"),
    )


def _payment_totals_subquery(db: Session):
    """Aggregate effective payments once so collection queries stay set-based."""
    return (
        db.query(
            Paiement.id_transaction.label("id_transaction"),
            func.sum(Paiement.montant).label("montant_paye"),
        )
        .filter(_effective_payment_predicate())
        .group_by(Paiement.id_transaction)
        .subquery("effective_payment_totals")
    )


def _payment_expressions(payment_totals, today: date):
    """Build SQL expressions matching Transaction's payment properties."""
    paid = func.coalesce(payment_totals.c.montant_paye, literal(Decimal("0")))
    remaining = Transaction.montant_total - paid
    raw_status = case(
        (paid > Transaction.montant_total + literal(Decimal("0.01")), literal("surpaye")),
        (paid >= Transaction.montant_total - literal(Decimal("0.01")), literal("paye")),
        (paid == literal(Decimal("0")), literal("impaye")),
        else_=literal("partiel"),
    )
    canonical_status = case(
        (
            and_(
                raw_status.notin_(["paye", "surpaye"]),
                Transaction.date_echeance.isnot(None),
                Transaction.date_echeance < today,
            ),
            literal("en_retard"),
        ),
        else_=raw_status,
    )
    return paid, remaining, canonical_status


def _apply_collection_filters(
    query,
    *,
    direction: str,
    id_tiers: Optional[int],
    date_debut: Optional[date],
    date_fin: Optional[date],
    echeance_debut: Optional[date],
    echeance_fin: Optional[date],
    recherche: Optional[str],
):
    """Apply shared collection filters to either a page or summary query."""
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

    search = recherche.strip() if recherche else ""
    if search:
        term = f"%{search}%"
        query = query.join(Transaction.produit).outerjoin(Transaction.client).outerjoin(Transaction.fournisseur).filter(
            (Produit.nom_produit.ilike(term))
            | (Client.nom_client.ilike(term))
            | (Fournisseur.nom_fournisseur.ilike(term))
        )
    return query


def _validate_collection_sort(sort_by: str, sort_order: str) -> None:
    if sort_by not in {"date_echeance", "date_transaction", "montant_total", "montant_restant"}:
        raise ValueError("sort_by invalide")
    if sort_order not in {"asc", "desc"}:
        raise ValueError("sort_order invalide")


def _order_collection_query(query, *, sort_by: str, sort_order: str, remaining):
    """Apply deterministic ordering, including a stable primary-key tie-breaker."""
    descending = sort_order == "desc"
    if sort_by == "montant_restant":
        primary = remaining
    else:
        primary = getattr(Transaction, sort_by)

    if descending:
        primary = primary.desc()
        if sort_by == "date_echeance":
            primary = primary.nullslast()
        tie_breaker = Transaction.id_transaction.desc()
    else:
        primary = primary.asc()
        if sort_by == "date_echeance":
            # Preserve the existing API behavior: transactions without a due
            # date sort before dated transactions in ascending order.
            primary = primary.nullsfirst()
        tie_breaker = Transaction.id_transaction.asc()
    return query.order_by(primary, tie_breaker)


def _collection_query_components(
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
    today: Optional[date] = None,
):
    """Build the set-based query and expressions shared by page and summary."""
    effective_totals = _payment_totals_subquery(db)
    paid, remaining, canonical_status = _payment_expressions(
        effective_totals,
        today or business_date(),
    )
    query = db.query(Transaction).outerjoin(
        effective_totals,
        effective_totals.c.id_transaction == Transaction.id_transaction,
    ).filter(Transaction.est_actif.is_(True))
    query = _apply_collection_filters(
        query,
        direction=direction,
        id_tiers=id_tiers,
        date_debut=date_debut,
        date_fin=date_fin,
        echeance_debut=echeance_debut,
        echeance_fin=echeance_fin,
        recherche=recherche,
    )
    if overdue_only:
        query = query.filter(canonical_status == "en_retard")
    if statut:
        query = query.filter(canonical_status == statut.lower())
    return query, paid, remaining, canonical_status


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
    skip: Optional[int] = None,
    limit: Optional[int] = None,
    today: Optional[date] = None,
):
    """Return transactions using database-side filters, ordering, and paging."""
    _validate_collection_sort(sort_by, sort_order)
    query, _, remaining, _ = _collection_query_components(
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
        today=today,
    )
    query = _order_collection_query(query, sort_by=sort_by, sort_order=sort_order, remaining=remaining)
    if skip is not None:
        query = query.offset(skip)
    if limit is not None:
        query = query.limit(limit)
    return query.options(
        selectinload(Transaction.paiements),
        selectinload(Transaction.client),
        selectinload(Transaction.fournisseur),
        selectinload(Transaction.produit),
    ).all()


def summarize_financial_transactions(
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
    today: Optional[date] = None,
) -> dict:
    """Calculate collection totals in SQL without materializing all rows."""
    query, paid, remaining, canonical_status = _collection_query_components(
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
        today=today,
    )
    summary = query.with_entities(
        func.coalesce(func.sum(Transaction.montant_total), literal(Decimal("0"))).label("total"),
        func.coalesce(func.sum(paid), literal(Decimal("0"))).label("paye"),
        func.coalesce(func.sum(remaining), literal(Decimal("0"))).label("reste"),
        func.count(Transaction.id_transaction).label("count"),
        func.coalesce(
            func.sum(case((canonical_status == "en_retard", 1), else_=0)),
            0,
        ).label("overdue_count"),
    ).one()
    return {
        "total": Decimal(str(summary.total or 0)),
        "paye": Decimal(str(summary.paye or 0)),
        "reste": Decimal(str(summary.reste or 0)),
        "count": int(summary.count or 0),
        "overdue_count": int(summary.overdue_count or 0),
    }


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
