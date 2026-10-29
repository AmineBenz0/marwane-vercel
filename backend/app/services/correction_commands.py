"""Atomic, revision-checked correction preview/apply command.

Supported slices include transaction due date/client-sale price and payment
notes/cash date/amount. Purchase valuation, bank/cheque/LC funding, transaction
dates, and inventory quantities await their domain adapters.
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
from app.models.caisse import Caisse
from app.models.compte_bancaire import MouvementBancaire
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionCommand, CorrectionPreviewRead
from app.services.correction_contract import (
    lock_expected_revision,
    replay_result,
    request_fingerprint,
)
from app.services.financial import validate_payment_date
from app.services.financial_ledger import sync_payment_cash_movement


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


def _normalize_and_validate(command: CorrectionCommand, record, *, db: Session, transaction=None) -> dict:
    entity_type = command.target.entity_type
    requested = command.changes.model_dump(exclude_unset=True)
    allowed = {"date_echeance", "prix_unitaire"} if entity_type == "transaction" else {
        "notes", "date_paiement", "montant",
    }
    if not requested or set(requested) - allowed:
        raise HTTPException(422, "Un ou plusieurs champs ne sont pas encore disponibles pour la correction.")

    if entity_type == "transaction" and requested.get("date_echeance") is not None:
        if requested["date_echeance"] < record.date_transaction:
            raise HTTPException(422, "La date d’échéance ne peut pas précéder la date de transaction.")

    if entity_type == "transaction" and "prix_unitaire" in requested:
        if requested["prix_unitaire"] is None:
            raise HTTPException(422, "Le prix unitaire doit être renseigné.")
        if record.id_client is None:
            raise HTTPException(
                409,
                "Le coût d’un achat ne peut pas encore être corrigé ici car il modifie la valorisation du stock.",
            )
        requested["montant_total"] = Decimal(str(record.quantite)) * requested["prix_unitaire"]

    if entity_type == "paiement" and {"date_paiement", "montant"}.intersection(requested):
        if "date_paiement" in requested and requested["date_paiement"] is None:
            raise HTTPException(422, "La date du paiement doit être renseignée.")
        if "montant" in requested and requested["montant"] is None:
            raise HTTPException(422, "Le montant du paiement doit être renseigné.")
        if record.statut == "annule":
            raise HTTPException(409, "Un paiement annulé ne peut plus changer de date ou de montant.")
        if record.type_paiement == "cheque":
            raise HTTPException(409, "La correction des chèques attend la règle de date d’encaissement.")
        if record.type_paiement == "lc" or record.id_lc is not None:
            raise HTTPException(409, "La correction d’un paiement par lettre de crédit attend son adaptateur dédié.")
        if not transaction or not transaction.est_actif:
            raise HTTPException(409, "Le paiement d’une transaction inactive ne peut pas être corrigé.")
        if record.source_reglement == "banque" or (
            record.source_reglement is None
            and record.type_paiement == "virement" and record.id_compte is not None
        ):
            raise HTTPException(409, "La correction des virements bancaires attend la réconciliation du compte.")
        if not record.est_effectif:
            raise HTTPException(409, "Seul un paiement effectif peut changer de date ou de montant.")
        active_cash = db.query(Caisse.id_mouvement).filter(
            Caisse.id_paiement == record.id_paiement, Caisse.statut == "active",
        ).all()
        active_bank = db.query(MouvementBancaire.id_mouvement).filter(
            MouvementBancaire.id_paiement == record.id_paiement,
            MouvementBancaire.statut == "active",
        ).all()
        if len(active_cash) != 1 or active_bank:
            raise HTTPException(409, "L’effet de caisse de ce paiement doit être réconcilié avant sa correction.")
        if "date_paiement" in requested:
            validate_payment_date(
                transaction, requested["date_paiement"],
            )

    return {key: _json_value(value) for key, value in requested.items()}


def _impact(entity_type: str, changes: dict, record=None, transaction=None, db: Session | None = None) -> dict:
    impact = {
        "cash": "unchanged",
        "bank": "unchanged",
        "stock": "unchanged",
    }
    if entity_type == "transaction":
        if "date_echeance" in changes:
            impact["overdue_follow_up"] = "recalculated from the corrected due date"
        if "prix_unitaire" in changes:
            impact["receivable"] = "recalculated from the corrected sale total"
    else:
        impact["payment_note"] = "updated"
        if record is not None and {"date_paiement", "montant"}.intersection(changes):
            old_movement = db.query(Caisse).filter(
                Caisse.id_paiement == record.id_paiement,
                Caisse.statut == "active",
            ).one_or_none()
            old_amount = _json_value(old_movement.montant if old_movement else record.montant)
            old_date = _json_value(old_movement.date_mouvement.date() if old_movement else record.date_paiement)
            direction = "ENTREE" if transaction and transaction.id_client is not None else "SORTIE"
            impact["cash"] = {
                "before": {"date": old_date, "amount": old_amount, "direction": direction},
                "after": {
                    "date": _json_value(changes.get("date_paiement", record.date_paiement)),
                    "amount": changes.get("montant", _json_value(record.montant)),
                    "direction": direction,
                },
            }
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

    transaction = None
    if command.target.entity_type == "paiement":
        transaction = db.query(Transaction).filter(
            Transaction.id_transaction == record.id_transaction,
        ).one_or_none()
    changes = _normalize_and_validate(command, record, db=db, transaction=transaction)
    before = _snapshot(command.target.entity_type, record)
    after = deepcopy(before)
    after.update(changes)
    preview = CorrectionPreviewRead(
        operation_id=command.operation_id,
        target=command.target,
        changes=changes,
        before=before,
        after=after,
        impact=_impact(command.target.entity_type, changes, record, transaction, db),
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

    transaction = None
    if command.target.entity_type == "paiement":
        payment_transaction_id = db.query(Paiement.id_transaction).filter(
            Paiement.id_paiement == command.target.entity_id,
        ).scalar()
        if payment_transaction_id is None:
            raise HTTPException(404, "L’enregistrement à corriger est introuvable.")
        transaction = db.query(Transaction).filter(
            Transaction.id_transaction == payment_transaction_id,
        ).populate_existing().with_for_update().one_or_none()
        if transaction is None:
            raise HTTPException(404, "La transaction associée au paiement est introuvable.")
    try:
        record = lock_expected_revision(db, command.target)
    except HTTPException as exc:
        # A matching operation may commit while this request is waiting on the
        # target lock, advancing its revision. Resolve that retry before
        # returning the otherwise-correct stale-revision conflict.
        if exc.status_code == 409:
            previous = replay_result(db, command.operation_id, request_hash, actor_id)
            if previous is not None:
                return {**previous, "replayed": True}
        raise

    # Also recheck after acquiring the row lock: a concurrent matching request
    # can have committed while the initial operation lookup was in flight.
    previous = replay_result(db, command.operation_id, request_hash, actor_id)
    if previous is not None:
        return {**previous, "replayed": True}

    changes = _normalize_and_validate(command, record, db=db, transaction=transaction)
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
            "impact": _impact(command.target.entity_type, changes, record, transaction, db),
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
        "impact": _impact(command.target.entity_type, actual_changes, record, transaction, db),
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
        if name in {"date_echeance", "date_paiement"} and value is not None:
            value = date.fromisoformat(value)
        elif name in {"prix_unitaire", "montant_total"}:
            value = Decimal(value)
        setattr(record, name, value)
    record.id_utilisateur_modification = actor_id
    if command.target.entity_type == "paiement" and {"date_paiement", "montant"}.intersection(actual_changes):
        sync_payment_cash_movement(
            db,
            record,
            transaction,
            current_user=actor,
            reason=command.reason,
            operation_id=command.operation_id,
        )
    db.flush()
    db.commit()
    db.refresh(record)
    return {
        **result,
        "replayed": False,
        "record": _snapshot(command.target.entity_type, record),
    }
