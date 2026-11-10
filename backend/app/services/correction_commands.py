"""Conservative audited corrections against the production database contract.

Release 1 intentionally allows only changes that need no stock movement,
cheque/LC handling, or financial ledger rewrite. Do not expand the allowlist
without the corresponding business adapter, immutable history and PG tests.
"""
from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.correction_operation import CorrectionOperation
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand, CorrectionPreviewRead
from app.services.correction_contract import (
    lock_expected_revision, replay_result, request_fingerprint, request_payload,
)

_ALLOWED_TRANSACTION = frozenset({"date_echeance", "prix_unitaire", "id_client"})
_ALLOWED_PAYMENT = frozenset({"notes"})


def _json(value):
    if isinstance(value, datetime):
        value = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    return value


def _snapshot(row):
    return {column.name: _json(getattr(row, column.name)) for column in row.__table__.columns}


def _target_row(db, target, *, lock=False):
    model = Transaction if target.entity_type == "transaction" else Paiement
    key = model.id_transaction if model is Transaction else model.id_paiement
    query = db.query(model).filter(key == target.entity_id).populate_existing()
    if lock:
        query = query.with_for_update()
    row = query.one_or_none()
    if row is None:
        raise HTTPException(404, "L'enregistrement à corriger est introuvable.")
    if row.row_version != target.expected_version:
        raise HTTPException(409, "Cet enregistrement a été modifié. Actualisez avant de corriger.")
    return row


def _dependencies(db, command, row, *, lock=False):
    """Cover payment and contact changes even when the target revision did not change."""
    transaction = row if command.target.entity_type == "transaction" else db.get(Transaction, row.id_transaction)
    if transaction is None:
        raise HTTPException(409, "La transaction associée est introuvable.")
    query = db.query(Paiement).filter(Paiement.id_transaction == transaction.id_transaction).order_by(
        Paiement.id_paiement
    ).populate_existing()
    if lock:
        query = query.with_for_update()
    payments = query.all()
    client = None
    requested_client = command.changes.model_dump(exclude_unset=True).get("id_client")
    if requested_client is not None:
        q = db.query(Client).filter(Client.id_client == requested_client).populate_existing()
        if lock:
            q = q.with_for_update()
        client = q.one_or_none()
    return {
        "transaction": _snapshot(transaction),
        "payments": [_snapshot(p) for p in payments],
        "new_client": _snapshot(client) if client is not None else None,
    }, transaction, payments, client


def _changes(command, row, transaction, payments, client):
    requested = command.changes.model_dump(exclude_unset=True)
    entity = command.target.entity_type
    allowed = _ALLOWED_TRANSACTION if entity == "transaction" else _ALLOWED_PAYMENT
    if not requested or requested.keys() - allowed:
        raise HTTPException(422, "Ce champ nécessite une correction financière ou de stock distincte.")
    if entity == "paiement":
        # Changing only the note cannot touch cash, bank, or instrument state.
        return {"notes": requested["notes"]}
    if not row.est_actif:
        raise HTTPException(409, "Une transaction annulée ne peut pas être modifiée.")
    result = {}
    if "date_echeance" in requested:
        due = requested["date_echeance"]
        if due is not None and due < row.date_transaction:
            raise HTTPException(422, "La date d'échéance ne peut pas précéder la transaction.")
        result["date_echeance"] = due
    if "prix_unitaire" in requested:
        if row.id_client is None or payments:
            raise HTTPException(409, "La correction du prix nécessite une vente sans aucun paiement.")
        price = requested["prix_unitaire"]
        if price is None or price <= 0:
            raise HTTPException(422, "Le prix unitaire doit être positif.")
        total = Decimal(str(price)) * Decimal(row.quantite)
        if total > Decimal("9999999999999.99"):
            raise HTTPException(422, "Montant total trop élevé.")
        result["prix_unitaire"] = price
        result["montant_total"] = total
    if "id_client" in requested:
        if row.id_client is None or row.est_promesse or payments:
            raise HTTPException(409, "Le client ne peut être changé ici que pour une vente non réglée, hors livraison différée.")
        if client is None or not client.est_actif:
            raise HTTPException(422, "Le client sélectionné est introuvable ou inactif.")
        result["id_client"] = requested["id_client"]
    return result


