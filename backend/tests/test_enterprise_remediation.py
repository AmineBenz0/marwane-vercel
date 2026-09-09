from datetime import date, timedelta
from decimal import Decimal
from inspect import signature

import pytest

from app.models.alert import Alerte
from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.financial_correction import CorrectionFinanciere
from app.models.inventory import MouvementStock
from app.models.job_execution import JobExecution
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.services.alerts import create_overdue_alerts
from app.services.financial import remaining_amount_as_of
from app.services.reconciliation import run_integrity_check
from app.routers.batiments import get_batiment, get_batiments
from app.utils.dependencies import get_current_active_user


def create_product(client, name, product_type, clients, suppliers):
    response = client.post("/api/v1/produits", json={
        "nom_produit": name,
        "type_produit": product_type,
        "pour_clients": clients,
        "pour_fournisseurs": suppliers,
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_building_read_endpoints_require_an_active_user():
    """Business data must not be readable anonymously in a deployment."""
    for endpoint in (get_batiments, get_batiment):
        dependency = signature(endpoint).parameters["current_user"].default
        assert dependency.dependency is get_current_active_user


def test_transaction_cancellation_voids_payments_and_preserves_audit(
    client, db_session, auth_headers, test_user
):
    from app.main import app

    app.dependency_overrides[get_current_active_user] = lambda: test_user
    client_row = client.post(
        "/api/v1/clients",
        json={"nom_client": "Client Annulation Transaction"},
        headers=auth_headers,
    ).json()
    product = create_product(client, "Service Annulation Transaction", "service", True, False)
    transaction = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": date.today().isoformat(),
            "date_echeance": date.today().isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": 100,
            "id_client": client_row["id_client"],
        },
        headers=auth_headers,
    ).json()
    payment = client.post(
        "/api/v1/paiements",
        json={
            "id_transaction": transaction["id_transaction"],
            "date_paiement": date.today().isoformat(),
            "montant": 40,
            "type_paiement": "cash",
        },
        headers=auth_headers,
    )
    assert payment.status_code == 201, payment.text
    payment_id = payment.json()["id_paiement"]

    cancelled = client.delete(
        f"/api/v1/transactions/{transaction['id_transaction']}?raison=Erreur%20de%20saisie",
        headers=auth_headers,
    )
    assert cancelled.status_code == 204, cancelled.text

    db_session.expire_all()
    stored_transaction = db_session.query(Transaction).filter(
        Transaction.id_transaction == transaction["id_transaction"]
    ).one()
    stored_payment = db_session.query(Paiement).filter(
        Paiement.id_paiement == payment_id
    ).one()
    assert stored_transaction.est_actif is False
    assert stored_transaction.motif_annulation == "Erreur de saisie"
    assert stored_transaction.date_annulation is not None
    assert stored_transaction.id_utilisateur_annulation is not None
    assert stored_payment.statut == "annule"
    assert db_session.query(Caisse).filter(
        Caisse.id_paiement == payment_id,
        Caisse.statut == "active",
    ).count() == 0
    corrections = db_session.query(CorrectionFinanciere).filter(
        CorrectionFinanciere.id_entite.in_([transaction["id_transaction"], payment_id]),
        CorrectionFinanciere.action == "annulation",
    ).all()
    assert {"transaction", "paiement"}.issubset(
        {correction.type_entite for correction in corrections}
    )


