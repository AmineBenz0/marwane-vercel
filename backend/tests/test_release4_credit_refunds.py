"""Release 4 Phase 5: credits remain commercial until explicitly settled.

Full financial tests exercise the Phase 4 writer, actual payment/movement
records, the existing refund and historical-credit services. Nothing is
published to production by these tests.
"""
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.caisse import Caisse
from app.models.credit import Avance, AffectationCredit
from app.models.correction_operation import CorrectionOperation
from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.credit import AdvanceCommand, AllocateCommand
from app.schemas.refund import RefundCommand, RefundApplyCommand
from app.schemas.transaction import DeferredSaleRemainderClose
from app.schemas.transaction_payment import TransactionPaymentBatchCreate
from app.routers.transactions import create_transactions_with_payments_batch
from app.services.credit_balances import advance_balances
from app.services.credits import (
    apply_credit, party_credit_history, preview_credit,
    refundable_cash_capacity, settlement_capacity,
)
from app.services.deferred_cancellation import cancel_deferred_sale_remainder
from app.services.financial import contact_balances
from app.services.refunds import apply_refund, preview_refund
from app.utils.business_date import business_date
from tests.test_deferred_sale_completion import deferred_sale


@pytest.fixture
def canceled_paid_sale(db_session, deferred_sale, test_user):
    """A real 600-delivered/400-pending fully paid deferred sale."""
    _, _, _, original = deferred_sale
    batch = TransactionPaymentBatchCreate(items=[{
        "client_ref": "release4-phase5",
        "transaction": original.model_dump(),
        "paiements": [{
            "date_paiement": original.date_transaction,
            "montant": "1500.00",
            "type_paiement": "cash",
        }],
    }])
    tx = create_transactions_with_payments_batch(batch, db_session, test_user)[0]["transaction"]
    assert tx.quantite_couverte == 600
    assert tx.quantite_en_attente == 400
    assert len(tx.paiements) == 1
    assert db_session.query(Caisse).filter_by(statut="active").count() == 1

    receipt = cancel_deferred_sale_remainder(
        db_session,
        transaction_id=tx.id_transaction,
        payload=DeferredSaleRemainderClose(
            operation_id=uuid4(),
            expected_version=tx.row_version,
            quantite_en_attente_attendue=400,
        ),
        actor=test_user,
    )
    db_session.commit()
    db_session.expire_all()
    tx = db_session.get(Transaction, tx.id_transaction)
    assert receipt["montant_avoir"] == "600.00"
    assert tx.montant_net == Decimal("900.00")
    return tx


def refund_command(tx, *, amount="600.00", day=None):
    return RefundCommand(
        operation_id=uuid4(),
        id_transaction=tx.id_transaction,
        date_paiement=day or business_date(),
        montant=Decimal(amount),
        type_paiement="cash",
        reason="Remboursement explicite du trop-perçu après avoir commercial",
    )


def ready(db, command):
    preview = preview_refund(db, command)
    return RefundApplyCommand(
        **command.model_dump(),
        dependency_fingerprint=preview["dependency_fingerprint"],
    )


def test_phase5_avoir_is_not_cash_and_refund_requires_explicit_settlement(
    db_session, canceled_paid_sale, test_user,
):
    tx = canceled_paid_sale
    payment = tx.paiements[0]
    cash_before = db_session.query(Caisse).filter_by(statut="active").count()
    assert tx.montant_total == Decimal("1500.00")
    assert tx.montant_avoir == Decimal("600.00")
    assert tx.montant_net == Decimal("900.00")
    assert tx.montant_paye == Decimal("1500.00")
    assert tx.montant_restant == Decimal("-600.00")
    assert db_session.query(Avance).count() == 0
    assert cash_before == 1

    # No new movement, payment, bank transfer or advance was created by
    # the commercial adjustment itself.
    assert db_session.query(Paiement).count() == 1
    assert db_session.query(DeferredSaleAdjustment).count() == 1
    command = refund_command(tx)
    quote = preview_refund(db_session, command)
    assert quote["available_credit"] == "600.00"
    assert quote["montant_initial"] == "1500.00"
    assert quote["montant_avoirs"] == "600.00"
    assert quote["montant_net"] == "900.00"
    assert quote["credit_after"] == "0.00"
    assert db_session.query(Caisse).filter_by(statut="active").count() == cash_before

    approved = ready(db_session, command)
    result = apply_refund(db_session, approved, test_user)
    assert result["replayed"] is False
    assert result["record"]["nature"] == "remboursement"
    assert result["credit_after"] == "0.00"
    db_session.expire_all()
    tx = db_session.get(Transaction, tx.id_transaction)
    assert tx.montant_total == Decimal("1500.00")
    assert tx.montant_avoir == Decimal("600.00")
    assert tx.montant_net == Decimal("900.00")
    assert tx.montant_paye == Decimal("900.00")
    assert tx.montant_restant == Decimal("0.00")
    assert payment.montant == Decimal("1500.00") and payment.statut == "valide"
    assert db_session.query(Caisse).filter_by(statut="active").count() == cash_before + 1
    assert db_session.query(Avance).count() == 0

    # Lost-response retry keeps the original signed approval and UUID; a new
    # preview after a fully settled refund is correctly no longer possible.
    replay = apply_refund(db_session, approved, test_user)
    assert replay["replayed"] is True and replay["record"] == result["record"]
    assert db_session.query(Paiement).count() == 2
    assert db_session.query(Caisse).filter_by(statut="active").count() == cash_before + 1
    with pytest.raises(HTTPException) as exc:
        preview_refund(db_session, refund_command(tx, amount="0.01"))
    assert exc.value.status_code == 409
    assert db_session.query(DeferredSaleAdjustment).count() == 1


