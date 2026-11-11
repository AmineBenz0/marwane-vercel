"""Release 4 Phase 3: SQL and Python financial projections must reconcile.

SQLite tests protect the shared arithmetic and API contracts. A separate
native PostgreSQL integration test checks the migrated production schema.
No cancellation route or mutating workflow is enabled in this phase.
"""
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models.client import Client
from app.models.correction_operation import CorrectionOperation
from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionRead
from app.services.financial import (
    commercial_credit_total_as_of,
    contact_balances,
    financial_position_as_of,
    net_sale_amount_as_of,
    payment_status,
    query_financial_transactions,
    remaining_amount_as_of,
    serialize_financial_transaction,
    summarize_financial_transactions,
)


@pytest.fixture
def scenario(db_session, test_produit, test_user):
    customer = Client(nom_client="Phase3 client")
    other = Client(nom_client="Phase3 autre client")
    supplier = Fournisseur(nom_fournisseur="Phase3 fournisseur")
    db_session.add_all([customer, other, supplier])
    db_session.flush()

    def sale(*, contact=customer, total="1500.00", qty=1000, due=date(2026, 10, 31)):
        row = Transaction(
            id_client=contact.id_client,
            id_produit=test_produit.id_produit,
            date_transaction=date(2026, 10, 1),
            date_echeance=due,
            date_livraison_prevue=date(2026, 12, 1),
            quantite=qty,
            prix_unitaire=Decimal("1.50"),
            montant_total=Decimal(total),
            est_promesse=True,
            allocation_automatique=True,
            quantite_annulee=0,
            est_actif=True,
        )
        db_session.add(row)
        db_session.flush()
        return row

    def payment(tx, amount, posted, *, nature="paiement", kind="cash", state="valide", cheque_state=None, encashed=None):
        row = Paiement(
            id_transaction=tx.id_transaction,
            date_paiement=posted,
            montant=Decimal(amount),
            nature=nature,
            type_paiement=kind,
            statut=state,
            statut_cheque=cheque_state,
            date_encaissement_effective=encashed,
        )
        db_session.add(row)
        return row

    def avoir(tx, units, cumulative, amount, at):
        op_id = uuid4()
        op = CorrectionOperation(
            operation_id=op_id,
            request_hash="b" * 64,
            id_utilisateur=test_user.id_utilisateur,
            reason="Cancellation of undelivered eggs",
            request_payload={"kind": "deferred_avoir", "action": "cancel_unallocated"},
            result_payload={"adjustment_amount": amount},
        )
        row = DeferredSaleAdjustment(
            id_avoir=op_id,
            id_transaction=tx.id_transaction,
            id_client=tx.id_client,
            id_utilisateur_creation=test_user.id_utilisateur,
            date_effet=at,
            quantite_initiale=tx.quantite,
            montant_initial=Decimal(str(tx.montant_total)),
            quantite_annulee_avant=cumulative - units,
            quantite_annulee=units,
            quantite_annulee_cumulee=cumulative,
            avoir_cumule_avant=Decimal("0.00") if cumulative == units else Decimal("150.00"),
            montant_avoir=Decimal(amount),
            avoir_cumule=Decimal("150.00") if cumulative == 100 else Decimal("600.00"),
        )
        db_session.add_all([op, row])
        return row

    tx = sale()
    another = sale(contact=other, total="100.00", qty=100)
    payment(tx, "750.00", date(2026, 10, 15))
    payment(tx, "750.00", date(2026, 11, 4))
    payment(tx, "600.00", date(2026, 11, 12), nature="remboursement")
    payment(tx, "500.00", date(2026, 10, 16), state="annule")
    payment(tx, "400.00", date(2026, 10, 16), kind="cheque", cheque_state="emis")
    avoir(tx, 100, 100, "150.00", date(2026, 10, 20))
    avoir(tx, 300, 400, "450.00", date(2026, 11, 10))
    tx.quantite_annulee = 400
    db_session.commit()
    db_session.expire_all()
    return {
        "tx": db_session.get(Transaction, tx.id_transaction),
        "other": db_session.get(Transaction, another.id_transaction),
        "customer": customer.id_client,
        "other_id": other.id_client,
        "supplier": supplier.id_fournisseur,
    }


