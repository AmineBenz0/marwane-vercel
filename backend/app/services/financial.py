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
from app.models.caisse import Caisse
from app.models.charge import Charge
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
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
        and (existing.source_reglement is None or (
            existing.id_compte == requested.id_compte
            and (requested.source_reglement is None or existing.source_reglement == requested.source_reglement)
        ))
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
            if _payment_date(payment) <= as_of and payment.est_effectif
        ),
        Decimal("0"),
    )


def remaining_amount_as_of(transaction: Transaction, as_of: date) -> Decimal:
    """Return the transaction balance at a historical accounting date."""
    return Decimal(str(transaction.montant_total)) - payment_total_as_of(transaction, as_of)


def _payment_date(payment: Paiement) -> date:
    """Use the settlement date for cleared checks and the posted date otherwise."""
    if payment.type_paiement == "cheque":
        return payment.date_encaissement_effective or payment.date_paiement
    return payment.date_paiement


def _effective_payment_date_expression():
    return case(
        (Paiement.type_paiement == "cheque", func.coalesce(Paiement.date_encaissement_effective, Paiement.date_paiement)),
        else_=Paiement.date_paiement,
    )


def _effective_payment_predicate():
    """Return the canonical SQL predicate for payments affecting balances."""
    return and_(
        Paiement.statut == "valide",
        or_(Paiement.type_paiement != "cheque", Paiement.statut_cheque == "encaisse"),
    )


def _payment_totals_subquery(db: Session, as_of: Optional[date] = None):
    """Aggregate effective payments once so collection queries stay set-based."""
    query = db.query(
        Paiement.id_transaction.label("id_transaction"),
        func.sum(Paiement.montant).label("montant_paye"),
    ).filter(_effective_payment_predicate())
    if as_of is not None:
        query = query.filter(_effective_payment_date_expression() <= as_of)
    return (
        query
        .group_by(Paiement.id_transaction)
        .subquery("effective_payment_totals")
    )


def contact_balances(
    db: Session, *, direction: str, contact_ids: list[int], as_of: Optional[date] = None,
) -> dict[int, Decimal]:
    """Return net balances for one contact page in a single aggregate query.

    IDs come from the already filtered/paginated contact list. A successful
    query confirms zero for contacts without active transactions. Failures
    propagate rather than returning misleading zero balances.
    """
    columns = {"receivable": Transaction.id_client, "payable": Transaction.id_fournisseur}
    if direction not in columns:
        raise ValueError("direction invalide")
    if not contact_ids:
        return {}

    contact_id = columns[direction]
    payment_totals = _payment_totals_subquery(db, as_of)
    paid = func.coalesce(payment_totals.c.montant_paye, literal(Decimal("0")))
    query = (
        db.query(
            contact_id.label("contact_id"),
            func.sum(Transaction.montant_total - paid).label("balance"),
        )
        .outerjoin(payment_totals, payment_totals.c.id_transaction == Transaction.id_transaction)
        .filter(Transaction.est_actif.is_(True), contact_id.in_(contact_ids))
    )
    if as_of is not None:
        query = query.filter(Transaction.date_transaction <= as_of)
    rows = query.group_by(contact_id).all()
    balances = dict.fromkeys(contact_ids, Decimal("0"))
    balances.update({row.contact_id: Decimal(str(row.balance)) for row in rows})
    return balances


def financial_position_as_of(db: Session, as_of: date) -> dict[str, Decimal]:
    """Return receivables and payables from active transactions at a date.

    All payment methods share the same effective-payment predicate. Cleared
    checks count from their settlement date; only transactions and payments
    dated on or before the requested cutoff contribute.
    """
    payment_totals = _payment_totals_subquery(db, as_of)
    paid = func.coalesce(payment_totals.c.montant_paye, literal(Decimal("0")))
    rows = db.query(
        func.coalesce(func.sum(case(
            (Transaction.id_client.isnot(None), Transaction.montant_total - paid),
            else_=literal(Decimal("0")),
        )), literal(Decimal("0"))).label("receivables"),
        func.coalesce(func.sum(case(
            (Transaction.id_fournisseur.isnot(None), Transaction.montant_total - paid),
            else_=literal(Decimal("0")),
        )), literal(Decimal("0"))).label("payables"),
    ).outerjoin(
        payment_totals, payment_totals.c.id_transaction == Transaction.id_transaction,
    ).filter(
        Transaction.est_actif.is_(True), Transaction.date_transaction <= as_of,
    ).one()
    return {
        "receivables": Decimal(str(rows.receivables or 0)),
        "payables": Decimal(str(rows.payables or 0)),
    }