def test_phase5_commercial_credit_not_available_before_avoir_date(
    db_session, canceled_paid_sale,
):
    tx = canceled_paid_sale
    prior_day = business_date() - timedelta(days=1)
    assert settlement_capacity(tx, prior_day, credit=True) == Decimal("0.00")
    assert refundable_cash_capacity(tx, prior_day) == Decimal("0.00")
    with pytest.raises(HTTPException) as exc:
        preview_refund(db_session, refund_command(tx, amount="0.01", day=prior_day))
    assert exc.value.status_code == 409
    assert refundable_cash_capacity(tx, business_date()) == Decimal("600.00")


def test_phase5_existing_credit_transfer_and_refund_share_one_capacity(
    db_session, canceled_paid_sale, test_user,
):
    tx = canceled_paid_sale
    target = Transaction(
        date_transaction=business_date(),
        id_client=tx.id_client,
        id_produit=tx.id_produit,
        quantite=1000,
        prix_unitaire=Decimal("1.00"),
        montant_total=Decimal("1000.00"),
        est_actif=True,
    )
    db_session.add(target)
    db_session.commit()
    balance_before = contact_balances(
        db_session, direction="receivable", contact_ids=[tx.id_client],
    )[tx.id_client]
    cash_before = db_session.query(Caisse).count()
    transfer = AllocateCommand(
        operation_id=uuid4(),
        action="allocate",
        id_transaction_source=tx.id_transaction,
        id_transaction_cible=target.id_transaction,
        montant=Decimal("400.00"),
        date_effet=business_date(),
        reason="Affectation historique du crédit déjà perçu",
    )
    preview = preview_credit(db_session, transfer)
    apply_credit(db_session, transfer, preview["dependency_fingerprint"], test_user)
    db_session.expire_all()
    tx = db_session.get(Transaction, tx.id_transaction)
    assert tx.montant_restant == Decimal("-200.00")
    assert db_session.query(AffectationCredit).count() == 1
    assert db_session.query(Caisse).count() == cash_before
    assert contact_balances(
        db_session, direction="receivable", contact_ids=[tx.id_client],
    )[tx.id_client] == balance_before

    with pytest.raises(HTTPException) as exc:
        preview_refund(db_session, refund_command(tx, amount="201.00"))
    assert exc.value.status_code == 409
    valid = refund_command(tx, amount="200.00")
    apply_refund(db_session, ready(db_session, valid), test_user)
    db_session.expire_all()
    tx = db_session.get(Transaction, tx.id_transaction)
    assert tx.montant_restant == Decimal("0.00")
    with pytest.raises(HTTPException):
        preview_credit(db_session, AllocateCommand(
            operation_id=uuid4(), action="allocate",
            id_transaction_source=tx.id_transaction,
            id_transaction_cible=target.id_transaction,
            montant=Decimal("0.01"), date_effet=business_date(),
            reason="Deuxième réutilisation non autorisée",
        ))