@pytest.mark.parametrize(
    ("cutoff", "avoir", "net", "paid", "remaining"),
    [
        (date(2026, 10, 19), "0.00", "1500.00", "750.00", "750.00"),
        (date(2026, 10, 31), "150.00", "1350.00", "750.00", "600.00"),
        (date(2026, 11, 8), "150.00", "1350.00", "1500.00", "-150.00"),
        (date(2026, 11, 11), "600.00", "900.00", "1500.00", "-600.00"),
        (date(2026, 11, 12), "600.00", "900.00", "900.00", "0.00"),
    ],
)
def test_phase3_dated_net_amounts_ignore_future_avoirs_and_refunds(
    db_session, scenario, cutoff, avoir, net, paid, remaining,
):
    tx = scenario["tx"]
    assert commercial_credit_total_as_of(tx, cutoff) == Decimal(avoir)
    assert net_sale_amount_as_of(tx, cutoff) == Decimal(net)
    assert remaining_amount_as_of(tx, cutoff) == Decimal(remaining)
    assert contact_balances(
        db_session, direction="receivable", contact_ids=[scenario["customer"]],
        as_of=cutoff,
    ) == {scenario["customer"]: Decimal(remaining)}
    assert financial_position_as_of(db_session, cutoff)["receivables"] == (
        Decimal(remaining) + Decimal("100.00")
    )


def test_phase3_current_model_and_sql_collection_are_identical(db_session, scenario):
    tx = scenario["tx"]
    assert tx.montant_total == Decimal("1500.00")
    assert tx.montant_avoir == Decimal("600.00")
    assert tx.montant_net == Decimal("900.00")
    assert tx.montant_paye == Decimal("900.00")
    assert tx.montant_restant == Decimal("0.00")
    assert tx.statut_paiement == "paye"
    assert tx.pourcentage_paye == pytest.approx(100.0)
    assert TransactionRead.model_validate(tx).montant_net == Decimal("900.00")

    results = query_financial_transactions(db_session, direction="receivable",
                                            sort_by="montant_restant")
    assert len(results) == 2
    serialized = {r.id_transaction: serialize_financial_transaction(r) for r in results}
    result = serialized[tx.id_transaction]
    assert result["montant_total"] == Decimal("1500.00")
    assert result["montant_avoir"] == Decimal("600.00")
    assert result["montant_net"] == Decimal("900.00")
    assert result["montant_restant"] == tx.montant_restant
    assert result["statut_paiement"] == tx.statut_paiement

    summary = summarize_financial_transactions(db_session, direction="receivable")
    assert summary["total"] == Decimal("1000.00")
    assert summary["total_brut"] == Decimal("1600.00")
    assert summary["total_avoirs"] == Decimal("600.00")
    assert summary["paye"] == Decimal("900.00")
    assert summary["reste"] == Decimal("100.00")
    assert summary["count"] == 2


def test_phase3_filtered_sql_page_and_summary_use_same_net_values(db_session, scenario):
    tx = scenario["tx"]
    ids = [r.id_transaction for r in query_financial_transactions(
        db_session, direction="receivable", statut="paye",
    )]
    assert ids == [tx.id_transaction]
    summary = summarize_financial_transactions(db_session, direction="receivable", statut="paye")
    assert (summary["total"], summary["total_brut"], summary["total_avoirs"],
            summary["paye"], summary["reste"], summary["count"]) == (
        Decimal("900.00"), Decimal("1500.00"), Decimal("600.00"),
        Decimal("900.00"), Decimal("0.00"), 1,
    )
    overdue = summarize_financial_transactions(
        db_session, direction="receivable", overdue_only=True, today=date(2026, 11, 11),
    )
    assert overdue["count"] == 1  # Only the second, unpaid sale is overdue.
    assert overdue["reste"] == Decimal("100.00")
    balances = contact_balances(db_session, direction="receivable", contact_ids=[
        scenario["customer"], scenario["other_id"],
    ])
    assert balances == {
        scenario["customer"]: Decimal("0.00"),
        scenario["other_id"]: Decimal("100.00"),
    }


