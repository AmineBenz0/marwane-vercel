from datetime import date, timedelta
from decimal import Decimal

from app.models.caisse import Caisse
from app.models.client import Client
from app.models.lettre_credit import LettreDeCredit
from app.models.paiement import Paiement
from app.models.transaction import Transaction


def _client(db_session):
    client = Client(nom_client="Atomic transaction client", est_actif=True)
    db_session.add(client)
    db_session.commit()
    db_session.refresh(client)
    return client


def _payload(client, produit, *, client_ref="line-1", payment_amount="100.00", lc_id=None):
    payment = {
        "date_paiement": date.today().isoformat(),
        "montant": payment_amount,
        "type_paiement": "lc" if lc_id else "cash",
        "id_lc": lc_id,
    }
    return {
        "items": [{
            "client_ref": client_ref,
            "transaction": {
                "date_transaction": date.today().isoformat(),
                "id_produit": produit.id_produit,
                "quantite": 1,
                "prix_unitaire": payment_amount,
                "id_client": client.id_client,
            },
            "paiements": [payment],
        }],
    }


def _lc(db_session, client, test_user, *, amount="100.00"):
    lc = LettreDeCredit(
        numero_reference="LC-ATOMIC-TEST-001",
        montant=Decimal(amount),
        date_emission=date.today() - timedelta(days=2),
        date_disponibilite=date.today() - timedelta(days=1),
        type_detenteur="client",
        id_client=client.id_client,
        statut="active",
        version_utilisation=0,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(lc)
    db_session.commit()
    db_session.refresh(lc)
    return lc


def test_lc_payment_and_transaction_commit_together(
    client, db_session, test_user, test_produit, auth_headers
):
    holder = _client(db_session)
    lc = _lc(db_session, holder, test_user)
    payload = _payload(holder, test_produit, lc_id=lc.id_lc)

    response = client.post(
        "/api/v1/transactions/batch-with-payments",
        json=payload,
        headers=auth_headers,
    )

    assert response.status_code == 201, response.text
    result = response.json()
    assert result[0]["client_ref"] == "line-1"
    transaction_id = result[0]["transaction"]["id_transaction"]
    payment_id = result[0]["paiements"][0]["id_paiement"]
    assert db_session.query(Transaction).filter_by(id_transaction=transaction_id).count() == 1
    payment = db_session.query(Paiement).filter_by(id_paiement=payment_id).one()
    assert payment.id_transaction == transaction_id
    assert payment.id_lc == lc.id_lc
    db_session.refresh(lc)
    assert lc.statut == "utilisee"
    assert db_session.query(Caisse).filter_by(id_paiement=payment_id, statut="active").count() == 1


def test_invalid_lc_rolls_back_transaction_and_all_ledgers(
    client, db_session, test_produit, auth_headers
):
    holder = _client(db_session)
    payload = _payload(holder, test_produit, lc_id=999999)

    response = client.post(
        "/api/v1/transactions/batch-with-payments",
        json=payload,
        headers=auth_headers,
    )

    assert response.status_code == 404, response.text
    assert db_session.query(Transaction).count() == 0
    assert db_session.query(Paiement).count() == 0
    assert db_session.query(Caisse).count() == 0


def test_pay_later_and_multiple_payments_keep_transaction_mapping(
    client, db_session, test_produit, auth_headers
):
    holder = _client(db_session)
    payload = {
        "items": [
            {
                "client_ref": "paid-line",
                "transaction": {
                    "date_transaction": date.today().isoformat(),
                    "id_produit": test_produit.id_produit,
                    "quantite": 1,
                    "prix_unitaire": "50.00",
                    "id_client": holder.id_client,
                },
                "paiements": [
                    {"date_paiement": date.today().isoformat(), "montant": "20", "type_paiement": "cash"},
                    {"date_paiement": date.today().isoformat(), "montant": "30", "type_paiement": "virement"},
                ],
            },
            {
                "client_ref": "pay-later-line",
                "transaction": {
                    "date_transaction": date.today().isoformat(),
                    "id_produit": test_produit.id_produit,
                    "quantite": 1,
                    "prix_unitaire": "75.00",
                    "id_client": holder.id_client,
                },
                "paiements": [],
            },
        ]
    }

    response = client.post(
        "/api/v1/transactions/batch-with-payments",
        json=payload,
        headers=auth_headers,
    )

    assert response.status_code == 201, response.text
    result = response.json()
    assert [item["client_ref"] for item in result] == ["paid-line", "pay-later-line"]
    paid_transaction_id = result[0]["transaction"]["id_transaction"]
    later_transaction_id = result[1]["transaction"]["id_transaction"]
    assert len(result[0]["paiements"]) == 2
    assert result[1]["paiements"] == []
    assert {
        payment.id_transaction
        for payment in db_session.query(Paiement).all()
    } == {paid_transaction_id}
    assert db_session.query(Transaction).filter_by(id_transaction=later_transaction_id).count() == 1


def test_payment_ledger_failure_rolls_back_transaction(
    client, db_session, test_produit, auth_headers, monkeypatch
):
    holder = _client(db_session)

    def fail_ledger(*args, **kwargs):
        raise RuntimeError("injected ledger failure")

    monkeypatch.setattr(
        "app.routers.transactions.sync_payment_cash_movement",
        fail_ledger,
    )
    response = client.post(
        "/api/v1/transactions/batch-with-payments",
        json=_payload(holder, test_produit),
        headers=auth_headers,
    )

    assert response.status_code == 400, response.text
    assert "injected ledger failure" in response.json()["detail"]
    assert db_session.query(Transaction).count() == 0
    assert db_session.query(Paiement).count() == 0
    assert db_session.query(Caisse).count() == 0
