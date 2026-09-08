from datetime import date, timedelta
from decimal import Decimal

from app.models.alert import Alerte
from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.financial_correction import CorrectionFinanciere
from app.services.alerts import create_overdue_alerts
from app.services.reconciliation import run_integrity_check


def create_product(client, name, product_type, clients, suppliers):
    response = client.post("/api/v1/produits", json={
        "nom_produit": name,
        "type_produit": product_type,
        "pour_clients": clients,
        "pour_fournisseurs": suppliers,
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_receivables_payment_summary_and_void_are_auditable(client, db_session, auth_headers):
    client_response = client.post("/api/v1/clients", json={"nom_client": "Client Recouvrement"}, headers=auth_headers)
    client_id = client_response.json()["id_client"]
    product = create_product(client, "Service Recouvrement", "service", True, False)
    transaction = client.post("/api/v1/transactions", json={
        "date_transaction": date.today().isoformat(),
        "date_echeance": (date.today() - timedelta(days=2)).isoformat(),
        "id_produit": product["id_produit"],
        "quantite": 1,
        "prix_unitaire": 100,
        "id_client": client_id,
    }, headers=auth_headers)
    assert transaction.status_code == 201, transaction.text
    transaction_id = transaction.json()["id_transaction"]

    receivables = client.get("/api/v1/transactions/creances", headers=auth_headers)
    assert receivables.status_code == 200
    assert receivables.json()["summary"]["reste"] == "100.00"
    assert receivables.json()["items"][0]["statut_paiement"] == "en_retard"

    payment = client.post("/api/v1/paiements", json={
        "id_transaction": transaction_id,
        "date_paiement": date.today().isoformat(),
        "montant": 100,
        "type_paiement": "cash",
        "cle_idempotence": "payment-test-idempotence-001",
    }, headers=auth_headers)
    assert payment.status_code == 201, payment.text
    payment_id = payment.json()["id_paiement"]
    repeated = client.post("/api/v1/paiements", json={
        "id_transaction": transaction_id,
        "date_paiement": date.today().isoformat(),
        "montant": 100,
        "type_paiement": "cash",
        "cle_idempotence": "payment-test-idempotence-001",
    }, headers=auth_headers)
    assert repeated.status_code == 200
    assert repeated.json()["id_paiement"] == payment_id
    assert client.get(f"/api/v1/transactions/{transaction_id}/payment-summary", headers=auth_headers).json()["statut_paiement"] == "paye"

    voided = client.delete(f"/api/v1/paiements/{payment_id}", headers=auth_headers)
    assert voided.status_code == 204
    assert client.get(f"/api/v1/transactions/{transaction_id}/payment-summary", headers=auth_headers).json()["statut_paiement"] == "en_retard"
    assert client.put(f"/api/v1/paiements/{payment_id}", json={"notes": "should fail"}, headers=auth_headers).status_code == 400

    cheque = client.post("/api/v1/paiements", json={
        "id_transaction": transaction_id,
        "date_paiement": date.today().isoformat(),
        "montant": 100,
        "type_paiement": "cheque",
        "statut_cheque": "encaisse",
    }, headers=auth_headers)
    assert cheque.status_code == 201, cheque.text
    cheque_id = cheque.json()["id_paiement"]
    assert client.get(f"/api/v1/transactions/{transaction_id}/payment-summary", headers=auth_headers).json()["statut_paiement"] == "paye"
    assert client.delete(f"/api/v1/paiements/{cheque_id}", headers=auth_headers).status_code == 204
    assert client.get(f"/api/v1/transactions/{transaction_id}/payment-summary", headers=auth_headers).json()["statut_paiement"] == "en_retard"
    assert db_session.query(Caisse).filter(Caisse.id_paiement == cheque_id, Caisse.statut == "active").count() == 0
    assert db_session.query(Alerte).count() == 0


def test_receivables_support_due_date_range(client, auth_headers):
    client_response = client.post("/api/v1/clients", json={"nom_client": "Client Dates"}, headers=auth_headers)
    product = create_product(client, "Service Dates", "service", True, False)
    for due_date, amount in ((date.today() - timedelta(days=5), 10), (date.today() + timedelta(days=5), 20)):
        response = client.post("/api/v1/transactions", json={
            "date_transaction": date.today().isoformat(),
            "date_echeance": due_date.isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": amount,
            "id_client": client_response.json()["id_client"],
        }, headers=auth_headers)
        assert response.status_code == 201, response.text

    filtered = client.get("/api/v1/transactions/creances", params={
        "echeance_debut": date.today().isoformat(),
    }, headers=auth_headers)
    assert filtered.status_code == 200, filtered.text
    assert len(filtered.json()["items"]) == 1

    sorted_items = client.get(
        "/api/v1/transactions/creances",
        params={"sort_by": "montant_total", "sort_order": "desc"},
        headers=auth_headers,
    )
    assert sorted_items.status_code == 200, sorted_items.text
    assert sorted_items.json()["items"][0]["montant_total"] == "20.00"


def test_overdue_alert_generation_is_idempotent(client, db_session, auth_headers):
    client_response = client.post("/api/v1/clients", json={"nom_client": "Client Alerte"}, headers=auth_headers)
    product = create_product(client, "Service Alerte", "service", True, False)
    response = client.post("/api/v1/transactions", json={
        "date_transaction": (date.today() - timedelta(days=10)).isoformat(),
        "date_echeance": (date.today() - timedelta(days=1)).isoformat(),
        "id_produit": product["id_produit"],
        "quantite": 1,
        "prix_unitaire": 50,
        "id_client": client_response.json()["id_client"],
    }, headers=auth_headers)
    assert response.status_code == 201, response.text
    assert create_overdue_alerts(db_session, date.today()) == 1
    assert create_overdue_alerts(db_session, date.today()) == 0
    assert db_session.query(Alerte).count() == 1


def test_bom_transformation_updates_stock_and_is_idempotent(client, auth_headers):
    supplier = client.post("/api/v1/fournisseurs", json={"nom_fournisseur": "Fournisseur Stock"}, headers=auth_headers).json()
    raw = create_product(client, "Matière Stock", "matiere_premiere", False, True)
    finished = create_product(client, "Produit Transformé", "produit_fini", True, False)
    purchase = client.post("/api/v1/transactions", json={
        "date_transaction": date.today().isoformat(), "id_produit": raw["id_produit"], "quantite": 10,
        "prix_unitaire": 4, "id_fournisseur": supplier["id_fournisseur"],
    }, headers=auth_headers)
    assert purchase.status_code == 201, purchase.text

    bom = client.post("/api/v1/product-boms", json={
        "id_produit_sortie": finished["id_produit"], "version": 1, "quantite_sortie": 1,
        "lignes": [{"id_produit_entree": raw["id_produit"], "quantite": 2}],
    }, headers=auth_headers)
    assert bom.status_code == 201, bom.text
    bom_id = bom.json()["id_nomenclature"]
    preview = client.post("/api/v1/transformations/preview", json={
        "date_transformation": date.today().isoformat(), "id_nomenclature": bom_id,
        "quantite_sortie": 3,
    }, headers=auth_headers)
    assert preview.status_code == 200, preview.text
    assert preview.json()["stock_suffisant"] is True
    assert preview.json()["lignes_entree"][0]["quantite_requise"] == "6.000"
    transformation = client.post("/api/v1/transformations", json={
        "date_transformation": date.today().isoformat(), "id_nomenclature": bom_id,
        "quantite_sortie": 3, "cle_idempotence": "bom-test-idempotence-001",
    }, headers=auth_headers)
    assert transformation.status_code == 201, transformation.text
    repeated = client.post("/api/v1/transformations", json={
        "date_transformation": date.today().isoformat(), "id_nomenclature": bom_id,
        "quantite_sortie": 3, "cle_idempotence": "bom-test-idempotence-001",
    }, headers=auth_headers)
    assert repeated.status_code == 200
    assert repeated.json()["id_transformation"] == transformation.json()["id_transformation"]
    stock = client.get("/api/v1/stock", headers=auth_headers)
    assert stock.status_code == 200
    balances = {item["id_produit"]: item["quantite_disponible"] for item in stock.json()}
    assert balances[raw["id_produit"]] == "4.000"
    assert balances[finished["id_produit"]] == "3.000"

    reversed_transformation = client.post(
        f"/api/v1/transformations/{transformation.json()['id_transformation']}/reverse",
        headers=auth_headers,
    )
    assert reversed_transformation.status_code == 200, reversed_transformation.text
    reversed_again = client.post(
        f"/api/v1/transformations/{transformation.json()['id_transformation']}/reverse",
        headers=auth_headers,
    )
    assert reversed_again.status_code == 409, reversed_again.text
    stock_after_reversal = client.get("/api/v1/stock", headers=auth_headers).json()
    balances_after_reversal = {item["id_produit"]: item["quantite_disponible"] for item in stock_after_reversal}
    assert balances_after_reversal[raw["id_produit"]] == "10.000"
    assert balances_after_reversal[finished["id_produit"]] in {"0", "0.000"}


def test_search_and_monthly_report_are_available(client, auth_headers):
    client_response = client.post("/api/v1/clients", json={"nom_client": "Client Recherche"}, headers=auth_headers)
    product = create_product(client, "Produit Rapport", "service", True, False)
    response = client.post("/api/v1/transactions", json={
        "date_transaction": date.today().isoformat(), "id_produit": product["id_produit"], "quantite": 1,
        "prix_unitaire": 125, "id_client": client_response.json()["id_client"],
    }, headers=auth_headers)
    assert response.status_code == 201, response.text

    search = client.get("/api/v1/search", params={"q": "Rapport"}, headers=auth_headers)
    assert search.status_code == 200
    assert any(item["kind"] == "produit" for item in search.json()["results"])
    report = client.get("/api/v1/reports/monthly", params={"month": date.today().strftime("%Y-%m")}, headers=auth_headers)
    assert report.status_code == 200, report.text
    assert report.json()["ventes"] == "125.00"
    assert isinstance(report.json()["inventory_movements"], int)
    assert "inventory_quantity_delta" in report.json()


def test_inactive_transactions_do_not_create_inventory_movements(client, db_session, auth_headers):
    supplier = client.post(
        "/api/v1/fournisseurs", json={"nom_fournisseur": "Fournisseur Inactif"}, headers=auth_headers
    ).json()
    product = create_product(client, "Matière Inactive", "matiere_premiere", False, True)
    transaction = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": date.today().isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 5,
            "prix_unitaire": 2,
            "id_fournisseur": supplier["id_fournisseur"],
            "est_actif": False,
        },
        headers=auth_headers,
    )
    assert transaction.status_code == 201, transaction.text
    stock = client.get("/api/v1/stock", headers=auth_headers).json()
    assert Decimal(next(item for item in stock if item["id_produit"] == product["id_produit"])["quantite_disponible"]) == Decimal("0")


