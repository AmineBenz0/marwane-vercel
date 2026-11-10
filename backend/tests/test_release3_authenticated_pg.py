"""Authenticated Release 3 lifecycle acceptance on DISPOSABLE native PostgreSQL.

CI must create and migrate a localhost PostgreSQL database first, and use an
ephemeral user. This test refuses non-local or non-testing database targets.
"""
import os
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4
from urllib.parse import urlsplit

import pytest

# Fail closed at module collection time. The ordinary SQLite test run should
# skip this native acceptance; a misconfigured non-local URL must never reach
# the db_session fixture, which creates and drops test tables.
_native_target = urlsplit(os.getenv("TEST_DATABASE_URL", ""))
if (
    not _native_target.scheme.startswith("postgresql")
    or _native_target.hostname not in {"localhost", "127.0.0.1"}
    or _native_target.path != "/comptabilite_db"
    or os.getenv("ENVIRONMENT") != "testing"
):
    pytest.skip("Release 3 authenticated acceptance requires disposable local PostgreSQL", allow_module_level=True)

from app.config import settings
from app.models.caisse import Caisse
from app.models.cession_lc import CessionLC
from app.models.client import Client
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.fournisseur import Fournisseur
from app.models.lettre_credit import LettreDeCredit
from app.models.lettre_credit_utilisation import LettreCreditUtilisation
from app.models.paiement import Paiement
from app.models.transaction import Transaction


def _assert_disposable_native(db_session):
    database_url = os.getenv("TEST_DATABASE_URL", "")
    url = urlsplit(database_url)
    assert url.scheme.startswith("postgresql")
    assert url.hostname in {"localhost", "127.0.0.1"}
    assert url.path == "/comptabilite_db"
    assert os.getenv("ENVIRONMENT") == "testing"
    assert db_session.bind.dialect.name == "postgresql"
    assert settings.ENABLE_AUTH is True