def cash_ledger_as_of(db: Session, as_of: date) -> dict[str, Decimal]:
    """Return cash movements through a date, excluding non-cash LC cessions.

    Cash has a zero opening balance in the current schema. Bank opening
    balances are represented by a single `initial` bank movement and are
    included by `bank_ledgers_as_of`; the stored balance is never added again.
    Historical snapshots are reference points and are not added to movements.
    """
    transaction_id = func.coalesce(Caisse.id_transaction, Paiement.id_transaction)
    query = db.query(
        func.coalesce(func.sum(case(
            (Caisse.type_mouvement == "ENTREE", Caisse.montant), else_=literal(Decimal("0")),
        )), literal(Decimal("0"))).label("inflows"),
        func.coalesce(func.sum(case(
            (Caisse.type_mouvement == "SORTIE", Caisse.montant), else_=literal(Decimal("0")),
        )), literal(Decimal("0"))).label("outflows"),
    ).outerjoin(
        Paiement, Paiement.id_paiement == Caisse.id_paiement,
    ).outerjoin(
        Transaction, Transaction.id_transaction == transaction_id,
    ).outerjoin(
        Charge, Charge.id_charge == Caisse.id_charge,
    ).filter(
        Caisse.statut == "active",
        Caisse.id_cession.is_(None),
        func.date(Caisse.date_mouvement) <= as_of,
        or_(transaction_id.is_(None), Transaction.est_actif.is_(True)),
        or_(
            Caisse.id_paiement.is_(None),
            and_(_effective_payment_predicate(), _effective_payment_date_expression() <= as_of),
        ),
        or_(Caisse.id_charge.is_(None), Charge.statut == "active"),
    ).one()
    inflows = Decimal(str(query.inflows or 0))
    outflows = Decimal(str(query.outflows or 0))
    return {"inflows": inflows, "outflows": outflows, "balance": inflows - outflows}


def bank_ledgers_as_of(db: Session, as_of: date) -> dict[int, Decimal]:
    """Return each account's opening balance plus valid bank movements once."""
    rows = db.query(
        MouvementBancaire.id_compte,
        func.sum(case(
            (MouvementBancaire.type_mouvement == "ENTREE", MouvementBancaire.montant),
            else_=-MouvementBancaire.montant,
        )).label("balance"),
    ).outerjoin(
        Paiement, Paiement.id_paiement == MouvementBancaire.id_paiement,
    ).outerjoin(
        Transaction, Transaction.id_transaction == Paiement.id_transaction,
    ).outerjoin(
        Charge, Charge.id_charge == MouvementBancaire.id_charge,
    ).filter(
        MouvementBancaire.statut == "active",
        func.date(MouvementBancaire.date_mouvement) <= as_of,
        or_(
            MouvementBancaire.id_paiement.is_(None),
            and_(_effective_payment_predicate(), _effective_payment_date_expression() <= as_of,
                 Transaction.est_actif.is_(True)),
        ),
        or_(MouvementBancaire.id_charge.is_(None), Charge.statut == "active"),
    ).group_by(MouvementBancaire.id_compte).all()
    balances = {account.id_compte: Decimal("0") for account in db.query(CompteBancaire.id_compte).all()}
    balances.update({row.id_compte: Decimal(str(row.balance or 0)) for row in rows})
    return balances


def bank_activity_as_of(db: Session, as_of: date) -> dict[str, Decimal]:
    """Return cumulative valid bank inflows/outflows through an explicit date."""
    rows = db.query(
        func.coalesce(func.sum(case(
            (MouvementBancaire.type_mouvement == "ENTREE", MouvementBancaire.montant),
            else_=literal(Decimal("0")),
        )), literal(Decimal("0"))).label("inflows"),
        func.coalesce(func.sum(case(
            (MouvementBancaire.type_mouvement == "SORTIE", MouvementBancaire.montant),
            else_=literal(Decimal("0")),
        )), literal(Decimal("0"))).label("outflows"),
    ).outerjoin(
        Paiement, Paiement.id_paiement == MouvementBancaire.id_paiement,
    ).outerjoin(
        Transaction, Transaction.id_transaction == Paiement.id_transaction,
    ).outerjoin(
        Charge, Charge.id_charge == MouvementBancaire.id_charge,
    ).filter(
        MouvementBancaire.statut == "active",
        func.date(MouvementBancaire.date_mouvement) <= as_of,
        or_(
            MouvementBancaire.id_paiement.is_(None),
            and_(_effective_payment_predicate(), _effective_payment_date_expression() <= as_of,
                 Transaction.est_actif.is_(True)),
        ),
        or_(MouvementBancaire.id_charge.is_(None), Charge.statut == "active"),
    ).one()
    return {
        "inflows": Decimal(str(rows.inflows or 0)),
        "outflows": Decimal(str(rows.outflows or 0)),
    }


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
