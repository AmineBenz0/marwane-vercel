"""Phase 1 executable business contract; no database or route is modified."""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.services.deferred_cancellation_contract import (
    CancellationContractError,
    quote_unfulfilled_cancellation,
)


def quote(**changes):
    base = dict(
        original_quantity=1000,
        covered_quantity=600,
        delivered_quantity=600,
        previously_canceled=0,
        cancel_quantity=400,
        original_amount=Decimal("1500.00"),
        effective_payments=Decimal("0.00"),
        transaction_date=date(2026, 10, 25),
        effective_date=date(2026, 11, 11),
        row_version=3,
        expected_version=3,
        expected_pending=400,
    )
    base.update(changes)
    return quote_unfulfilled_cancellation(**base)


@pytest.mark.parametrize(
    ("paid", "remaining", "amount_due", "credit"),
    [
        ("0.00", "900.00", "900.00", "0.00"),
        ("750.00", "150.00", "150.00", "0.00"),
        ("900.00", "0.00", "0.00", "0.00"),
        ("1500.00", "-600.00", "0.00", "600.00"),
    ],
)
def test_paid_unpaid_and_partially_paid_sale(paid, remaining, amount_due, credit):
    result = quote(effective_payments=Decimal(paid))
    assert result.adjustment_now == Decimal("600.00")
    assert result.net_amount == Decimal("900.00")
    assert result.remaining_balance == Decimal(remaining)
    assert result.amount_due == Decimal(amount_due)
    assert result.customer_credit == Decimal(credit)
    assert result.pending_after == 0


def test_partial_cancellation_preserves_remaining_stock_obligation():
    first = quote(cancel_quantity=100)
    assert (first.canceled_total, first.pending_after) == (100, 300)
    assert first.adjustment_now == Decimal("150.00")
    assert first.net_amount == Decimal("1350.00")
    second = quote(
        previously_canceled=100, cancel_quantity=300,
        expected_pending=300, row_version=4, expected_version=4,
    )
    assert (second.adjustment_now, second.adjustments_total) == (
        Decimal("450.00"), Decimal("600.00"),
    )
    assert second.net_amount == Decimal("900.00")


def test_discounted_custom_sale_uses_original_total_not_displayed_unit_price():
    result = quote(original_amount=Decimal("1200.00"))
    assert (result.adjustment_now, result.net_amount) == (
        Decimal("480.00"), Decimal("720.00"),
    )


def test_fractional_cent_rounding_is_cumulative_and_full_cancellation_zeroes_net():
    first = quote(
        original_quantity=3, covered_quantity=0, delivered_quantity=0,
        original_amount=Decimal("0.05"), cancel_quantity=1, expected_pending=3,
    )
    second = quote(
        original_quantity=3, covered_quantity=0, delivered_quantity=0,
        original_amount=Decimal("0.05"), cancel_quantity=1, previously_canceled=1,
        expected_pending=2, row_version=4, expected_version=4,
    )
    third = quote(
        original_quantity=3, covered_quantity=0, delivered_quantity=0,
        original_amount=Decimal("0.05"), cancel_quantity=1, previously_canceled=2,
        expected_pending=1, row_version=5, expected_version=5,
    )
    assert [first.adjustment_now, second.adjustment_now, third.adjustment_now] == [
        Decimal("0.02"), Decimal("0.01"), Decimal("0.02"),
    ]
    assert third.adjustments_total == Decimal("0.05")
    assert third.net_amount == Decimal("0.00")


def test_full_cancel_of_undelivered_sale_keeps_original_sale_amount():
    result = quote(
        covered_quantity=0, delivered_quantity=0, expected_pending=1000,
        cancel_quantity=1000, effective_payments=Decimal("1500.00"),
    )
    assert result.original_amount == Decimal("1500.00")
    assert result.adjustment_now == Decimal("1500.00")
    assert result.net_amount == Decimal("0.00")
    assert result.remaining_balance == Decimal("-1500.00")
    assert result.customer_credit == Decimal("1500.00")


def test_refund_is_separate_and_effective_payments_are_signed_net_settlements():
    before = quote(effective_payments=Decimal("1500.00"))
    after_refund = quote(effective_payments=Decimal("900.00"))
    assert before.customer_credit == Decimal("600.00")
    assert after_refund.customer_credit == Decimal("0.00")
    assert after_refund.remaining_balance == Decimal("0.00")
    assert before.adjustment_now == after_refund.adjustment_now


@pytest.mark.parametrize(
    "bad_change",
    [
        {"expected_version": 2},
        {"expected_pending": 399},
        {"cancel_quantity": 401},
        {"cancel_quantity": 0},
        {"cancel_quantity": -1},
        {"original_quantity": 0},
        {"original_quantity": 599},
        {"covered_quantity": 1001},
        {"delivered_quantity": 601},
        {"delivered_quantity": 599},
        {"previously_canceled": 401},
        {"original_amount": Decimal("0.00")},
        {"original_amount": Decimal("1500.001")},
        {"effective_payments": Decimal("-0.01")},
        {"effective_payments": Decimal("NaN")},
        {"effective_date": date(2026, 10, 24)},
        {"row_version": True},
        {"cancel_quantity": 1.0},
    ],
)
def test_invalid_cancellation_contract_rejected(bad_change):
    with pytest.raises(CancellationContractError):
        quote(**bad_change)


def test_retry_from_outdated_sale_snapshot_cannot_cancel_again():
    accepted = quote()
    assert accepted.canceled_total == 400
    # Phase 4 must return the recorded result for identical operation-id replay;
    # a fresh or stale attempt must never issue a second credit note.
    with pytest.raises(CancellationContractError):
        quote(previously_canceled=400, expected_pending=0, row_version=4,
              expected_version=3, cancel_quantity=400)
    with pytest.raises(CancellationContractError):
        quote(previously_canceled=400, expected_pending=0, row_version=4,
              expected_version=4, cancel_quantity=400)


def test_quote_is_deterministic_and_does_not_change_original_snapshot():
    original = dict(
        original_amount=Decimal("1123.45"), effective_payments=Decimal("800.00"),
        cancel_quantity=127,
    )
    copy = original.copy()
    first = quote(**original)
    second = quote(**original)
    assert first == second
    assert original == copy
    assert first.adjustment_now + first.net_amount == first.original_amount


def test_only_effective_date_changes_historical_interpretation_not_original_sale():
    present = quote()
    later = quote(effective_date=date(2026, 12, 1))
    assert present.net_amount == later.net_amount
    assert present.adjustment_now == later.adjustment_now
    # Historical cutoffs are implemented with dated ledger entries in Phase 3.


def test_exactly_fulfilled_sale_has_no_cancellable_remainder():
    with pytest.raises(CancellationContractError):
        quote(covered_quantity=1000, delivered_quantity=1000, expected_pending=0)
