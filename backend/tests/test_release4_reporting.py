"""Release 4 Phase 6: report/export period accuracy and customer aggregation."""
from decimal import Decimal
from datetime import date

from app.services.reporting_commercial import (
    monthly_client_sales, period_commercial_adjustments, sum_period_adjustments,
)
from tests.test_release4_financial_projection import scenario


def _d(value):
    return Decimal(str(value))


def _amount(report, field):
    return _d(report[field])


def test_phase6_monthly_activity_applies_avoirs_in_issue_month_not_sale_month(client, scenario):
    october_response = client.get("/api/v1/reports/monthly", params={"month": "2026-10"})
    assert october_response.status_code == 200, october_response.text
    oct_report = october_response.json()
    # Two October sales; 150 MAD October avoir; 450 MAD future November
    # avoir and 600 MAD November refund must NOT rewrite October.
    assert _amount(oct_report, "ventes") == Decimal("1600.00")
    assert _amount(oct_report, "avoirs_commerciaux") == Decimal("150.00")
    assert _amount(oct_report, "ventes_nettes") == Decimal("1450.00")
    assert _amount(oct_report, "remboursements_clients") == Decimal("0")
    top = {r["id"]: _d(r["total"]) for r in oct_report["top_clients"]}
    assert top[scenario["customer"]] == Decimal("1350.00")
    assert top[scenario["other_id"]] == Decimal("100.00")

    november_response = client.get("/api/v1/reports/monthly", params={"month": "2026-11"})
    assert november_response.status_code == 200, november_response.text
    nov_report = november_response.json()
    assert _amount(nov_report, "ventes") == Decimal("0.00")
    assert _amount(nov_report, "avoirs_commerciaux") == Decimal("450.00")
    assert _amount(nov_report, "ventes_nettes") == Decimal("-450.00")
    # Refund is a payment/cash flow; not another sales discount.
    assert _amount(nov_report, "remboursements_clients") == Decimal("600.00")
    assert _d(nov_report["top_clients"][0]["total"]) == Decimal("-450.00")
    assert nov_report["top_clients"][0]["id"] == scenario["customer"]
    assert sum_period_adjustments(period_commercial_adjustments(
        scenario["tx"]._sa_instance_state.session, date(2026, 10, 1), date(2026, 11, 30),
    )) == Decimal("600.00")


def test_phase6_client_history_product_statistics_and_dated_details(client, db_session, scenario):
    customer_id = scenario["customer"]
    history = client.get(f"/api/v1/clients/{customer_id}/profile")
    assert history.status_code == 200, history.text
    profile = history.json()
    assert _d(profile["statistiques"]["montant_total_ventes"]) == Decimal("900.00")
    assert profile["statistiques"]["total_transactions"] == 1

    products = client.get(f"/api/v1/clients/{customer_id}/produits-achetes")
    assert products.status_code == 200, products.text
    product = products.json()
    assert _d(product["montant_total_tous_produits"]) == Decimal("900.00")
    assert product["quantite_totale_tous_produits"] == 600
    assert _d(product["produits"][0]["prix_moyen"]) == Decimal("1.50")

    sale = client.get(f"/api/v1/transactions/{scenario['tx'].id_transaction}")
    assert sale.status_code == 200, sale.text
    commercial = sale.json()["avoirs_livraison_differee"]
    assert len(commercial) == 2
    assert {(item["date_effet"], _d(item["montant_avoir"])) for item in commercial} == {
        ("2026-10-20", Decimal("150.00")),
        ("2026-11-10", Decimal("450.00")),
    }
    assert _d(sale.json()["montant_total"]) == Decimal("1500.00")
    assert _d(sale.json()["montant_avoir"]) == Decimal("600.00")
    assert _d(sale.json()["montant_net"]) == Decimal("900.00")


def test_phase6_client_monthly_amounts_are_net_in_each_accounting_period(client, scenario):
    response = client.get(
        f"/api/v1/clients/{scenario['customer']}/stats-mensuelles",
        params={"periode": 6},
    )
    assert response.status_code == 200, response.text
    rows = {r["mois"]: r for r in response.json()["data"]}
    assert _d(rows["2026-10"]["montant_brut"]) == Decimal("1500.00")
    assert _d(rows["2026-10"]["montant_avoirs"]) == Decimal("150.00")
    assert _d(rows["2026-10"]["montant"]) == Decimal("1350.00")
    assert rows["2026-10"]["nb_transactions"] == 1
    assert _d(rows["2026-11"]["montant_brut"]) == Decimal("0.00")
    assert _d(rows["2026-11"]["montant_avoirs"]) == Decimal("450.00")
    assert _d(rows["2026-11"]["montant"]) == Decimal("-450.00")
    assert rows["2026-11"]["nb_transactions"] == 0


def test_phase6_shared_monthly_client_sales_does_not_count_payments_as_sales(db_session, scenario):
    customer_id = scenario["customer"]
    october = monthly_client_sales(db_session, customer_id, date(2026, 10, 1), date(2026, 10, 31))
    november = monthly_client_sales(db_session, customer_id, date(2026, 11, 1), date(2026, 11, 30))
    assert october == {
        "montant_brut": Decimal("1500.00"),
        "montant_avoirs": Decimal("150.00"),
        "montant": Decimal("1350.00"),
        "nb_transactions": 1,
    }
    assert november == {
        "montant_brut": Decimal("0"),
        "montant_avoirs": Decimal("450.00"),
        "montant": Decimal("-450.00"),
        "nb_transactions": 0,
    }