def test_phase3_payment_status_switches_to_customer_credit_before_refund(db_session, scenario):
    tx = scenario["tx"]
    # The model uses all effective payments, so verify an intermediate state
    # without mutating historical postings or commercial adjustments.
    refund = next(p for p in tx.paiements if p.nature == "remboursement")
    refund.statut = "annule"
    db_session.flush()
    db_session.expire_all()
    tx = db_session.get(Transaction, tx.id_transaction)
    assert tx.montant_total == Decimal("1500.00")
    assert tx.montant_net == Decimal("900.00")
    assert tx.montant_paye == Decimal("1500.00")
    assert tx.montant_restant == Decimal("-600.00")
    assert tx.statut_paiement == "surpaye"
    assert payment_status(tx, date(2026, 11, 11)) == "surpaye"
    summary = summarize_financial_transactions(db_session, direction="receivable", statut="surpaye")
    assert summary["count"] == 1
    assert summary["total"] == Decimal("900.00")
    assert summary["paye"] == Decimal("1500.00")
    assert summary["reste"] == Decimal("-600.00")


def test_phase3_financial_endpoints_expose_original_avoir_and_net(client, scenario):
    tx = scenario["tx"]
    response = client.get(f"/api/v1/transactions/{tx.id_transaction}")
    assert response.status_code == 200, response.text
    detail = response.json()
    assert Decimal(str(detail["montant_total"])) == Decimal("1500.00")
    assert Decimal(str(detail["montant_avoir"])) == Decimal("600.00")
    assert Decimal(str(detail["montant_net"])) == Decimal("900.00")

    response = client.get(f"/api/v1/transactions/{tx.id_transaction}/payment-summary")
    assert response.status_code == 200, response.text
    payment = response.json()
    assert Decimal(str(payment["montant_total"])) == Decimal("1500.00")
    assert Decimal(str(payment["montant_net"])) == Decimal("900.00")
    assert Decimal(str(payment["montant_avoir"])) == Decimal("600.00")

    response = client.get("/api/v1/transactions/creances", params={"sort_by": "montant_restant"})
    assert response.status_code == 200, response.text
    collection = response.json()
    assert Decimal(str(collection["summary"]["total"])) == Decimal("1000.00")
    assert Decimal(str(collection["summary"]["total_brut"])) == Decimal("1600.00")
    assert Decimal(str(collection["summary"]["total_avoirs"])) == Decimal("600.00")
    assert Decimal(str(next(
        item["montant_net"] for item in collection["items"]
        if item["id_transaction"] == tx.id_transaction
    ))) == Decimal("900.00")


def test_phase3_unadjusted_supplier_totals_remain_unchanged(db_session, scenario, test_produit):
    tx = Transaction(
        id_fournisseur=scenario["supplier"], id_produit=test_produit.id_produit,
        date_transaction=date(2026, 10, 1), date_echeance=date(2026, 11, 5),
        quantite=1, prix_unitaire=Decimal("250.00"), montant_total=Decimal("250.00"),
    )
    db_session.add(tx)
    db_session.commit()
    db_session.expire_all()
    tx = db_session.get(Transaction, tx.id_transaction)
    assert tx.montant_net == tx.montant_total == Decimal("250.00")
    assert tx.montant_avoir == Decimal("0.00")
    assert summarize_financial_transactions(db_session, direction="payable")["total"] == Decimal("250.00")
    assert contact_balances(db_session, direction="payable", contact_ids=[scenario["supplier"]]) == {
        scenario["supplier"]: Decimal("250.00"),
    }
