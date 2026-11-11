"""Release 4 Phase 8: real authenticated FastAPI -> migrated local PostgreSQL.

Runs ONLY on disposable localhost /comptabilite_db in CI, with a generated
test user. It must never connect to Supabase staging or production.
"""
import os
from datetime import date
from decimal import Decimal
from urllib.parse import urlsplit
from uuid import uuid4

import pytest

_target = urlsplit(os.getenv("TEST_DATABASE_URL", ""))
if not (
    _target.scheme.startswith("postgresql")
    and _target.hostname in {"127.0.0.1", "localhost"}
    and _target.path == "/comptabilite_db"
    and os.environ.get("ENVIRONMENT") == "testing"
):
    pytest.skip("Refusing non-disposable PostgreSQL for Release 4 acceptance", allow_module_level=True)

import bcrypt
import psycopg2
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.caisse import Caisse
from app.models.credit import Avance
from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.services.financial_ledger import sync_payment_cash_movement
from tests.test_release4_ledger_pg import _sale


def test_authenticated_quote_cancel_refund_and_audit_on_native_postgres(monkeypatch):
    """Real JWT login, no anonymous write, atomic avoir, explicit single refund."""
    monkeypatch.setattr(settings, "ENABLE_AUTH", True)
    monkeypatch.setattr(settings, "ENABLE_RATE_LIMITING", False)
    monkeypatch.setattr(settings, "ENABLE_DEFERRED_CANCELLATION_WRITES", True)
    monkeypatch.setattr(settings, "ENABLE_CREDIT_REFUND_WRITES", True)

    dburl = os.environ["TEST_DATABASE_URL"]
    with psycopg2.connect(dburl) as conn:
        with conn.cursor() as cur:
            sale = _sale(cur, sellable=True)
            password = "R4-CI-Test-Login-Only-0000!"
            email = f"release4-native-{uuid4().hex[:16]}@example.com"
            digest = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            cur.execute(
                "UPDATE public.utilisateurs SET mot_de_passe_hash=%s, email=%s "
                "WHERE id_utilisateur=%s",
                (digest, email, sale["user"]),
            )

    engine = create_engine(dburl, pool_pre_ping=True)
    def test_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    try:
        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            actor = db.get(Utilisateur, sale["user"])
            payment = Paiement(
                id_transaction=tx.id_transaction, date_paiement=tx.date_transaction,
                montant=Decimal("1500.00"), type_paiement="cash", nature="paiement",
                statut="valide", id_utilisateur_creation=actor.id_utilisateur,
            )
            db.add(payment)
            db.flush()
            sync_payment_cash_movement(db, payment, tx, current_user=actor)
            db.commit()

        with TestClient(app) as client:
            path = f"/api/v1/transactions/{sale['tx']}/cancel-remainder"
            assert client.get(path + "/preview").status_code == 401
            assert client.post(path, json={}).status_code in (401, 422)
            login = client.post("/api/v1/auth/login", json={
                "email": email, "mot_de_passe": password,
            })
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            quote_result = client.get(path + "/preview", headers=headers)
            assert quote_result.status_code == 200, quote_result.text
            q = quote_result.json()
            assert q["expected_version"] > 0
            assert q["quantite_annulee"] == q["quantite_en_attente_attendue"] == 1000
            assert Decimal(str(q["montant_avoir"])) == Decimal("1500.00")
            assert Decimal(str(q["credit_client"])) == Decimal("1500.00")
            with Session(engine) as db:
                assert db.query(DeferredSaleAdjustment).filter_by(
                    id_transaction=sale["tx"],
                ).count() == 0
                assert db.query(Caisse).filter_by(
                    id_transaction=sale["tx"], statut="active",
                ).count() == 1

            command = {
                "operation_id": str(uuid4()),
                "expected_version": q["expected_version"],
                "quantite_en_attente_attendue": q["quantite_en_attente_attendue"],
                "montant_paye_attendu": q["montant_paye"],
                "date_effet_attendue": q["date_effet"],
            }
            res = client.post(path, headers=headers, json=command)
            assert res.status_code == 200, res.text
            assert res.json()["credit_client"] == q["credit_client"]
            assert res.json()["montant_net"] == q["montant_net"]
            repeat = client.post(path, headers=headers, json=command)
            assert repeat.status_code == 200 and repeat.json()["rejoue"] is True
            assert client.get(path + "/preview", headers=headers).status_code == 409
            assert client.post(path, headers=headers, json={
                **command, "operation_id": str(uuid4()),
            }).status_code == 409
            trail = client.get(
                f"/api/v1/transactions/{sale['tx']}/completion-history",
                headers=headers,
            )
            assert trail.status_code == 200, trail.text
            assert trail.json()[-1]["type"] == "cancel_remainder"
            assert Decimal(str(trail.json()[-1]["montant_avoir"])) == Decimal("1500.00")

            with Session(engine) as db:
                tx = db.get(Transaction, sale["tx"])
                assert tx.quantite_en_attente == 0
                assert tx.quantite_annulee == 1000
                assert tx.montant_total == Decimal("1500.00")
                assert tx.montant_net == Decimal("0.00")
                assert tx.montant_paye == Decimal("1500.00")
                assert db.query(DeferredSaleAdjustment).filter_by(
                    id_transaction=tx.id_transaction,
                ).count() == 1
                assert db.query(Caisse).filter_by(
                    id_transaction=tx.id_transaction, statut="active",
                ).count() == 1
                assert db.query(Avance).count() == 0

            money = {
                "operation_id": str(uuid4()), "id_transaction": sale["tx"],
                "date_paiement": date.today().isoformat(),
                "montant": "1500.00", "type_paiement": "cash",
                "reason": "Remboursement après annulation intégrale du reliquat",
            }
            proposal = client.post(
                "/api/v1/remboursements/preview", json=money, headers=headers,
            )
            assert proposal.status_code == 200, proposal.text
            assert Decimal(str(proposal.json()["available_credit"])) == Decimal("1500.00")
            final = client.post("/api/v1/remboursements/apply", json={
                **money,
                "dependency_fingerprint": proposal.json()["dependency_fingerprint"],
            }, headers=headers)
            assert final.status_code == 200, final.text
            assert final.json()["replayed"] is False
            replay = client.post("/api/v1/remboursements/apply", json={
                **money,
                "dependency_fingerprint": proposal.json()["dependency_fingerprint"],
            }, headers=headers)
            assert replay.status_code == 200 and replay.json()["replayed"] is True
            with Session(engine) as db:
                tx = db.get(Transaction, sale["tx"])
                assert tx.montant_restant == Decimal("0.00")
                assert tx.montant_total == Decimal("1500.00")
                assert tx.montant_net == Decimal("0.00")
                assert db.query(Paiement).filter_by(
                    id_transaction=tx.id_transaction, nature="remboursement",
                ).count() == 1
                assert db.query(Caisse).filter_by(
                    id_transaction=tx.id_transaction, statut="active",
                ).count() == 2
                assert db.query(Avance).count() == 0
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()