def test_building_source_is_validated_for_egg_sales(client, auth_headers):
    client_row = client.post(
        "/api/v1/clients", json={"nom_client": "Client Source Batiment"}, headers=auth_headers
    ).json()
    product = create_product(client, "Service Avec Source", "service", True, False)
    response = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": date.today().isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": 10,
            "id_client": client_row["id_client"],
            "id_batiment": 999999,
        },
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "vente d'oeufs" in response.json()["detail"]


def test_payment_financial_fields_are_immutable_and_cash_history_is_preserved(
    client, db_session, auth_headers
):
    client_response = client.post(
        "/api/v1/clients", json={"nom_client": "Client Immutable"}, headers=auth_headers
    )
    product = create_product(client, "Service Immutable", "service", True, False)
    transaction = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": date.today().isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": 100,
            "id_client": client_response.json()["id_client"],
        },
        headers=auth_headers,
    ).json()
    payment = client.post(
        "/api/v1/paiements",
        json={
            "id_transaction": transaction["id_transaction"],
            "date_paiement": date.today().isoformat(),
            "montant": 100,
            "type_paiement": "cash",
        },
        headers=auth_headers,
    )
    assert payment.status_code == 201, payment.text
    payment_id = payment.json()["id_paiement"]
    movement = db_session.query(Caisse).filter(Caisse.id_paiement == payment_id).one()

    changed = client.put(
        f"/api/v1/paiements/{payment_id}",
        json={"montant": 125, "raison": "Correction du montant"},
        headers=auth_headers,
    )
    assert changed.status_code == 409, changed.text
    db_session.expire_all()
    assert db_session.query(Caisse).filter(Caisse.id_mouvement == movement.id_mouvement).one().statut == "active"
    assert db_session.query(Caisse).filter(Caisse.id_paiement == payment_id, Caisse.statut == "active").count() == 1