def test_authenticated_lc_transfer_cancel_reuse_and_bank_deposit(
    client, db_session, test_user, test_produit, auth_headers
):
    _assert_disposable_native(db_session)
    assert auth_headers.get("Authorization", "").startswith("Bearer ")
    assert client.get("/api/v1/lettres-credit").status_code == 401

    holder = Client(nom_client="Release3 CI origin")
    supplier = Fournisseur(nom_fournisseur="Release3 CI supplier")
    account = CompteBancaire(
        nom_banque="Release3 CI bank", numero_compte="R3-CI-NATIVE-001",
        solde_actuel=0,
    )
    db_session.add_all([holder, supplier, account])
    db_session.commit()
    today = date.today()

    def new_lc(reference):
        response = client.post("/api/v1/lettres-credit", headers=auth_headers, json={
            "numero_reference": reference,
            "montant": "350.00",
            "date_emission": (today - timedelta(days=8)).isoformat(),
            "date_reception": (today - timedelta(days=3)).isoformat(),
            "date_disponibilite": (today - timedelta(days=2)).isoformat(),
            "id_client": holder.id_client,
        })
        assert response.status_code == 201, response.text
        data = response.json()
        assert data["id_client_origine"] == holder.id_client
        assert data["statut_cycle"] == "detenue"
        assert data["version_utilisation"] == 0
        return data["id_lc"]

    first = new_lc("R3-CI-AUTH-TRANSFER")
    fetched = client.get(f"/api/v1/lettres-credit/{first}", headers=auth_headers)
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["id_client_origine"] == holder.id_client

    def transfer(version):
        return client.post(
            f"/api/v1/lettres-credit/{first}/payer-fournisseur",
            headers=auth_headers,
            json={
                "id_fournisseur": supplier.id_fournisseur,
                "date_cession": today.isoformat(),
                "version_utilisation": version,
            },
        )

    def cancel(lc_id, version):
        return client.post(
            f"/api/v1/lettres-credit/{lc_id}/annuler",
            headers=auth_headers,
            json={"raison": "Release 3 test cancellation", "version_utilisation": version},
        )

    used = transfer(0)
    assert used.status_code == 200, used.text
    assert used.json()["statut_cycle"] == "transferee"
    assert used.json()["version_utilisation"] == 1
    assert db_session.query(CessionLC).filter_by(id_lc=first).count() == 1
    assert db_session.query(LettreCreditUtilisation).filter_by(
        id_lc=first, statut="active"
    ).count() == 1
    assert db_session.query(Caisse).filter(Caisse.id_cession.isnot(None)).count() == 0

    undone = cancel(first, 1)
    assert undone.status_code == 200, undone.text
    assert undone.json()["statut_cycle"] == "detenue"
    assert db_session.query(LettreCreditUtilisation).filter_by(
        id_lc=first, statut="active"
    ).count() == 0

    used_again = transfer(1)
    assert used_again.status_code == 200, used_again.text
    assert used_again.json()["version_utilisation"] == 2
    assert cancel(first, 1).status_code == 409
    undone_again = cancel(first, 2)
    assert undone_again.status_code == 200, undone_again.text
    assert db_session.query(LettreCreditUtilisation).filter_by(
        id_lc=first, statut="annulee"
    ).count() == 2

    second = new_lc("R3-CI-AUTH-DEPOSIT")
    deposited = client.post(
        f"/api/v1/lettres-credit/{second}/verser-banque",
        headers=auth_headers,
        json={"id_compte": account.id_compte, "version_utilisation": 0},
    )
    assert deposited.status_code == 200, deposited.text
    assert deposited.json()["statut_cycle"] == "deposee"
    db_session.refresh(account)
    assert account.solde_actuel == 350
    assert db_session.query(MouvementBancaire).filter_by(
        source="lc", statut="active"
    ).count() == 1
    assert db_session.query(Caisse).filter(Caisse.id_cession.isnot(None)).count() == 0
    undone_deposit = cancel(second, 1)
    assert undone_deposit.status_code == 200, undone_deposit.text
    db_session.refresh(account)
    assert account.solde_actuel == 0
    assert db_session.query(MouvementBancaire).filter_by(
        source="lc", statut="active"
    ).count() == 0
    assert db_session.query(Paiement).filter_by(id_lc=second).count() == 0


    # Complete an authenticated receipt/payment batch on the same migrated DB.
    today = date.today()
    holder = Client(nom_client="Release3 CI receipt origin")
    db_session.add(holder)
    db_session.commit()

    response = client.post("/api/v1/lettres-credit", headers=auth_headers, json={
        "numero_reference": "R3-CI-AUTH-RECEIPT",
        "montant": "100.00",
        "date_emission": (today - timedelta(days=4)).isoformat(),
        "date_reception": (today - timedelta(days=2)).isoformat(),
        "date_disponibilite": (today - timedelta(days=1)).isoformat(),
        "id_client": holder.id_client,
    })
    assert response.status_code == 201, response.text
    lc_id = response.json()["id_lc"]

    batch = client.post("/api/v1/transactions/batch-with-payments", headers=auth_headers, json={
        "items": [{
            "client_ref": "received-LC",
            "transaction": {
                "date_transaction": today.isoformat(),
                "id_produit": test_produit.id_produit,
                "quantite": 1,
                "prix_unitaire": "100.00",
                "id_client": holder.id_client,
            },
            "paiements": [{
                "date_paiement": today.isoformat(),
                "montant": "100.00",
                "type_paiement": "lc",
                "id_lc": lc_id,
            }],
        }],
    })
    assert batch.status_code == 201, batch.text
    payment_id = batch.json()[0]["paiements"][0]["id_paiement"]
    receipt = db_session.get(Paiement, payment_id)
    assert receipt.role_lc == "reception"
    assert receipt.montant == 100
    assert db_session.query(Caisse).filter_by(
        id_paiement=payment_id, statut="active"
    ).count() == 0
    db_session.refresh(db_session.get(LettreDeCredit, lc_id))
    assert db_session.get(LettreDeCredit, lc_id).statut_cycle == "detenue"

    # Real authenticated cheque preview/apply: pending -> cleared -> rejected.
    # The effective clearing date, not the cheque's issue date, controls ledger.
    cheque_tx = Transaction(
        date_transaction=today - timedelta(days=4),
        date_echeance=today + timedelta(days=4),
        id_client=holder.id_client, id_produit=test_produit.id_produit,
        quantite=1, prix_unitaire=Decimal("100.00"),
        montant_total=Decimal("100.00"), est_actif=True,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(cheque_tx)
    db_session.commit()
    pending = client.post("/api/v1/paiements", headers=auth_headers, json={
        "id_transaction": cheque_tx.id_transaction,
        "date_paiement": (today - timedelta(days=3)).isoformat(),
        "montant": "100.00", "type_paiement": "cheque",
        "numero_cheque": "R3-CI-AUTH-CHEQUE",
        "statut_cheque": "a_encaisser",
        "date_encaissement_prevue": (today - timedelta(days=1)).isoformat(),
    })
    assert pending.status_code == 201, pending.text
    cheque_id = pending.json()["id_paiement"]
    assert db_session.get(Paiement, cheque_id).statut == "en_attente"
    assert db_session.query(Caisse).filter_by(
        id_paiement=cheque_id, statut="active"
    ).count() == 0

    def correct_cheque(changes):
        db_session.expire_all()
        payment = db_session.get(Paiement, cheque_id)
        command = {
            "operation_id": str(uuid4()),
            "reason": "Test de correction du chèque",
            "target": {
                "entity_type": "paiement", "entity_id": cheque_id,
                "expected_version": payment.row_version,
            },
            "changes": changes,
        }
        preview = client.post("/api/v1/corrections/preview",
                              headers=auth_headers, json=command)
        assert preview.status_code == 200, preview.text
        confirmed = {
            **command,
            "dependency_fingerprint": preview.json()["dependency_fingerprint"],
        }
        applied = client.post("/api/v1/corrections/apply",
                              headers=auth_headers, json=confirmed)
        assert applied.status_code == 200, applied.text
        replayed = client.post("/api/v1/corrections/apply",
                               headers=auth_headers, json=confirmed)
        assert replayed.status_code == 200, replayed.text
        assert replayed.json()["replayed"] is True
        return applied.json()

    correct_cheque({
        "statut_cheque": "encaisse",
        "date_encaissement_effective": (today - timedelta(days=1)).isoformat(),
    })
    db_session.expire_all()
    assert db_session.get(Paiement, cheque_id).statut == "valide"
    active = db_session.query(Caisse).filter_by(
        id_paiement=cheque_id, statut="active"
    ).one()
    assert active.date_mouvement.date() == today - timedelta(days=1)
    assert active.montant == Decimal("100.00")

    correct_cheque({"statut_cheque": "rejete"})
    db_session.expire_all()
    assert db_session.get(Paiement, cheque_id).statut == "rejete"
    assert db_session.query(Caisse).filter_by(
        id_paiement=cheque_id, statut="active"
    ).count() == 0
    assert db_session.query(Caisse).filter_by(
        id_paiement=cheque_id, statut="annule"
    ).count() >= 1
