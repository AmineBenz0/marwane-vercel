"""Primitives for a single caller-owned transaction; these never commit or unlock.

The future orchestrator must normalize domain values before hashing, lock related
records in a consistent order, and handle racing operation inserts atomically.
"""
from copy import deepcopy
from hashlib import sha256
import json
from uuid import UUID
from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.models.correction_operation import CorrectionOperation
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionTarget


def request_fingerprint(request: BaseModel) -> str:
    """Hash validated JSON without converting exact decimal values to floats."""
    canonical = json.dumps(request.model_dump(mode="json"), sort_keys=True,
                           separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return sha256(canonical.encode("utf-8")).hexdigest()


def replay_result(db: Session, operation_id: UUID, request_hash: str, actor_id: int) -> dict | None:
    operation = db.get(CorrectionOperation, operation_id)
    if operation is None:
        return None
    if operation.id_utilisateur != actor_id or operation.request_hash != request_hash:
        raise HTTPException(409, "Cette correction a déjà été utilisée avec une autre demande.")
    return deepcopy(operation.result_payload)


def lock_expected_revision(db: Session, target: CorrectionTarget) -> Transaction | Paiement:
    model = Transaction if target.entity_type == "transaction" else Paiement
    key = model.id_transaction if model is Transaction else model.id_paiement
    # Refresh even when this Session already loaded a stale ORM instance.
    record = db.query(model).filter(key == target.entity_id).populate_existing().with_for_update().one_or_none()
    if record is None:
        raise HTTPException(404, "L’enregistrement à corriger est introuvable.")
    if record.row_version != target.expected_version:
        raise HTTPException(409, "Cet enregistrement a été modifié. Actualisez-le avant de corriger.")
    return record
