"""Period-based commercial activity for reports and client analytics.

A sale is booked on its original transaction date; each immutable commercial
avoir is booked on its own effective date. Never duplicate a credit across
periods and never subtract a cash refund from net sales a second time.
"""
from decimal import Decimal
from sqlalchemy import extract, func
from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
from app.models.transaction import Transaction


ZERO = Decimal("0.00")


def period_commercial_adjustments(db, date_start, date_end, *, client_id=None):
    """Grouped per customer/product to avoid a payments x avoirs JOIN fanout."""
    query = db.query(
        DeferredSaleAdjustment.id_client.label("client_id"),
        Transaction.id_produit.label("product_id"),
        func.sum(DeferredSaleAdjustment.montant_avoir).label("amount"),
    ).join(
        Transaction, Transaction.id_transaction == DeferredSaleAdjustment.id_transaction,
    ).filter(
        Transaction.est_actif.is_(True),
        DeferredSaleAdjustment.date_effet.between(date_start, date_end),
    )
    if client_id is not None:
        query = query.filter(DeferredSaleAdjustment.id_client == client_id)
    rows = query.group_by(
        DeferredSaleAdjustment.id_client, Transaction.id_produit,
    ).all()
    return [
        (row.client_id, row.product_id, Decimal(str(row.amount)))
        for row in rows
    ]


def sum_period_adjustments(rows):
    return sum((row[2] for row in rows), ZERO)


def monthly_client_sales(db, client_id, date_start, date_end):
    """Gross origination and credit-note issuance are independent dated events."""
    gross, count = db.query(
        func.coalesce(func.sum(Transaction.montant_total), 0),
        func.count(Transaction.id_transaction),
    ).filter(
        Transaction.id_client == client_id,
        Transaction.est_actif.is_(True),
        Transaction.date_transaction.between(date_start, date_end),
    ).one()
    adjustments = sum_period_adjustments(
        period_commercial_adjustments(db, date_start, date_end, client_id=client_id),
    )
    gross = Decimal(str(gross))
    return {
        "montant_brut": gross,
        "montant_avoirs": adjustments,
        "montant": gross - adjustments,
        "nb_transactions": int(count),
    }


def monthly_client_activity(db, client_id, date_start, date_end):
    """Return all requested months with TWO grouped queries, not 2N requests.

    Preserve the accounting date of original sale and issued credit. The
    grouped credit query joins each adjustment to one active parent sale,
    never to installments or other adjustments.
    """
    year_sale = extract("year", Transaction.date_transaction)
    month_sale = extract("month", Transaction.date_transaction)
    sales = db.query(
        year_sale.label("year"), month_sale.label("month"),
        func.coalesce(func.sum(Transaction.montant_total), 0).label("gross"),
        func.count(Transaction.id_transaction).label("count"),
    ).filter(
        Transaction.id_client == client_id,
        Transaction.est_actif.is_(True),
        Transaction.date_transaction.between(date_start, date_end),
    ).group_by(year_sale, month_sale).all()

    year_credit = extract("year", DeferredSaleAdjustment.date_effet)
    month_credit = extract("month", DeferredSaleAdjustment.date_effet)
    credits = db.query(
        year_credit.label("year"), month_credit.label("month"),
        func.sum(DeferredSaleAdjustment.montant_avoir).label("credit"),
    ).join(
        Transaction, Transaction.id_transaction == DeferredSaleAdjustment.id_transaction,
    ).filter(
        DeferredSaleAdjustment.id_client == client_id,
        Transaction.est_actif.is_(True),
        DeferredSaleAdjustment.date_effet.between(date_start, date_end),
    ).group_by(year_credit, month_credit).all()

    result = {}
    for row in sales:
        key = f"{int(row.year)}-{int(row.month):02d}"
        result[key] = {
            "montant_brut": Decimal(str(row.gross)),
            "montant_avoirs": ZERO,
            "nb_transactions": int(row.count),
        }
    for row in credits:
        key = f"{int(row.year)}-{int(row.month):02d}"
        record = result.setdefault(key, {
            "montant_brut": ZERO, "montant_avoirs": ZERO,
            "nb_transactions": 0,
        })
        record["montant_avoirs"] += Decimal(str(row.credit))
    for record in result.values():
        record["montant"] = record["montant_brut"] - record["montant_avoirs"]
    return result