def test_charge_edit_replaces_cash_movement_without_deleting_history(
    client, db_session, auth_headers
):
    created = client.post(
        "/api/v1/charges",
        json={
            "libelle": "Loyer initial",
            "montant": 100,
            "date_charge": date.today().isoformat(),
            "categorie": "Fixe",
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    charge_id = created.json()["id_charge"]
    original = db_session.query(Caisse).filter(Caisse.id_charge == charge_id).one()

    updated = client.put(
        f"/api/v1/charges/{charge_id}",
        json={"montant": 120, "raison": "Facture corrigée"},
        headers=auth_headers,
    )
    assert updated.status_code == 200, updated.text
    db_session.expire_all()
    rows = db_session.query(Caisse).filter(Caisse.id_charge == charge_id).all()
    assert len(rows) == 2
    voided = next(row for row in rows if row.id_mouvement == original.id_mouvement)
    replacement = next(row for row in rows if row.id_mouvement != original.id_mouvement)
    assert voided.statut == "annule"
    assert voided.id_mouvement_inverse == replacement.id_mouvement
    assert replacement.id_mouvement_inverse == voided.id_mouvement
    assert replacement.statut == "active"
    assert db_session.query(CorrectionFinanciere).filter(
        CorrectionFinanciere.type_entite == "charge",
        CorrectionFinanciere.id_entite == charge_id,
    ).count() >= 1


def test_charge_bank_edit_restores_old_account_and_preserves_bank_history(
    client, db_session, auth_headers
):
    account = client.post(
        "/api/v1/comptes-bancaires",
        json={"nom_banque": "Banque Audit", "numero_compte": "AUDIT-001", "solde_initial": 1000},
        headers=auth_headers,
    )
    assert account.status_code == 201, account.text
    account_id = account.json()["id_compte"]
    created = client.post(
        "/api/v1/charges",
        json={
            "libelle": "Frais bancaire",
            "montant": 100,
            "date_charge": date.today().isoformat(),
            "categorie": "Frais",
            "id_compte": account_id,
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    charge_id = created.json()["id_charge"]
    updated = client.put(
        f"/api/v1/charges/{charge_id}",
        json={"montant": 130, "raison": "Relevé bancaire corrigé"},
        headers=auth_headers,
    )
    assert updated.status_code == 200, updated.text
    db_session.expire_all()
    rows = db_session.query(MouvementBancaire).filter(MouvementBancaire.id_charge == charge_id).all()
    assert len(rows) == 2
    assert sum(1 for row in rows if row.statut == "active") == 1
    account_row = db_session.query(CompteBancaire).filter(CompteBancaire.id_compte == account_id).one()
    assert str(account_row.solde_actuel) == "870.00"
    assert not any(issue["code"] == "BANK_BALANCE_MISMATCH" for issue in run_integrity_check(db_session))
    account_row.solde_actuel = Decimal("1.00")
    db_session.flush()
    assert any(issue["code"] == "BANK_BALANCE_MISMATCH" for issue in run_integrity_check(db_session))