def test_cheque_state_transitions_are_coherent_and_terminal(client, auth_headers):
    client_row = client.post(
        "/api/v1/clients",
        json={"nom_client": "Client États Chèque"},
        headers=auth_headers,
    ).json()
    product = create_product(client, "Service États Chèque", "service", True, False)
    transaction = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": date.today().isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": 100,
            "id_client": client_row["id_client"],
        },
        headers=auth_headers,
    ).json()
    cheque = client.post(
        "/api/v1/paiements",
        json={
            "id_transaction": transaction["id_transaction"],
            "date_paiement": date.today().isoformat(),
            "montant": 100,
            "type_paiement": "cheque",
            "statut_cheque": "a_encaisser",
        },
        headers=auth_headers,
    )
    assert cheque.status_code == 201, cheque.text

    rejected = client.put(
        f"/api/v1/paiements/{cheque.json()['id_paiement']}",
        json={"statut_cheque": "rejete", "motif_rejet": "Provision insuffisante"},
        headers=auth_headers,
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["statut"] == "rejete"

    terminal_transition = client.put(
        f"/api/v1/paiements/{cheque.json()['id_paiement']}",
        json={"statut_cheque": "encaisse"},
        headers=auth_headers,
    )
    assert terminal_transition.status_code == 409

    invalid_status = client.put(
        f"/api/v1/paiements/{cheque.json()['id_paiement']}",
        json={"statut_cheque": "inconnu"},
        headers=auth_headers,
    )
    assert invalid_status.status_code == 422


def test_receivables_payment_summary_and_void_are_auditable(client, db_session, auth_headers):
    client_response = client.post("/api/v1/clients", json={"nom_client": "Client Recouvrement"}, headers=auth_headers)
    client_id = client_response.json()["id_client"]
    product = create_product(client, "Service Recouvrement", "service", True, False)
    transaction = client.post("/api/v1/transactions", json={
        "date_transaction": (date.today() - timedelta(days=10)).isoformat(),
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
    idempotency_conflict = client.post("/api/v1/paiements", json={
        "id_transaction": transaction_id,
        "date_paiement": date.today().isoformat(),
        "montant": 101,
        "type_paiement": "cash",
        "cle_idempotence": "payment-test-idempotence-001",
    }, headers=auth_headers)
    assert idempotency_conflict.status_code == 409
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
    assert cheque.json()["statut"] == "valide"
    assert client.get(f"/api/v1/transactions/{transaction_id}/payment-summary", headers=auth_headers).json()["statut_paiement"] == "paye"
    assert client.delete(f"/api/v1/paiements/{cheque_id}", headers=auth_headers).status_code == 204
    assert client.get(f"/api/v1/transactions/{transaction_id}/payment-summary", headers=auth_headers).json()["statut_paiement"] == "en_retard"
    assert db_session.query(Caisse).filter(Caisse.id_paiement == cheque_id, Caisse.statut == "active").count() == 0
    assert db_session.query(Alerte).count() == 0


def test_client_letter_of_credit_cannot_pay_supplier_transaction(client, auth_headers):
    """A client-owned LC must never be accepted for a supplier payable."""
    client_row = client.post(
        "/api/v1/clients",
        json={"nom_client": "Client LC propriétaire"},
        headers=auth_headers,
    ).json()
    supplier_row = client.post(
        "/api/v1/fournisseurs",
        json={"nom_fournisseur": "Fournisseur LC bénéficiaire"},
        headers=auth_headers,
    ).json()
    product = create_product(client, "Service LC fournisseur", "service", False, True)
    transaction = client.post("/api/v1/transactions", json={
        "date_transaction": date.today().isoformat(),
        "date_echeance": date.today().isoformat(),
        "id_produit": product["id_produit"],
        "quantite": 1,
        "prix_unitaire": 100,
        "id_fournisseur": supplier_row["id_fournisseur"],
    }, headers=auth_headers)
    assert transaction.status_code == 201, transaction.text

    lc = client.post("/api/v1/lettres-credit", json={
        "numero_reference": "LC-CLIENT-SUPPLIER-MISMATCH",
        "montant": 100,
        "date_emission": date.today().isoformat(),
        "date_disponibilite": date.today().isoformat(),
        "id_client": client_row["id_client"],
    }, headers=auth_headers)
    assert lc.status_code == 201, lc.text

    payment = client.post("/api/v1/paiements", json={
        "id_transaction": transaction.json()["id_transaction"],
        "date_paiement": date.today().isoformat(),
        "montant": 100,
        "type_paiement": "lc",
        "id_lc": lc.json()["id_lc"],
    }, headers=auth_headers)
    assert payment.status_code == 400
    assert "fournisseur" in payment.json()["detail"].lower()


def test_pending_cheque_becomes_effective_only_when_encashed(client, auth_headers):
    client_row = client.post("/api/v1/clients", json={"nom_client": "Client Chèque"}, headers=auth_headers).json()
    product = create_product(client, "Service Chèque", "service", True, False)
    transaction = client.post("/api/v1/transactions", json={
        "date_transaction": date.today().isoformat(),
        "date_echeance": date.today().isoformat(),
        "id_produit": product["id_produit"],
        "quantite": 1,
        "prix_unitaire": 100,
        "id_client": client_row["id_client"],
    }, headers=auth_headers).json()
    cheque = client.post("/api/v1/paiements", json={
        "id_transaction": transaction["id_transaction"],
        "date_paiement": date.today().isoformat(),
        "montant": 100,
        "type_paiement": "cheque",
        "statut_cheque": "a_encaisser",
    }, headers=auth_headers)
    assert cheque.status_code == 201, cheque.text
    assert cheque.json()["statut"] == "en_attente"
    assert client.get(f"/api/v1/transactions/{transaction['id_transaction']}/payment-summary", headers=auth_headers).json()["statut_paiement"] == "impaye"

    encashed = client.put(
        f"/api/v1/paiements/{cheque.json()['id_paiement']}",
        json={"statut_cheque": "encaisse"},
        headers=auth_headers,
    )
    assert encashed.status_code == 200, encashed.text
    assert encashed.json()["statut"] == "valide"
    assert client.get(f"/api/v1/transactions/{transaction['id_transaction']}/payment-summary", headers=auth_headers).json()["statut_paiement"] == "paye"


def test_receivables_support_due_date_range(client, auth_headers):
    client_response = client.post("/api/v1/clients", json={"nom_client": "Client Dates"}, headers=auth_headers)
    product = create_product(client, "Service Dates", "service", True, False)
    transaction_date = date.today() - timedelta(days=10)
    for due_date, amount in ((date.today() - timedelta(days=5), 10), (date.today() + timedelta(days=5), 20)):
        response = client.post("/api/v1/transactions", json={
            "date_transaction": transaction_date.isoformat(),
            "date_echeance": due_date.isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": amount,
            "id_client": client_response.json()["id_client"],
        }, headers=auth_headers)
        assert response.status_code == 201, response.text

    filtered = client.get("/api/v1/transactions/creances", params={
        "echeance_debut": date.today().isoformat(),
        "echeance_fin": (date.today() + timedelta(days=5)).isoformat(),
        "date_debut": transaction_date.isoformat(),
        "recherche": "Dates",
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


def test_payment_and_inventory_dates_respect_source_dates(client, db_session, auth_headers):
    client_row = client.post(
        "/api/v1/clients",
        json={"nom_client": "Client Dates Intégrité"},
        headers=auth_headers,
    ).json()
    product = create_product(client, "Service Dates Intégrité", "service", True, False)
    transaction_date = date.today() - timedelta(days=2)
    transaction = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": transaction_date.isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": 25,
            "id_client": client_row["id_client"],
        },
        headers=auth_headers,
    ).json()
    invalid_payment = client.post(
        "/api/v1/paiements",
        json={
            "id_transaction": transaction["id_transaction"],
            "date_paiement": (transaction_date - timedelta(days=1)).isoformat(),
            "montant": 25,
            "type_paiement": "cash",
        },
        headers=auth_headers,
    )
    assert invalid_payment.status_code == 400

    supplier = client.post(
        "/api/v1/fournisseurs",
        json={"nom_fournisseur": "Fournisseur Dates Intégrité"},
        headers=auth_headers,
    ).json()
    raw = create_product(client, "Matière Dates Intégrité", "matiere_premiere", False, True)
    purchase = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": transaction_date.isoformat(),
            "id_produit": raw["id_produit"],
            "quantite": 3,
            "prix_unitaire": 2,
            "id_fournisseur": supplier["id_fournisseur"],
        },
        headers=auth_headers,
    ).json()
    movement = db_session.query(MouvementStock).filter(
        MouvementStock.source_type == "transaction",
        MouvementStock.source_id == purchase["id_transaction"],
    ).one()
    assert movement.date_mouvement.date() == transaction_date

    moved_date = date.today() - timedelta(days=1)
    updated = client.put(
        f"/api/v1/transactions/{purchase['id_transaction']}",
        json={"date_transaction": moved_date.isoformat()},
        headers=auth_headers,
    )
    assert updated.status_code == 200, updated.text
    db_session.expire_all()
    movements = db_session.query(MouvementStock).filter(
        MouvementStock.source_type == "transaction",
        MouvementStock.source_id == purchase["id_transaction"],
    ).all()
    assert len(movements) == 2
    active_movement = next(item for item in movements if item.id_mouvement_inverse is None)
    assert active_movement.date_mouvement.date() == moved_date


def test_transaction_update_keeps_party_constraint_and_due_date_valid(client, auth_headers):
    client_row = client.post(
        "/api/v1/clients", json={"nom_client": "Client Contraintes"}, headers=auth_headers
    ).json()
    product = create_product(client, "Service Contraintes", "service", True, False)
    invalid_due_date = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": date.today().isoformat(),
            "date_echeance": (date.today() - timedelta(days=1)).isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": 10,
            "id_client": client_row["id_client"],
        },
        headers=auth_headers,
    )
    assert invalid_due_date.status_code == 422

    transaction = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": date.today().isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": 10,
            "id_client": client_row["id_client"],
        },
        headers=auth_headers,
    ).json()
    cleared_party = client.put(
        f"/api/v1/transactions/{transaction['id_transaction']}",
        json={"id_client": None},
        headers=auth_headers,
    )
    assert cleared_party.status_code == 400


