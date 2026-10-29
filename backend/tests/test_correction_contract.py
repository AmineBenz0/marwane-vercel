from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from app.models.correction_operation import CorrectionOperation
from app.schemas.correction import CorrectionEnvelope, CorrectionTarget
from app.services.correction_contract import lock_expected_revision, replay_result, request_fingerprint


def test_validated_contract_rejects_blank_reason_and_invalid_version():
    with pytest.raises(ValidationError):
        CorrectionEnvelope(operation_id=uuid4(), reason="   ", target={"entity_type":"transaction", "entity_id":1,"expected_version":1})
    with pytest.raises(ValidationError):
        CorrectionTarget(entity_type="transaction", entity_id=1, expected_version=0)


def test_fingerprint_preserves_exact_decimal_and_dictionary_order():
    class Request(BaseModel):
        values: dict[str, Decimal]
    a = Request(values={"a":Decimal("9007199254740993.01"),"b":Decimal("2")})
    b = Request(values={"b":Decimal("2"),"a":Decimal("9007199254740993.01")})
    c = Request(values={"a":Decimal("9007199254740993.02"),"b":Decimal("2")})
    assert request_fingerprint(a) == request_fingerprint(b)
    assert request_fingerprint(a) != request_fingerprint(c)


def test_operation_replay_checks_actor_and_payload_without_writes(db_session, test_user):
    operation_id = uuid4()
    assert replay_result(db_session, operation_id, "a"*64, test_user.id_utilisateur) is None
    db_session.add(CorrectionOperation(operation_id=operation_id, request_hash="a"*64,
        id_utilisateur=test_user.id_utilisateur, reason="Correction", request_payload={}, result_payload={"saved":True}))
    db_session.commit()
    assert replay_result(db_session, operation_id,"a"*64,test_user.id_utilisateur)=={"saved":True}
    for fingerprint, actor in [("b"*64,test_user.id_utilisateur),("a"*64,test_user.id_utilisateur+1)]:
        with pytest.raises(HTTPException) as error:
            replay_result(db_session, operation_id, fingerprint, actor)
        assert error.value.status_code == 409
    assert not db_session.dirty and not db_session.new


def test_missing_target_is_404(db_session):
    with pytest.raises(HTTPException) as error:
        lock_expected_revision(db_session, CorrectionTarget(entity_type="paiement",entity_id=999,expected_version=1))
    assert error.value.status_code == 404
