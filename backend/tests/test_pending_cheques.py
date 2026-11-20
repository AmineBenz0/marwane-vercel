"""Uncashed cheques: not counted as paid in the ledger, no longer counted as owed.

Business rule (option 1): once a payment is handed over (typically a cheque not
cashed yet), screens no longer show it as owed. The ledger figures
(montant_paye / montant_restant) keep counting only effective payments, because
credits, refunds and reconciliation rely on them.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.models.alert import Alerte
from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.services.alerts import create_overdue_alerts
from app.services.financial import contact_balances, financial_position_as_of, payment_status

TODAY = date(2026, 11, 20)
PAST_DUE = date(2026, 11, 1)


@pytest.fixture
def purchases(db_session, test_produit):
    supplier = Fournisseur(nom_fournisseur="ZZ pending cheques", est_actif=True)
    db_session.add(supplier)
    db_session.flush()

    def purchase(total, due=PAST_DUE):
        row = Transaction(
            id_fournisseur=supplier.id_fournisseur, id_produit=test_produit.id_produit,
            date_transaction=date(2026, 10, 1), date_echeance=due,
            quantite=1, prix_unitaire=Decimal(total), montant_total=Decimal(total),
        )
        db_session.add(row)
        db_session.flush()
        return row

    def pay(row, amount, kind="cheque", status="valide", cheque=None, on=date(2026, 10, 2), cashed_on=None):
        db_session.add(Paiement(
            id_transaction=row.id_transaction, date_paiement=on, montant=Decimal(amount),
            type_paiement=kind, statut=status, statut_cheque=cheque,
            date_encaissement_effective=cashed_on,
        ))

    rows = {
        "covered": purchase("100"),        # one uncashed cheque covers it all
        "part_pending": purchase("100"),   # 40 on its way, 60 still owed
        "unpaid": purchase("100"),
        "cashed": purchase("100"),
        "bounced": purchase("100"),        # rejected cheque: still owed
        "overpaid": purchase("100"),       # credit stays a credit
    }
    pay(rows["covered"], "100", cheque="emis")
    pay(rows["part_pending"], "40", status="en_attente")
    pay(rows["cashed"], "100", cheque="encaisse", cashed_on=date(2026, 10, 5))
    pay(rows["bounced"], "100", status="rejete", cheque="rejete")
    pay(rows["overpaid"], "140", kind="cash")
    pay(rows["overpaid"], "30", cheque="a_encaisser")
    db_session.commit()
    for row in rows.values():
        db_session.refresh(row)
    return supplier, rows


def test_model_keeps_ledger_and_adds_owed(purchases):
    _, rows = purchases
    covered = rows["covered"]
    # Ledger unchanged: the cheque is not cashed, so not paid.
    assert covered.montant_paye == 0
    assert covered.montant_restant == 100
    # Owed: the cheque is on its way, so nothing is owed any more.
    assert covered.montant_en_attente == 100
    assert covered.montant_du == 0
    assert covered.statut_paiement == "cheque_en_attente"
    assert covered.est_en_retard is False
    assert payment_status(covered, TODAY) == "cheque_en_attente"

    part = rows["part_pending"]
    assert (part.montant_en_attente, part.montant_du, part.statut_paiement) == (40, 60, "partiel")
    assert payment_status(part, TODAY) == "en_retard"

    assert (rows["unpaid"].montant_du, rows["unpaid"].statut_paiement) == (100, "impaye")
    assert (rows["cashed"].montant_du, rows["cashed"].statut_paiement) == (0, "paye")
    bounced = rows["bounced"]
    assert (bounced.montant_en_attente, bounced.montant_du, bounced.statut_paiement) == (0, 100, "impaye")
    overpaid = rows["overpaid"]
    assert (overpaid.montant_restant, overpaid.montant_du, overpaid.statut_paiement) == (-40, -40, "surpaye")


def test_payables_page_totals_status_filter_and_overdue(client, auth_headers, purchases, monkeypatch):
    supplier, rows = purchases
    monkeypatch.setattr("app.services.financial.business_date", lambda: TODAY)
    params = {"id_fournisseur": supplier.id_fournisseur, "limit": 50}
    response = client.get("/api/v1/transactions/dettes", params=params, headers=auth_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    by_id = {item["id_transaction"]: item for item in body["items"]}
    covered = by_id[rows["covered"].id_transaction]
    # Still listed (a cheque can bounce), but not owed and not overdue.
    assert covered["statut_paiement"] == "cheque_en_attente"
    assert Decimal(covered["montant_du"]) == 0
    assert Decimal(covered["montant_en_attente"]) == 100
    assert Decimal(covered["montant_restant"]) == 100
    assert covered["est_en_retard"] is False

    summary = body["summary"]
    # Owed: 0 + 60 + 100 + 0 + 100 - 40 (credit) = 220; pending 100 + 40 + 30.
    assert Decimal(summary["reste"]) == Decimal("220")
    assert Decimal(summary["en_attente"]) == Decimal("170")
    # Overdue: part_pending, unpaid and bounced, never the covered one.
    assert summary["overdue_count"] == 3

    filtered = client.get(
        "/api/v1/transactions/dettes", params={**params, "statut": "cheque_en_attente"}, headers=auth_headers,
    ).json()
    assert [item["id_transaction"] for item in filtered["items"]] == [rows["covered"].id_transaction]

    by_owed = client.get(
        "/api/v1/transactions/dettes", params={**params, "sort_by": "montant_restant", "sort_order": "desc"},
        headers=auth_headers,
    ).json()["items"]
    assert [Decimal(item["montant_du"]) for item in by_owed][:3] == [100, 100, 60]

    summary_endpoint = client.get(
        f"/api/v1/transactions/{rows['covered'].id_transaction}/payment-summary", headers=auth_headers,
    ).json()
    assert summary_endpoint["statut_paiement"] == "cheque_en_attente"
    assert Decimal(summary_endpoint["montant_du"]) == 0


def test_contact_balances_opt_in(db_session, purchases):
    supplier, _ = purchases
    ids = [supplier.id_fournisseur]
    # Ledger balance used by credit logic: 6 x 100 - 100 (cashed) - 140 (cash) = 360.
    assert contact_balances(db_session, direction="payable", contact_ids=ids) == {ids[0]: Decimal("360")}
    # Owed on screens: pending cheques removed per transaction = 220.
    assert contact_balances(db_session, direction="payable", contact_ids=ids, include_pending=True) == {
        ids[0]: Decimal("220"),
    }


def test_supplier_list_shows_owed_balance(client, auth_headers, purchases):
    supplier, _ = purchases
    rows = client.get(
        "/api/v1/fournisseurs", params={"include_balance": True, "recherche": "ZZ pending"}, headers=auth_headers,
    ).json()
    assert [Decimal(str(row["outstanding_balance"])) for row in rows] == [Decimal("220")]


def test_dated_position_counts_cheques_cashed_after_the_date(db_session, test_produit):
    supplier = Fournisseur(nom_fournisseur="ZZ dated", est_actif=True)
    db_session.add(supplier)
    db_session.flush()
    row = Transaction(
        id_fournisseur=supplier.id_fournisseur, id_produit=test_produit.id_produit,
        date_transaction=date(2026, 9, 1), quantite=1, prix_unitaire=Decimal("100"), montant_total=Decimal("100"),
    )
    db_session.add(row)
    db_session.flush()
    db_session.add(Paiement(
        id_transaction=row.id_transaction, date_paiement=date(2026, 9, 10), montant=Decimal("100"),
        type_paiement="cheque", statut="valide", statut_cheque="encaisse",
        date_encaissement_effective=date(2026, 9, 25),
    ))
    db_session.commit()

    def payables(as_of, include_pending):
        return financial_position_as_of(db_session, as_of, include_pending=include_pending)["payables"]

    # Before the cheque was handed over: owed either way.
    assert payables(date(2026, 9, 5), True) == 100
    # Handed over, not cashed yet on that date: not owed on screens, still due in the ledger.
    assert payables(date(2026, 9, 15), True) == 0
    assert payables(date(2026, 9, 15), False) == 100
    # Cashed: settled either way.
    assert payables(date(2026, 9, 30), True) == 0
    assert payables(date(2026, 9, 30), False) == 0


def test_no_overdue_alert_when_a_cheque_covers_the_debt(db_session, purchases):
    _, rows = purchases
    create_overdue_alerts(db_session, reference_date=TODAY)
    alerted = {a.id_transaction for a in db_session.query(Alerte).filter(Alerte.type_alerte == "paiement_en_retard")}
    assert rows["covered"].id_transaction not in alerted
    assert {rows["part_pending"].id_transaction, rows["unpaid"].id_transaction,
            rows["bounced"].id_transaction} <= alerted


def test_party_card_shows_owed_and_pending(db_session, purchases):
    from app.services.credits import party_credit_history
    supplier, _ = purchases
    data = party_credit_history(db_session, id_fournisseur=supplier.id_fournisseur)
    # The ledger balance is unchanged; the card shows what is owed and the cheques on their way.
    assert Decimal(data["balance"]) == Decimal("360")
    assert Decimal(data["montant_du"]) == Decimal("220")
    assert Decimal(data["montant_en_attente"]) == Decimal("140")

