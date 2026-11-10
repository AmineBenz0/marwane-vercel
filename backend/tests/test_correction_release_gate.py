"""Reject staged correction writers unless deliberately activated.

Independent of browser state, invalid requests must never mutate the financial
or stock ledger before the production migration and release gate are approved.
"""
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers.corrections import _require_correction_release
from app.schemas.correction import CorrectionCommand


def command(entity_type="transaction", **changes):
    return CorrectionCommand(
        operation_id=uuid4(),
        reason="Release gate test",
        target={"entity_type": entity_type, "entity_id": 1, "expected_version": 1},
        changes=changes,
    )


def test_writes_fail_closed_by_default(monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_CORRECTION_WRITES", False)
    with pytest.raises(HTTPException) as error:
        _require_correction_release(None, command(date_echeance="2026-12-01"))
    assert error.value.status_code == 503


@pytest.mark.parametrize("changes", [
    {"statut_cheque": "encaisse"},
    {"date_encaissement_effective": "2026-12-01"},
])
def test_advanced_cheque_corrections_allowed_when_enabled(monkeypatch, changes):
    monkeypatch.setattr(settings, "ENABLE_CORRECTION_WRITES", True)
    db = SimpleNamespace(get=lambda model, entity_id:
                         SimpleNamespace(type_paiement="cheque", id_lc=None))
    _require_correction_release(db, command("paiement", **changes))


@pytest.mark.parametrize("payment", [
    SimpleNamespace(type_paiement="lc", id_lc=3),
    SimpleNamespace(type_paiement="cash", id_lc=3),
])
def test_lc_linked_payment_cannot_bypass_instrument_release_gate(monkeypatch, payment):
    monkeypatch.setattr(settings, "ENABLE_CORRECTION_WRITES", True)
    db = SimpleNamespace(get=lambda model, entity_id: payment)
    with pytest.raises(HTTPException) as error:
        _require_correction_release(db, command("paiement", montant="12.00"))
    assert error.value.status_code == 422


def test_ordinary_payment_command_allowed_only_when_released(monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_CORRECTION_WRITES", True)
    db = SimpleNamespace(get=lambda model, entity_id:
                         SimpleNamespace(type_paiement="cash", id_lc=None))
    _require_correction_release(db, command("paiement", notes="Référence corrigée"))
