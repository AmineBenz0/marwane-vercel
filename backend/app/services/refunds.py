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

from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.correction_operation import CorrectionOperation
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.paiement import PaiementRead
from app.services.correction_contract import replay_result
from app.services.financial import payment_total_as_of, validate_payment_date
from app.services.financial_ledger import sync_payment_cash_movement
from app.services.financial_locking import lock_transaction
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
    def rows(model, predicate, key):
        query = db.query(model).filter(predicate).order_by(key).populate_existing()
        return (query.with_for_update() if lock else query).all()

    payments = rows(Paiement, Paiement.id_transaction == transaction.id_transaction, Paiement.id_paiement)
    ids = [p.id_paiement for p in payments]
    cash = rows(Caisse, Caisse.id_paiement.in_(ids), Caisse.id_mouvement)
    bank = rows(MouvementBancaire, MouvementBancaire.id_paiement.in_(ids), MouvementBancaire.id_mouvement)
    account_ids = {m.id_compte for m in bank}
    if command.id_compte is not None:
        account_ids.add(command.id_compte)
    accounts = rows(CompteBancaire, CompteBancaire.id_compte.in_(sorted(account_ids)), CompteBancaire.id_compte)
    if command.id_compte and command.id_compte not in {a.id_compte for a in accounts}:
        raise HTTPException(404, 'Compte bancaire introuvable.')
    for payment in payments:
        if payment.statut != 'annule' and (payment.type_paiement in {'cheque', 'lc'} or payment.id_lc):
            raise HTTPException(409, 'Ce remboursement nécessite le traitement dédié du chèque ou de la lettre de crédit.')
        linked = [m for m in cash + bank if m.id_paiement == payment.id_paiement and m.statut == 'active']
        if len(linked) != (1 if payment.est_effectif else 0):
            raise HTTPException(409, 'Réconciliez les mouvements de cette transaction avant le remboursement.')
        for movement in linked:
            bank_expected = payment.id_compte is not None and (
                payment.source_reglement == 'banque' or payment.source_reglement is None and payment.type_paiement == 'virement')
            if (movement.montant != payment.montant or movement.type_mouvement != payment.ledger_direction(transaction)
                or movement.date_mouvement.date() != payment.date_paiement
                or isinstance(movement, MouvementBancaire) != bank_expected
                or bank_expected and (movement.id_compte != payment.id_compte or movement.source != payment.type_paiement)
                or isinstance(movement, Caisse) and (movement.id_transaction != transaction.id_transaction or movement.id_charge or movement.id_cession)):
                raise HTTPException(409, 'Un mouvement ne correspond pas au règlement. Réconciliez-le avant le remboursement.')
    # The relationship may have been read before a writer acquired its lock.
    db.expire(transaction, ['paiements'])
    def snapshot(row):
        return {c.name: _json(getattr(row, c.name)) for c in row.__table__.columns}
    state = {'transaction': snapshot(transaction), 'payments': [snapshot(p) for p in payments],
             'cash': [snapshot(m) for m in cash], 'bank': [snapshot(m) for m in bank],
             'accounts': [snapshot(a) for a in accounts]}
    return _hash({'request': _payload(command), 'state': state})


def _preview(db, command, transaction, *, lock=False):
    if not transaction.est_actif:
        raise HTTPException(409, 'Une transaction annulée ne peut pas recevoir de remboursement.')
    validate_payment_date(transaction, command.date_paiement)
    if command.date_paiement > business_date():
        raise HTTPException(422, 'Enregistrez un remboursement à sa date réelle, au plus tard aujourd’hui.')
    fingerprint = _state(db, transaction, command, lock=lock)
    credit_now = -transaction.montant_restant
    credit_at_date = payment_total_as_of(transaction, command.date_paiement) - transaction.montant_total
    available = max(Decimal('0'), min(credit_now, credit_at_date))
    # A backdated refund must not consume credit already returned on a later
    # date, even when a subsequent payment replenished today's credit.
    deltas = {}
    for payment in transaction.paiements:
        if payment.est_effectif and payment.date_paiement > command.date_paiement:
            deltas[payment.date_paiement] = deltas.get(payment.date_paiement, Decimal('0')) + payment.montant_net
    running_credit = credit_at_date
    for effective_date in sorted(deltas):
        running_credit += deltas[effective_date]
        available = min(available, max(Decimal('0'), running_credit))
    if command.montant > available:
        raise HTTPException(409, 'Le montant dépasse le crédit disponible à cette date. Actualisez le solde.')
    return {'dependency_fingerprint': fingerprint, 'available_credit': format(available, 'f'),
            'credit_after': format(credit_now - command.montant, 'f'),
            'direction': 'SORTIE' if transaction.id_client is not None else 'ENTREE',
            'montant': format(command.montant, 'f'), 'date_paiement': command.date_paiement.isoformat(),
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