def test_financial_ledger_sync_does_not_duplicate_on_repeat_update(client, db_session, auth_headers):
    account = client.post(
        "/api/v1/comptes-bancaires",
        json={"nom_banque": "Banque Repeat", "numero_compte": "REPEAT-001", "solde_initial": 500},
        headers=auth_headers,
    )
    assert account.status_code == 201, account.text
    charge = client.post(
        "/api/v1/charges",
        json={
            "libelle": "Charge Repeat",
            "montant": 75,
            "date_charge": date.today().isoformat(),
            "categorie": "Divers",
            "id_compte": account.json()["id_compte"],
        },
        headers=auth_headers,
    )
    assert charge.status_code == 201, charge.text
    charge_id = charge.json()["id_charge"]
    first_count = db_session.query(MouvementBancaire).filter(
        MouvementBancaire.id_charge == charge_id
    ).count()
    repeated = client.put(
        f"/api/v1/charges/{charge_id}",
        json={"notes": "Note opérationnelle"},
        headers=auth_headers,
    )
    assert repeated.status_code == 200, repeated.text
    assert db_session.query(MouvementBancaire).filter(
        MouvementBancaire.id_charge == charge_id
    ).count() == first_count


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


def test_payment_alert_job_records_audited_execution(client, db_session, auth_headers, monkeypatch):
    from app.config import settings

    client_response = client.post(
        "/api/v1/clients", json={"nom_client": "Client Job Audité"}, headers=auth_headers
    )
    product = create_product(client, "Service Job Audité", "service", True, False)
    transaction = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": (date.today() - timedelta(days=10)).isoformat(),
            "date_echeance": (date.today() - timedelta(days=1)).isoformat(),
            "id_produit": product["id_produit"],
            "quantite": 1,
            "prix_unitaire": 50,
            "id_client": client_response.json()["id_client"],
        },
        headers=auth_headers,
    )
    assert transaction.status_code == 201, transaction.text

    secret = "cron-test-secret-value-with-at-least-32-chars"
    monkeypatch.setattr(settings, "CRON_SECRET", secret)
    response = client.get(
        "/api/v1/internal/jobs/payment-alerts",
        headers={"Authorization": f"Bearer {secret}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["created"] == 1
    execution = db_session.query(JobExecution).one()
    assert execution.statut == "succeeded"
    assert execution.created_count == 1
    assert execution.completed_at is not None


def test_payment_alert_job_marks_the_same_execution_failed(db_session, monkeypatch):
    from app.config import settings
    from app.routers import jobs

    secret = "cron-test-secret-value-with-at-least-32-chars"
    monkeypatch.setattr(settings, "CRON_SECRET", secret)

    def fail(_db):
        raise RuntimeError("simulated scheduled-job failure")

    monkeypatch.setattr(jobs, "create_overdue_alerts", fail)
    with pytest.raises(RuntimeError, match="simulated scheduled-job failure"):
        jobs.run_payment_alert_job(
            authorization=f"Bearer {secret}",
            db=db_session,
        )

    executions = db_session.query(JobExecution).all()
    assert len(executions) == 1
    assert executions[0].statut == "failed"
    assert executions[0].failure_type == "RuntimeError"
    assert executions[0].completed_at is not None


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
    idempotency_conflict = client.post("/api/v1/transformations", json={
        "date_transformation": date.today().isoformat(), "id_nomenclature": bom_id,
        "quantite_sortie": 2, "cle_idempotence": "bom-test-idempotence-001",
    }, headers=auth_headers)
    assert idempotency_conflict.status_code == 409
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

    adjustment = client.post("/api/v1/stock/adjustments", json={
        "id_produit": finished["id_produit"], "quantite_delta": 2,
        "cout_unitaire": 5, "notes": "Correction de comptage",
        "cle_idempotence": "stock-adjustment-idempotency-001",
    }, headers=auth_headers)
    assert adjustment.status_code == 201, adjustment.text
    adjustment_id = adjustment.json()["id_mouvement_stock"]
    adjustment_reversal = client.post(
        f"/api/v1/stock/{adjustment_id}/reverse",
        json={"raison": "Annulation de la correction de comptage"},
        headers=auth_headers,
    )
    assert adjustment_reversal.status_code == 200, adjustment_reversal.text
    repeated_adjustment_reversal = client.post(
        f"/api/v1/stock/{adjustment_id}/reverse",
        json={"raison": "Seconde tentative"},
        headers=auth_headers,
    )
    assert repeated_adjustment_reversal.status_code == 409


def test_search_and_monthly_report_are_available(client, db_session, auth_headers):
    client_response = client.post("/api/v1/clients", json={"nom_client": "Client Recherche"}, headers=auth_headers)
    product = create_product(client, "Produit Rapport", "service", True, False)
    prior_month_date = date.today().replace(day=1) - timedelta(days=1)
    prior_transaction = client.post("/api/v1/transactions", json={
        "date_transaction": prior_month_date.isoformat(), "date_echeance": prior_month_date.isoformat(),
        "id_produit": product["id_produit"], "quantite": 1, "prix_unitaire": 50,
        "id_client": client_response.json()["id_client"],
    }, headers=auth_headers)
    assert prior_transaction.status_code == 201, prior_transaction.text
    response = client.post("/api/v1/transactions", json={
        "date_transaction": date.today().isoformat(), "id_produit": product["id_produit"], "quantite": 1,
        "prix_unitaire": 125, "id_client": client_response.json()["id_client"],
    }, headers=auth_headers)
    assert response.status_code == 201, response.text

    payment = client.post("/api/v1/paiements", json={
        "id_transaction": response.json()["id_transaction"], "date_paiement": date.today().isoformat(),
        "montant": 25, "type_paiement": "cash",
    }, headers=auth_headers)
    assert payment.status_code == 201, payment.text
    prior_payment = client.post("/api/v1/paiements", json={
        "id_transaction": prior_transaction.json()["id_transaction"], "date_paiement": date.today().isoformat(),
        "montant": 50, "type_paiement": "cash",
    }, headers=auth_headers)
    assert prior_payment.status_code == 201, prior_payment.text
    current_row = db_session.query(Transaction).filter(
        Transaction.id_transaction == response.json()["id_transaction"]
    ).one()
    assert remaining_amount_as_of(current_row, date.today()) == Decimal("100.00")
    account = CompteBancaire(nom_banque="Banque Rapport", numero_compte="REPORT-001")
    db_session.add(account)
    db_session.flush()
    db_session.add(MouvementBancaire(
        id_compte=account.id_compte, montant=Decimal("80.00"), type_mouvement="ENTREE",
        source="initial", statut="active",
    ))
    db_session.commit()

    search = client.get("/api/v1/search", params={"q": "Rapport"}, headers=auth_headers)
    assert search.status_code == 200
    assert any(item["kind"] == "produit" for item in search.json()["results"])
    prior_report = client.get("/api/v1/reports/monthly", params={"month": prior_month_date.strftime("%Y-%m")}, headers=auth_headers)
    assert prior_report.status_code == 200, prior_report.text
    assert prior_report.json()["creances"] == "50.00"
    report = client.get("/api/v1/reports/monthly", params={"month": date.today().strftime("%Y-%m")}, headers=auth_headers)
    assert report.status_code == 200, report.text
    assert report.json()["ventes"] == "125.00"
    assert report.json()["creances"] == "100.00"
    assert report.json()["solde_caisse"] == "75.00"
    assert report.json()["soldes_bancaires"][0]["solde"] == "80.00"
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
    charge_corrections = db_session.query(CorrectionFinanciere).filter(
        CorrectionFinanciere.type_entite == "charge",
        CorrectionFinanciere.id_entite == charge_id,
    ).all()
    assert any(
        correction.id_mouvement_original == voided.id_mouvement
        and correction.id_mouvement_inverse == replacement.id_mouvement
        for correction in charge_corrections
    )


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


def test_charge_cancellation_links_original_and_reversal_in_charge_audit(
    client, db_session, auth_headers, test_user
):
    from app.main import app

    app.dependency_overrides[get_current_active_user] = lambda: test_user
    created = client.post(
        "/api/v1/charges",
        json={
            "libelle": "Charge à annuler",
            "montant": 75,
            "date_charge": date.today().isoformat(),
            "categorie": "Fixe",
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    charge_id = created.json()["id_charge"]
    original = db_session.query(Caisse).filter(Caisse.id_charge == charge_id).one()

    cancelled = client.delete(
        f"/api/v1/charges/{charge_id}",
        params={"raison": "Charge saisie en double"},
        headers=auth_headers,
    )
    assert cancelled.status_code == 204, cancelled.text

    db_session.expire_all()
    rows = db_session.query(Caisse).filter(Caisse.id_charge == charge_id).all()
    assert len(rows) == 2
    reversal = next(row for row in rows if row.id_mouvement != original.id_mouvement)
    assert original.statut == "annule"
    assert reversal.statut == "annule"
    assert original.id_mouvement_inverse == reversal.id_mouvement
    assert reversal.id_mouvement_inverse == original.id_mouvement

    correction = db_session.query(CorrectionFinanciere).filter(
        CorrectionFinanciere.type_entite == "charge",
        CorrectionFinanciere.id_entite == charge_id,
        CorrectionFinanciere.action == "annulation",
        CorrectionFinanciere.id_mouvement_original == original.id_mouvement,
    ).one()
    assert correction.id_mouvement_inverse == reversal.id_mouvement
    assert correction.id_utilisateur == test_user.id_utilisateur
    assert correction.raison == "Charge saisie en double"


def test_unified_search_matches_transaction_identifier(client, auth_headers):
    client_row = client.post(
        "/api/v1/clients",
        json={"nom_client": "Client Recherche Transaction"},
        headers=auth_headers,
    )
    assert client_row.status_code == 201, client_row.text
    product = create_product(client, "Produit Recherche Transaction", "service", True, False)
    transaction_ids = []
    for _ in range(10):
        created = client.post(
            "/api/v1/transactions",
            json={
                "date_transaction": date.today().isoformat(),
                "id_produit": product["id_produit"],
                "quantite": 1,
                "prix_unitaire": 25,
                "id_client": client_row.json()["id_client"],
            },
            headers=auth_headers,
        )
        assert created.status_code == 201, created.text
        transaction_ids.append(created.json()["id_transaction"])

    transaction_id = next(value for value in transaction_ids if value >= 10)
    response = client.get(
        "/api/v1/search",
        params={"q": str(transaction_id), "scope": "transactions"},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert any(
        item["kind"] == "transaction" and item["id"] == transaction_id
        for item in response.json()["results"]
    )


def test_manual_bank_movement_uses_shared_ledger_and_is_idempotent(
    client, db_session, auth_headers
):
    account = client.post(
        "/api/v1/comptes-bancaires",
        json={
            "nom_banque": "Banque Ledger",
            "numero_compte": "LEDGER-001",
            "solde_initial": 100,
        },
        headers=auth_headers,
    )
    assert account.status_code == 201, account.text
    account_id = account.json()["id_compte"]
    payload = {
        "montant": 25,
        "type_mouvement": "ENTREE",
        "source": "autre",
        "reference": "DEPOT-001",
        "cle_idempotence": "bank-movement-ledger-001",
    }

    first = client.post(
        f"/api/v1/comptes-bancaires/{account_id}/mouvements",
        json=payload,
        headers=auth_headers,
    )
    second = client.post(
        f"/api/v1/comptes-bancaires/{account_id}/mouvements",
        json=payload,
        headers=auth_headers,
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 200, second.text
    assert second.json()["id_mouvement"] == first.json()["id_mouvement"]
    account_row = db_session.query(CompteBancaire).filter(
        CompteBancaire.id_compte == account_id,
    ).one()
    assert account_row.solde_actuel == Decimal("125.00")
    assert db_session.query(MouvementBancaire).filter(
        MouvementBancaire.cle_idempotence == payload["cle_idempotence"],
    ).count() == 1
    assert not any(
        issue["code"] == "BANK_BALANCE_MISMATCH"
        for issue in run_integrity_check(db_session)
    )
