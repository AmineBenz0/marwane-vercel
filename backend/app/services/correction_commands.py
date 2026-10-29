"""Atomic, revision-checked correction preview/apply command.

This first adapter slice intentionally permits only transaction due-date and
payment-note changes. Money, transaction dates, funding, and inventory changes
stay disabled until their domain adapters are implemented.
"""
from copy import deepcopy
from datetime import date, datetime
from decimal import Decimal
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.correction_operation import CorrectionOperation
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionCommand, CorrectionPreviewRead
from app.services.correction_contract import (
    lock_expected_revision,
    replay_result,
    request_fingerprint,
)


_MODELS = {"transaction": Transaction, "paiement": Paiement}
_IDS = {"transaction": "id_transaction", "paiement": "id_paiement"}


def _snapshot(entity_type: str, record) -> dict:
    return {
        column.name: _json_value(getattr(record, column.name))
        for column in _MODELS[entity_type].__table__.columns
    }


def _json_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    return value


def _normalize_and_validate(command: CorrectionCommand, record) -> dict:
    entity_type = command.target.entity_type
    requested = command.changes.model_dump(exclude_unset=True)
    allowed = {"date_echeance"} if entity_type == "transaction" else {"notes"}
    if not requested or set(requested) - allowed:
        raise HTTPException(422, "Un ou plusieurs champs ne sont pas encore disponibles pour la correction.")

    if entity_type == "transaction" and requested.get("date_echeance") is not None:
        if requested["date_echeance"] < record.date_transaction:
            raise HTTPException(422, "La date d’échéance ne peut pas précéder la date de transaction.")

    return {key: _json_value(value) for key, value in requested.items()}


def _impact(entity_type: str) -> dict:
    impact = {
        "cash": "unchanged",
        "bank": "unchanged",
        "stock": "unchanged",
    }
    impact["overdue_follow_up" if entity_type == "transaction" else "payment_note"] = (
        "recalculated from the corrected due date" if entity_type == "transaction" else "updated"
    )
    return impact


def _dependency_fingerprint(entity_type: str, entity_id: int, revision: int, changes: dict) -> str:
    canonical = json.dumps(
        {"entity_type": entity_type, "entity_id": entity_id,
         "revision": revision, "changes": changes},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False,
    )
    return sha256(canonical.encode("utf-8")).hexdigest()


def preview_correction(db: Session, command: CorrectionCommand) -> dict:
    model = _MODELS[command.target.entity_type]
    key = getattr(model, _IDS[command.target.entity_type])
    record = db.query(model).filter(key == command.target.entity_id).one_or_none()
    if record is None:
        raise HTTPException(404, "L’enregistrement à corriger est introuvable.")
    if record.row_version != command.target.expected_version:
        raise HTTPException(409, "Cet enregistrement a été modifié. Actualisez-le avant de préparer la correction.")

    changes = _normalize_and_validate(command, record)
    before = _snapshot(command.target.entity_type, record)
    after = deepcopy(before)
    after.update(changes)
    preview = CorrectionPreviewRead(
        operation_id=command.operation_id,
        target=command.target,
        changes=changes,
        before=before,
        after=after,
        impact=_impact(command.target.entity_type),
    ).model_dump(mode="json")
    preview["dependency_fingerprint"] = _dependency_fingerprint(
        command.target.entity_type, command.target.entity_id,
        command.target.expected_version, changes,
    )
    return preview


def apply_correction(db: Session, command: CorrectionCommand, actor) -> dict:
    if actor is None:
        raise HTTPException(401, "Une session authentifiée est nécessaire pour enregistrer une correction.")
    actor_id = actor.id_utilisateur
    request_hash = request_fingerprint(command)

    previous = replay_result(db, command.operation_id, request_hash, actor_id)
    if previous is not None:
        return {**previous, "replayed": True}

    record = lock_expected_revision(db, command.target)
    # A request with the same UUID can have committed while this request waited
    # on the target row lock. Replay before checking the now-advanced version.
    previous = replay_result(db, command.operation_id, request_hash, actor_id)
    if previous is not None:
        return {**previous, "replayed": True}

    changes = _normalize_and_validate(command, record)
    before = _snapshot(command.target.entity_type, record)
    actual_changes = {
        name: value
        for name, value in changes.items()
        if _json_value(getattr(record, name)) != value
    }
    if not actual_changes:
        return {
            "operation_id": str(command.operation_id),
            "replayed": False,
            "target": command.target.model_dump(mode="json"),
            "record": before,
            "impact": _impact(command.target.entity_type),
            "no_op": True,
        }

    expected_after_version = record.row_version + 1
    result = {
        "operation_id": str(command.operation_id),
        "target": command.target.model_dump(mode="json"),
        "record": {
            **before,
            **actual_changes,
            "row_version": expected_after_version,
        },
        "impact": _impact(command.target.entity_type),
    }
    operation = CorrectionOperation(
        operation_id=command.operation_id,
        request_hash=request_hash,
        id_utilisateur=actor_id,
        reason=command.reason,
        request_payload=command.model_dump(mode="json"),
        result_payload=result,
    )
    db.add(operation)
    try:
        db.flush()
    except IntegrityError:
        # Concurrent reuse of an operation UUID is resolved by reading the
        # committed result after rolling back this transaction.
        db.rollback()
        replayed = replay_result(db, command.operation_id, request_hash, actor_id)
        if replayed is not None:
            return {**replayed, "replayed": True}
        raise

    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text("SELECT set_config('app.correction_operation_id', :operation_id, true)"),
            {"operation_id": str(command.operation_id)},
        )

    for name, value in actual_changes.items():
        # Dates are restored from their canonical ISO representation because
        # operation JSON payloads intentionally use JSON-safe scalar values.
        if name == "date_echeance" and value is not None:
            value = date.fromisoformat(value)
        setattr(record, name, value)
    record.id_utilisateur_modification = actor_id
    db.flush()
    db.commit()
    db.refresh(record)
    return {
        **result,
        "replayed": False,
        "record": _snapshot(command.target.entity_type, record),
    }
