"""Release 2 is explicitly enabled only after credit/refund migration approval."""
import pytest
from fastapi import HTTPException
from app.config import settings
from app.routers.credits import _require_release as credits_gate
from app.routers.refunds import _require_release as refunds_gate


@pytest.mark.parametrize("gate", [credits_gate, refunds_gate])
def test_credit_refund_writes_disabled_without_release_flag(monkeypatch, gate):
    monkeypatch.setattr(settings, "ENABLE_CREDIT_REFUND_WRITES", False)
    with pytest.raises(HTTPException) as exc:
        gate()
    assert exc.value.status_code == 503


@pytest.mark.parametrize("gate", [credits_gate, refunds_gate])
def test_credit_refund_release_gate_allows_explicit_activation(monkeypatch, gate):
    monkeypatch.setattr(settings, "ENABLE_CREDIT_REFUND_WRITES", True)
    assert gate() is None
