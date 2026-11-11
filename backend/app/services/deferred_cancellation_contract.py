"""Pure Release 4 cancellation rules, without persistence or HTTP side effects.

Phase 1 only: do not register an endpoint or write credit/refund records here.
In the production allocation model, 'covered' must already be delivered; a
reserved-but-not-delivered quantity requires a different workflow.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")


class CancellationContractError(ValueError):
    """The requested cancellation is not valid for this sale snapshot."""


@dataclass(frozen=True)
class CancellationQuote:
    canceled_now: int
    canceled_total: int
    pending_after: int
    original_amount: Decimal
    adjustment_now: Decimal
    adjustments_total: Decimal
    net_amount: Decimal
    effective_payments: Decimal
    remaining_balance: Decimal
    amount_due: Decimal
    customer_credit: Decimal


def _money(value: Decimal, *, positive: bool = False) -> Decimal:
    if not isinstance(value, Decimal) or not value.is_finite():
        raise CancellationContractError("Les montants doivent être des décimaux finis.")
    if value < 0 or (positive and value <= 0):
        raise CancellationContractError("Montant invalide.")
    if value != value.quantize(CENT):
        raise CancellationContractError("Les montants doivent être exprimés au centime.")
    return value.quantize(CENT)


def _units(value: int, *, positive: bool = False) -> int:
    if type(value) is not int or value < 0 or (positive and value == 0):
        raise CancellationContractError("Quantité ou version invalide.")
    return value


def _cumulative_adjustment(original_amount: Decimal, ordered: int, canceled: int) -> Decimal:
    """Round a cumulative share, not each separate request, to avoid cent drift."""
    return (original_amount * Decimal(canceled) / Decimal(ordered)).quantize(
        CENT, rounding=ROUND_HALF_UP,
    )


def quote_unfulfilled_cancellation(
    *,
    original_quantity: int,
    covered_quantity: int,
    delivered_quantity: int,
    previously_canceled: int,
    cancel_quantity: int,
    original_amount: Decimal,
    effective_payments: Decimal,
    transaction_date: date,
    effective_date: date,
    row_version: int,
    expected_version: int,
    expected_pending: int,
) -> CancellationQuote:
    """Quote a proposed full-value cancellation of currently unallocated eggs.

    No payment/refund is created. A negative remaining_balance is credit owed
    to the customer, NOT an automatic bank/cash transfer or reusable advance.
    Persistence, operation-id replay and atomic stock/credit-note writes belong
    to Phases 2-5.
    """
    original_quantity = _units(original_quantity, positive=True)
    covered_quantity = _units(covered_quantity)
    delivered_quantity = _units(delivered_quantity)
    previously_canceled = _units(previously_canceled)
    cancel_quantity = _units(cancel_quantity, positive=True)
    expected_pending = _units(expected_pending)
    row_version = _units(row_version, positive=True)
    expected_version = _units(expected_version, positive=True)
    original_amount = _money(original_amount, positive=True)
    effective_payments = _money(effective_payments)

    if type(transaction_date) is not date or type(effective_date) is not date:
        raise CancellationContractError("Dates de comptabilisation invalides.")
    if effective_date < transaction_date:
        raise CancellationContractError("L'avoir ne peut pas précéder la vente.")
    if covered_quantity > original_quantity or delivered_quantity > covered_quantity:
        raise CancellationContractError("Quantités couvertes ou livrées incohérentes.")
    if covered_quantity + previously_canceled > original_quantity:
        raise CancellationContractError("La somme livrée et annulée dépasse la vente.")
    if delivered_quantity != covered_quantity:
        raise CancellationContractError(
            "Des œufs réservés mais non livrés demandent un traitement distinct."
        )
    if row_version != expected_version:
        raise CancellationContractError("La version de la vente a changé.")
    pending = original_quantity - covered_quantity - previously_canceled
    if pending != expected_pending:
        raise CancellationContractError("La quantité restante a changé.")
    if cancel_quantity > pending:
        raise CancellationContractError("Impossible d'annuler des œufs déjà livrés ou annulés.")

    canceled_total = previously_canceled + cancel_quantity
    adjustments_total = _cumulative_adjustment(original_amount, original_quantity, canceled_total)
    adjustments_before = _cumulative_adjustment(original_amount, original_quantity, previously_canceled)
    adjustment_now = adjustments_total - adjustments_before
    net_amount = original_amount - adjustments_total
    remaining = net_amount - effective_payments
    return CancellationQuote(
        canceled_now=cancel_quantity,
        canceled_total=canceled_total,
        pending_after=pending - cancel_quantity,
        original_amount=original_amount,
        adjustment_now=adjustment_now,
        adjustments_total=adjustments_total,
        net_amount=net_amount,
        effective_payments=effective_payments,
        remaining_balance=remaining,
        amount_due=max(remaining, Decimal("0.00")),
        customer_credit=max(-remaining, Decimal("0.00")),
    )
