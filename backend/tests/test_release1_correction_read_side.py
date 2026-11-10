"""Release 1 read-side guardrails; no financial correction writer is exposed."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.routers import corrections
from app.schemas.paiement import PaiementRead
from app.schemas.transaction import TransactionRead


class _FakeDB:
    def __init__(self, transaction):
        self.transaction = transaction
        self.calls = []

    def get(self, model, record_id):
        self.calls.append((model, record_id))
        return self.transaction


def test_release1_routes_are_scoped_and_authenticated():
    routes = {(route.path, method) for route in corrections.router.routes
              for method in getattr(route, "methods", [])}
    assert routes == {
        ("/corrections/history", "GET"),
        ("/corrections/preview", "POST"),
        ("/corrections/apply", "POST"),
    }
    from app.utils.dependencies import get_current_active_user
    for route in corrections.router.routes:
        assert get_current_active_user in [dep.call for dep in route.dependant.dependencies]


def test_read_side_rejects_missing_transaction():
    db = _FakeDB(None)
    with pytest.raises(HTTPException) as exc:
        corrections.history(transaction_id=17, offset=0, limit=20,
                            db=db, current_user=SimpleNamespace(id_utilisateur=1))
    assert exc.value.status_code == 404
    assert db.calls == [(Transaction, 17)]


def test_read_side_paginates_existing_transaction(monkeypatch):
    expected = {"items": [], "names": {}, "has_more": False, "next_offset": 10}
    db = _FakeDB(SimpleNamespace(id_transaction=17))
    calls = []

    def fake_history(session, transaction_id, *, offset, limit):
        calls.append((session, transaction_id, offset, limit))
        return expected

    monkeypatch.setattr(corrections, "transaction_correction_history", fake_history)
    actual = corrections.history(transaction_id=17, offset=10, limit=20,
                                 db=db, current_user=SimpleNamespace(id_utilisateur=1))
    assert actual is expected
    assert calls == [(db, 17, 10, 20)]


def test_transaction_and_payment_revisions_match_sql_foundation():
    for model in (Transaction, Paiement):
        assert "row_version" in model.__table__.columns
        column = model.__table__.columns["row_version"]
        assert not column.nullable
        assert column.server_default.arg == "1"
    assert "row_version" in TransactionRead.model_fields
    assert "row_version" in PaiementRead.model_fields


def test_unapproved_correction_write_routes_are_disabled(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "ENABLE_CORRECTION_WRITES", False)
    body = {
        "operation_id": "8cac2f45-1d41-41cf-979d-736d8b3cc493",
        "reason": "Correction test",
        "target": {"entity_type": "transaction", "entity_id": 9999, "expected_version": 1},
        "changes": {"date_echeance": "2026-11-30"},
    }
    preview = client.post("/api/v1/corrections/preview", json=body)
    assert preview.status_code == 503
    apply = client.post("/api/v1/corrections/apply", json={
        **body, "dependency_fingerprint": "a" * 64,
    })
    assert apply.status_code == 503