def _impact(command, row, transaction, payments, changes):
    total = Decimal(str(changes.get("montant_total", transaction.montant_total)))
    paid = sum((Decimal(str(p.montant)) for p in payments if p.est_effectif), Decimal("0"))
    return {
        "cash": "unchanged", "bank": "unchanged", "stock": "unchanged",
        "balance": {
            "total": _json(total), "paid": _json(paid),
            "remaining": _json(total - paid),
            "side": "client" if transaction.id_client is not None else "fournisseur",
        },
    }


def _fingerprint(command, changes, dependencies):
    payload = {
        "target": command.target.model_dump(mode="json"),
        "changes": {k: _json(v) for k, v in sorted(changes.items())},
        "dependencies": dependencies,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return sha256(canonical.encode("utf-8")).hexdigest()


def preview_correction(db: Session, command: CorrectionCommand) -> dict:
    row = _target_row(db, command.target)
    dependencies, transaction, payments, client = _dependencies(db, command, row)
    changes = _changes(command, row, transaction, payments, client)
    before = _snapshot(row)
    after = {**before, **{name: _json(value) for name, value in changes.items()}}
    return CorrectionPreviewRead(
        operation_id=command.operation_id, target=command.target,
        changes={name: _json(value) for name, value in changes.items()},
        before=before, after=after,
        impact=_impact(command, row, transaction, payments, changes),
        dependency_fingerprint=_fingerprint(command, changes, dependencies),
    ).model_dump(mode="json")


def apply_correction(db: Session, command: CorrectionApplyCommand, actor) -> dict:
    if actor is None:
        raise HTTPException(401, "Une session authentifiée est nécessaire.")
    actor_id = actor.id_utilisateur
    request_hash = request_fingerprint(command)
    previous = replay_result(db, command.operation_id, request_hash, actor_id)
    if previous is not None:
        return {**previous, "replayed": True}

    # Lock the parent first, including when only payment notes change. A payment
    # insertion acquires an FK key-share lock on the parent on PostgreSQL, so
    # taking FOR UPDATE serializes it against price/client corrections.
    if command.target.entity_type == "paiement":
        payment = db.query(Paiement).filter(
            Paiement.id_paiement == command.target.entity_id
        ).one_or_none()
        if payment is None:
            raise HTTPException(404, "Paiement introuvable.")
        db.query(Transaction).filter(
            Transaction.id_transaction == payment.id_transaction
        ).with_for_update().one()
    row = lock_expected_revision(db, command.target)
    previous = replay_result(db, command.operation_id, request_hash, actor_id)
    if previous is not None:
        return {**previous, "replayed": True}
    dependencies, transaction, payments, client = _dependencies(db, command, row, lock=True)
    changes = _changes(command, row, transaction, payments, client)
    if command.dependency_fingerprint != _fingerprint(command, changes, dependencies):
        raise HTTPException(409, "Les données ont changé depuis l'aperçu. Actualisez avant de confirmer.")

    actual = {name: value for name, value in changes.items() if getattr(row, name) != value}
    before = _snapshot(row)
    impact = _impact(command, row, transaction, payments, changes)
    if not actual:
        return {
            "operation_id": str(command.operation_id), "replayed": False,
            "target": command.target.model_dump(mode="json"),
            "record": before, "impact": impact, "no_op": True,
        }
    modified_at = datetime.now(timezone.utc)
    after = {
        **before, **{name: _json(value) for name, value in actual.items()},
        "row_version": row.row_version + 1,
        "date_modification": _json(modified_at),
        "id_utilisateur_modification": actor_id,
    }
    result = {
        "operation_id": str(command.operation_id),
        "target": command.target.model_dump(mode="json"),
        "record": after,
        "impact": impact,
    }
    operation = CorrectionOperation(
        operation_id=command.operation_id,
        request_hash=request_hash,
        id_utilisateur=actor_id, reason=command.reason,
        request_payload=request_payload(command),
        result_payload=result,
    )
    db.add(operation)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        previous = replay_result(db, command.operation_id, request_hash, actor_id)
        if previous is not None:
            return {**previous, "replayed": True}
        raise

    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT set_config('app.correction_operation_id', :id, true)"), {"id": str(command.operation_id)})
    for name, value in actual.items():
        setattr(row, name, value)
    row.id_utilisateur_modification = actor_id
    row.date_modification = modified_at
    db.flush()
    db.refresh(row)
    if _snapshot(row) != after:
        db.rollback()
        raise HTTPException(409, "Le résultat enregistré ne correspond pas à l'aperçu.")
    db.commit()
    return {**deepcopy(result), "replayed": False}