def test_phase5_existing_advances_stay_separate_from_avoir_balance(
    db_session, canceled_paid_sale, test_user,
):
    tx = canceled_paid_sale
    advance = AdvanceCommand(
        operation_id=uuid4(), action="advance",
        id_client=tx.id_client, montant=Decimal("50.00"),
        date_effet=business_date(), type_paiement="cash",
        reason="Avance distincte du trop-perçu commercial",
    )
    plan = preview_credit(db_session, advance)
    apply_credit(db_session, advance, plan["dependency_fingerprint"], test_user)
    summary = party_credit_history(db_session, id_client=tx.id_client)
    assert Decimal(summary["available"]) == Decimal("50.00")
    assert Decimal(summary["trop_percu_transactions"]) == Decimal("600.00")
    assert Decimal(summary["montant_avoirs_commerciaux"]) == Decimal("600.00")
    assert len(summary["avoirs_commerciaux"]) == 1
    assert summary["avoirs_commerciaux"][0]["montant_net"] == "900.00"
    assert summary["avoirs_commerciaux"][0]["solde_crediteur"] == "600.00"
    assert advance_balances(
        db_session, direction="receivable", contact_ids=[tx.id_client],
    )[tx.id_client] == Decimal("50.00")
    assert db_session.query(Avance).count() == 1
    assert db_session.query(DeferredSaleAdjustment).count() == 1


def test_phase5_credit_capacity_uses_future_adjustments_to_protect_debt(
    db_session, canceled_paid_sale,
):
    tx = canceled_paid_sale
    # The sale was originally 1500 MAD; an 600 MAD avoir posts today.
    # Before cancellation, accepting a new historic advance of 1000 MAD
    # would over-allocate the final corrected debt of only 900 MAD.
    assert settlement_capacity(tx, business_date() - timedelta(days=1), credit=False) == Decimal("0.00")
    # Already fully paid: there is no outstanding debt to allocate.
    assert settlement_capacity(tx, business_date(), credit=False) == Decimal("0.00")


def test_phase5_refund_cash_provenance_rejects_lc_and_compensation_only():
    """A credit note is not a bank deposit; instrument-backed credit is separate."""
    from app.models.deferred_sale_adjustment import DeferredSaleAdjustment

    def payment(amount, method, *, nature="paiement", cheque_status=None, settled=None):
        return Paiement(
            date_paiement=business_date() - timedelta(days=1),
            montant=Decimal(amount), nature=nature,
            type_paiement=method, statut="valide",
            statut_cheque=cheque_status,
            date_encaissement_effective=settled,
        )
    tx = Transaction(
        id_client=1, id_produit=1, date_transaction=business_date() - timedelta(days=2),
        quantite=1000, prix_unitaire=Decimal("1.50"), montant_total=Decimal("1500.00"),
        est_promesse=True, allocation_automatique=True,
    )
    tx.avoirs_livraison_differee = [
        DeferredSaleAdjustment(
            date_effet=business_date(), montant_avoir=Decimal("600.00"),
        )
    ]
    tx.paiements = [payment("1500.00", "lc")]
    assert tx.montant_restant == Decimal("-600.00")
    assert settlement_capacity(tx, business_date()) == Decimal("600.00")
    assert refundable_cash_capacity(tx, business_date()) == Decimal("0.00")

    tx.paiements = [
        payment("900.00", "lc"),
        payment("600.00", "cash"),
    ]
    assert refundable_cash_capacity(tx, business_date()) == Decimal("600.00")
    tx.paiements = [
        payment("900.00", "lc"),
        payment("600.00", "compensation", nature="credit_recu"),
    ]
    assert refundable_cash_capacity(tx, business_date()) == Decimal("0.00")
    tx.paiements = [
        payment("900.00", "lc"),
        payment("600.00", "cheque", cheque_status="emis"),
    ]
    assert refundable_cash_capacity(tx, business_date()) == Decimal("0.00")
    tx.paiements[-1].statut_cheque = "encaisse"
    tx.paiements[-1].date_encaissement_effective = business_date() + timedelta(days=1)
    assert refundable_cash_capacity(tx, business_date()) == Decimal("0.00")
    assert refundable_cash_capacity(tx, business_date() + timedelta(days=1)) == Decimal("600.00")


def test_phase5_refund_preview_invalidated_by_committed_commercial_adjustment(
    db_session, canceled_paid_sale, test_user,
):
    tx = canceled_paid_sale
    draft = refund_command(tx, amount="100.00")
    accepted_preview = preview_refund(db_session, draft)
    # A new audited transaction movement or cash payment invalidates the
    # earlier dependency fingerprint before any outgoing money is written.
    tx.paiements[0].notes = "Référence bancaire réconciliée après aperçu"
    db_session.commit()
    with pytest.raises(HTTPException) as exc:
        apply_refund(db_session, RefundApplyCommand(
            **draft.model_dump(),
            dependency_fingerprint=accepted_preview["dependency_fingerprint"],
        ), test_user)
    assert exc.value.status_code == 409
    assert db_session.query(Paiement).filter_by(nature="remboursement").count() == 0
