"""Preview and atomically record positive-valued cash/bank refunds.

The parent transaction serializes every financial writer. The original payment
and its movement are never modified by a refund. The existing immutable operation
journal persists the exact saved response for ambiguous-response retries.
"""
from copy import deepcopy
from datetime import date, datetime
from decimal import Decimal
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.correction_operation import CorrectionOperation
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.paiement import PaiementRead
from app.services.correction_contract import replay_result
from app.services.financial import validate_payment_date
from app.services.credits import refundable_cash_capacity
from app.services.financial_ledger import sync_payment_cash_movement
from app.services.financial_locking import lock_transaction
from app.services.settlement_state import settlement_state
from app.services.ledger import record_correction
from app.utils.business_date import business_date


def _json(value):
    if isinstance(value, Decimal):
        return format(value, 'f')
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _hash(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), default=_json).encode()).hexdigest()


def _payload(command):
    payload = command.model_dump(mode='json', exclude={'dependency_fingerprint'})
    payload['montant'] = format(command.montant.quantize(Decimal('0.01')), 'f')
    return {'kind': 'refund', **payload}


def _state(db, transaction, command, *, lock=False):
    state = settlement_state(db, [transaction], account_id=command.id_compte, lock=lock)
    return _hash({'request': _payload(command), 'state': state})


def _preview(db, command, transaction, *, lock=False):
    if not transaction.est_actif:
        raise HTTPException(409, 'Une transaction annulée ne peut pas recevoir de remboursement.')
    validate_payment_date(transaction, command.date_paiement)
    if command.date_paiement > business_date():
        raise HTTPException(422, 'Enregistrez un remboursement à sa date réelle, au plus tard aujourd’hui.')
    fingerprint = _state(db, transaction, command, lock=lock)
    # A commercial avoir reduces the sale's net amount on its own effective
    # date; it is not a payment and must never create an automatic cash/bank
    # movement or another "avance". Refunds need two independent safeguards:
    # positive corrected customer credit AND real settled monetary provenance.
    credit_now = -transaction.montant_restant
    available = refundable_cash_capacity(transaction, command.date_paiement)
    if command.montant > available:
        raise HTTPException(
            409,
            "Le montant dépasse le crédit monétaire remboursable à cette date. "
            "Réconciliez les règlements et les avoirs avant de continuer.",
        )
    return {'dependency_fingerprint': fingerprint, 'available_credit': format(available, '.2f'),
            'credit_after': format(credit_now - command.montant, '.2f'),
            'montant_initial': format(transaction.montant_total, '.2f'),
            'montant_avoirs': format(transaction.montant_avoir, '.2f'),
            'montant_net': format(transaction.montant_net, '.2f'),
            'direction': 'SORTIE' if transaction.id_client is not None else 'ENTREE',
            'montant': format(command.montant, '.2f'), 'date_paiement': command.date_paiement.isoformat(),
            'type_paiement': command.type_paiement, 'id_compte': command.id_compte}


def preview_refund(db, command):
    transaction = db.get(Transaction, command.id_transaction)
    if transaction is None:
        raise HTTPException(404, 'Transaction introuvable.')
    return _preview(db, command, transaction)


def apply_refund(db, command, actor):
    payload = _payload(command)
    request_hash = _hash(payload)
    actor_id = actor.id_utilisateur
    try:
        transaction = lock_transaction(db, command.id_transaction)
        replay = replay_result(db, command.operation_id, request_hash, actor_id)
        if replay is not None:
            return {**replay, 'replayed': True}
        preview = _preview(db, command, transaction, lock=True)
        if preview['dependency_fingerprint'] != command.dependency_fingerprint:
            raise HTTPException(409, 'Le solde ou ses mouvements ont changé. Vérifiez un nouvel aperçu.')
        refund = Paiement(id_transaction=transaction.id_transaction, nature='remboursement',
            date_paiement=command.date_paiement, montant=command.montant, type_paiement=command.type_paiement,
            id_compte=command.id_compte, source_reglement=(('banque' if command.id_compte else 'caisse')
                if transaction.id_fournisseur is not None else None), notes=command.reason, statut='valide',
            cle_idempotence=f'refund:{command.operation_id}', id_utilisateur_creation=actor_id)
        db.add(refund)
        db.flush()
        # Bank movement notes are varchar(255); the full reason remains on the
        # settlement and immutable operation journal.
        sync_payment_cash_movement(db, refund, transaction, current_user=actor, reason=command.reason[:255])
        db.flush()
        db.refresh(refund)
        result = {'record': PaiementRead.model_validate(refund).model_dump(mode='json'),
                  'credit_after': preview['credit_after'], 'operation_id': str(command.operation_id)}
        db.add(CorrectionOperation(operation_id=command.operation_id, request_hash=request_hash,
            id_utilisateur=actor_id, reason=command.reason, request_payload=payload, result_payload=deepcopy(result)))
        db.flush()
        record_correction(db, type_entite='paiement', id_entite=refund.id_paiement, action='remboursement',
            raison=command.reason, current_user=actor, operation_id=command.operation_id,
            details={'transaction': transaction.id_transaction, 'montant': str(command.montant),
                     'direction': preview['direction'], 'credit_after': preview['credit_after']})
        db.commit()
        return {**result, 'replayed': False}
    except IntegrityError:
        db.rollback()
        replay = replay_result(db, command.operation_id, request_hash, actor_id)
        if replay is not None:
            return {**replay, 'replayed': True}
        raise HTTPException(409, 'Ce remboursement entre en conflit avec un autre enregistrement.')
    except Exception:
        db.rollback()
        raise
