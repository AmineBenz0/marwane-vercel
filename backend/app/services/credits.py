"""Atomic advances and paired, non-cash allocations under one retry contract."""
from copy import deepcopy
from datetime import datetime, time, timezone
from decimal import Decimal
from hashlib import sha256
import json
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.credit import Avance, AffectationCredit
from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.correction_operation import CorrectionOperation
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.services.correction_contract import replay_result
from app.services.financial import payment_effective_date, payment_total_as_of, query_financial_transactions
from app.services.financial_ledger import create_cash_snapshot, record_bank_movement
from app.services.ledger import void_cash_movement, void_bank_movement
from app.services.settlement_state import json_value, row_snapshot, settlement_state
from app.utils.business_date import business_date


def _hash(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), default=json_value).encode()).hexdigest()


def _payload(command):
    payload = command.model_dump(mode='json')
    if 'montant' in payload:
        payload['montant'] = format(command.montant.quantize(Decimal('0.01')), 'f')
    return {'kind': 'credit', **payload}


def _party(record):
    return ('client', record.id_client) if record.id_client is not None else ('fournisseur', record.id_fournisseur)


def settlement_capacity(transaction, effective_date, *, credit=True):
    """Capacity at the requested date and every later dated balance."""
    sign = Decimal('1') if credit else Decimal('-1')
    running = (payment_total_as_of(transaction, effective_date) - transaction.montant_total) * sign
    capacity = min(running, -transaction.montant_restant * sign)
    deltas = {}
    for payment in transaction.paiements:
        if payment.est_effectif and payment_effective_date(payment) > effective_date:
            deltas[payment_effective_date(payment)] = deltas.get(payment_effective_date(payment), Decimal('0')) + payment.montant_net
    for day in sorted(deltas):
        running += deltas[day] * sign
        capacity = min(capacity, running)
    return max(Decimal('0'), capacity)


def _advance_state(db, root, *, lock=False):
    query = db.query(Avance).filter(or_(Avance.id_avance == root.id_avance,
        Avance.id_origine == root.id_avance)).order_by(Avance.id_avance).populate_existing()
    records = (query.with_for_update() if lock else query).all()
    ids = [a.id_avance for a in records]
    query = db.query(AffectationCredit).filter(AffectationCredit.id_avance == root.id_avance).order_by(AffectationCredit.id_affectation).populate_existing()
    allocations = (query.with_for_update() if lock else query).all()
    cash = db.query(Caisse).filter(Caisse.id_avance.in_(ids)).order_by(Caisse.id_mouvement).populate_existing()
    bank = db.query(MouvementBancaire).filter(MouvementBancaire.id_avance.in_(ids)).order_by(MouvementBancaire.id_mouvement).populate_existing()
    cash = (cash.with_for_update() if lock else cash).all()
    bank = (bank.with_for_update() if lock else bank).all()
    for advance in records:
        linked = [m for m in cash + bank if m.id_avance == advance.id_avance and m.statut == 'active']
        if len(linked) != (1 if advance.statut == 'active' else 0):
            raise HTTPException(409, 'Réconciliez les mouvements de cette avance avant de l’utiliser.')
        for m in linked:
            if (m.montant != advance.montant or m.type_mouvement != advance.ledger_direction
                or m.date_mouvement.date() != advance.date_effet or m.id_paiement or m.id_charge
                or isinstance(m, MouvementBancaire) != (advance.id_compte is not None)
                or isinstance(m, MouvementBancaire) and (m.id_compte != advance.id_compte or m.source != advance.nature)
                or isinstance(m, Caisse) and (m.id_transaction or m.id_cession)):
                raise HTTPException(409, 'Un mouvement de cette avance doit être réconcilié.')
    db.expire(root, ['allocations', 'retours'])
    return {'advances': [row_snapshot(a) for a in records], 'allocations': [row_snapshot(a) for a in allocations],
            'cash': [row_snapshot(m) for m in cash], 'bank': [row_snapshot(m) for m in bank]}


def _context(db, command, *, lock=False):
    allocation = None
    advance = None
    root = None
    transaction_ids = set()
    if command.action == 'allocate':
        transaction_ids.add(command.id_transaction_cible)
        if command.id_transaction_source is not None:
            transaction_ids.add(command.id_transaction_source)
    if command.action == 'cancel_allocation':
        allocation = db.get(AffectationCredit, command.id_affectation)
        if allocation is None:
            raise HTTPException(404, 'Affectation de crédit introuvable.')
        transaction_ids.update(v for v in [allocation.id_transaction_source, allocation.id_transaction_cible] if v is not None)
    query = db.query(Transaction).filter(Transaction.id_transaction.in_(sorted(transaction_ids))).order_by(Transaction.id_transaction).populate_existing()
    transactions = (query.with_for_update() if lock else query).all()
    if len(transactions) != len(transaction_ids):
        raise HTTPException(404, 'Transaction introuvable.')
    advance_id = getattr(command, 'id_avance', None) or (allocation.id_avance if allocation else None)
    if advance_id:
        advance = db.get(Avance, advance_id)
        if advance is None:
            raise HTTPException(404, 'Avance introuvable.')
        root = db.get(Avance, advance.id_origine) if advance.id_origine else advance
    advance_state = _advance_state(db, root, lock=lock) if root else {}
    if allocation:
        query = db.query(AffectationCredit).filter(AffectationCredit.id_affectation == allocation.id_affectation).populate_existing()
        allocation = (query.with_for_update() if lock else query).one()
    state = settlement_state(db, transactions, lock=lock, lock_accounts=False)
    account_ids = {a['id_compte'] for a in state['accounts']}
    account_ids.update(m['id_compte'] for m in advance_state.get('bank', []))
    if getattr(command, 'id_compte', None):
        account_ids.add(command.id_compte)
    query = db.query(CompteBancaire).filter(CompteBancaire.id_compte.in_(sorted(account_ids))).order_by(CompteBancaire.id_compte).populate_existing()
    accounts = (query.with_for_update() if lock else query).all()
    if getattr(command, 'id_compte', None) and command.id_compte not in {a.id_compte for a in accounts}:
        raise HTTPException(404, 'Compte bancaire introuvable.')
    state['accounts'] = [row_snapshot(a) for a in accounts]
    state['advance_state'] = advance_state
    state['allocation'] = row_snapshot(allocation) if allocation else None
    if command.action == 'advance':
        party_model = Client if command.id_client else Fournisseur
        key = Client.id_client if command.id_client else Fournisseur.id_fournisseur
        query = db.query(party_model).filter(key == (command.id_client or command.id_fournisseur)).populate_existing()
        party = (query.with_for_update() if lock else query).one_or_none()
        if party is None or not party.est_actif:
            raise HTTPException(422, 'Le contact est introuvable ou inactif.')
        state['party'] = row_snapshot(party)
    return {t.id_transaction: t for t in transactions}, advance, root, allocation, state


def _plan(db, command, *, lock=False):
    transactions, advance, root, allocation, state = _context(db, command, lock=lock)
    day = getattr(command, 'date_effet', None)
    if day and day > business_date():
        raise HTTPException(422, 'La date de cette opération ne peut pas être future.')
    plan = {'action': command.action, 'money_effect': 'unchanged'}
    if command.action == 'allocate':
        target = transactions[command.id_transaction_cible]
        source = transactions.get(command.id_transaction_source)
        if not target.est_actif or source and not source.est_actif:
            raise HTTPException(409, 'Une transaction annulée ne peut pas recevoir ou céder du crédit.')
        if day < target.date_transaction or source and day < source.date_transaction:
            raise HTTPException(422, 'La date d’affectation ne peut pas précéder les transactions concernées.')
        if source and _party(source) != _party(target):
            raise HTTPException(409, 'Le crédit appartient à un autre client ou fournisseur.')
        if advance:
            if advance.nature != 'avance' or advance.statut != 'active' or _party(advance) != _party(target):
                raise HTTPException(409, 'Cette avance ne correspond pas au contact de la transaction.')
            if day < advance.date_effet:
                raise HTTPException(422, 'L’avance doit exister à la date d’affectation.')
        available = advance.montant_disponible if advance else settlement_capacity(source, day)
        debt = settlement_capacity(target, day, credit=False)
        if command.montant > min(available, debt):
            raise HTTPException(409, 'Le montant dépasse le crédit disponible ou le reste à régler à cette date. Actualisez l’aperçu.')
        plan.update(available=str(available), source_after=str(available - command.montant),
            target_remaining_after=str(target.montant_restant - command.montant), montant=str(command.montant),
            source_transaction=source.id_transaction if source else None, source_advance=str(advance.id_avance) if advance else None,
            target_transaction=target.id_transaction)
    elif command.action == 'cancel_allocation':
        if allocation.statut != 'active':
            raise HTTPException(409, 'Cette affectation est déjà annulée.')
        target = transactions[allocation.id_transaction_cible]
        if not target.est_actif or any(not t.est_actif for t in transactions.values()):
            raise HTTPException(409, 'Réconciliez les transactions annulées avant de retirer cette affectation.')
        if any(p.est_effectif and p.nature in {'remboursement', 'credit_transfere'} for p in target.paiements):
            raise HTTPException(409, 'Le crédit a été remboursé ou réaffecté depuis cette transaction. Traitez d’abord ces opérations liées.')
        plan.update(montant=str(allocation.montant), target_transaction=target.id_transaction,
            target_remaining_after=str(target.montant_restant + allocation.montant),
            source_transaction=allocation.id_transaction_source, source_advance=str(allocation.id_avance) if allocation.id_avance else None)
    elif command.action in {'return_advance', 'cancel_advance'}:
        if advance.statut != 'active':
            raise HTTPException(409, 'Cet enregistrement d’avance est déjà annulé.')
        if command.action == 'return_advance':
            if advance.nature != 'avance' or day < advance.date_effet:
                raise HTTPException(422, 'La restitution doit concerner une avance existante à cette date.')
            if command.montant > advance.montant_disponible:
                raise HTTPException(409, 'Le montant dépasse l’avance encore disponible.')
            plan.update(available=str(advance.montant_disponible), source_after=str(advance.montant_disponible - command.montant),
                montant=str(command.montant), money_effect='bank' if command.id_compte else 'cash',
                direction='SORTIE' if advance.id_client is not None else 'ENTREE')
        else:
            if advance.nature == 'avance' and advance.montant_disponible != advance.montant:
                raise HTTPException(409, 'Cette avance est utilisée ou remboursée. Annulez d’abord les enregistrements liés qui sont erronés.')
            plan.update(montant=str(advance.montant), money_effect='bank' if advance.id_compte else 'cash',
                direction='SORTIE' if advance.ledger_direction == 'ENTREE' else 'ENTREE')
    elif command.action == 'advance':
        plan.update(montant=str(command.montant), money_effect='bank' if command.id_compte else 'cash',
                    direction='ENTREE' if command.id_client else 'SORTIE')
    plan['dependency_fingerprint'] = _hash({'request': _payload(command), 'state': state})
    return plan, transactions, advance, root, allocation


def preview_credit(db, command):
    return _plan(db, command)[0]


def _advance_movement(db, advance, actor):
    when = datetime.combine(advance.date_effet, time.min, tzinfo=timezone.utc)
    if advance.id_compte:
        record_bank_movement(db, id_compte=advance.id_compte, montant=advance.montant,
            type_mouvement=advance.ledger_direction, source=advance.nature, notes=advance.reason[:255],
            id_avance=advance.id_avance, current_user=actor, date_mouvement=when)
    else:
        movement = Caisse(id_avance=advance.id_avance, montant=advance.montant,
            type_mouvement=advance.ledger_direction, date_mouvement=when)
        db.add(movement)
        db.flush()
        create_cash_snapshot(db, movement.id_mouvement)


def _cancel_advance_movement(db, advance, command, actor):
    for movement in db.query(Caisse).filter(Caisse.id_avance == advance.id_avance, Caisse.statut == 'active').all():
        void_cash_movement(db, movement, raison=command.reason, current_user=actor)
        create_cash_snapshot(db, movement.id_mouvement)
    for movement in db.query(MouvementBancaire).filter(MouvementBancaire.id_avance == advance.id_avance, MouvementBancaire.statut == 'active').all():
        void_bank_movement(db, movement, raison=command.reason, current_user=actor)


def _cancel(record, reason, actor):
    record.statut = 'annule'
    record.motif_annulation = reason
    record.date_annulation = datetime.now(timezone.utc)
    record.id_utilisateur_annulation = actor.id_utilisateur


def apply_credit(db, command, fingerprint, actor, *, commit=True):
    payload = _payload(command)
    request_hash = _hash(payload)
    try:
        replay = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if replay is not None:
            return {**replay, 'replayed': True}
        plan, transactions, advance, root, allocation = _plan(db, command, lock=True)
        replay = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if replay is not None:
            return {**replay, 'replayed': True}
        if plan['dependency_fingerprint'] != fingerprint:
            raise HTTPException(409, 'Le crédit ou ses opérations liées ont changé. Vérifiez un nouvel aperçu.')
        payments = []
        if command.action in {'advance', 'return_advance'}:
            record = Avance(id_avance=command.operation_id, id_origine=advance.id_avance if advance else None,
                nature='retour_avance' if advance else 'avance', id_client=advance.id_client if advance else command.id_client,
                id_fournisseur=advance.id_fournisseur if advance else command.id_fournisseur,
                montant=command.montant, date_effet=command.date_effet, type_paiement=command.type_paiement,
                id_compte=command.id_compte, reason=command.reason, id_utilisateur_creation=actor.id_utilisateur)
            db.add(record)
            db.flush()
            _advance_movement(db, record, actor)
        elif command.action == 'allocate':
            record = AffectationCredit(id_affectation=command.operation_id, id_transaction_source=command.id_transaction_source,
                id_avance=command.id_avance, id_transaction_cible=command.id_transaction_cible,
                montant=command.montant, date_effet=command.date_effet, reason=command.reason,
                id_utilisateur_creation=actor.id_utilisateur)
            db.add(record)
            db.flush()
            sides = [(command.id_transaction_cible, 'credit_recu')]
            if command.id_transaction_source is not None:
                sides.append((command.id_transaction_source, 'credit_transfere'))
            for transaction_id, nature in sides:
                payment = Paiement(id_transaction=transaction_id, id_affectation=record.id_affectation,
                    nature=nature, montant=command.montant, date_paiement=command.date_effet,
                    type_paiement='compensation', statut='valide', notes=command.reason,
                    id_utilisateur_creation=actor.id_utilisateur)
                db.add(payment)
                payments.append(payment)
        elif command.action == 'cancel_allocation':
            record = allocation
            _cancel(record, command.reason, actor)
            db.flush()
            payments = db.query(Paiement).filter(Paiement.id_affectation == allocation.id_affectation).order_by(Paiement.id_paiement).with_for_update().all()
            for payment in payments:
                payment.statut = 'annule'
                payment.motif_annulation = command.reason
                payment.date_annulation = record.date_annulation
                payment.id_utilisateur_modification = actor.id_utilisateur
        else:
            record = advance
            _cancel(record, command.reason, actor)
            _cancel_advance_movement(db, record, command, actor)
        db.flush()
        db.refresh(record)
        result = {'operation_id': str(command.operation_id), 'record': row_snapshot(record), 'impact': plan,
                  'payment_ids': [p.id_paiement for p in payments]}
        db.add(CorrectionOperation(operation_id=command.operation_id, request_hash=request_hash,
            id_utilisateur=actor.id_utilisateur, reason=command.reason,
            request_payload=payload, result_payload=deepcopy(result)))
        if commit:
            db.commit()
        else:
            db.flush()
        return {**result, 'replayed': False}
    except HTTPException as exc:
        db.rollback()
        if exc.status_code == 409:
            replay = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
            if replay is not None:
                return {**replay, 'replayed': True}
        raise
    except IntegrityError:
        db.rollback()
        replay = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if replay is not None:
            return {**replay, 'replayed': True}
        raise HTTPException(409, 'Cette opération entre en conflit avec un autre enregistrement.')
    except Exception:
        db.rollback()
        raise


def available_sources(db, transaction_id):
    target = db.get(Transaction, transaction_id)
    if target is None:
        raise HTTPException(404, 'Transaction introuvable.')
    if not target.est_actif:
        return []
    direction = 'receivable' if target.id_client is not None else 'payable'
    party_id = target.id_client or target.id_fournisseur
    sources = []
    for tx in query_financial_transactions(db, direction=direction, id_tiers=party_id, statut='surpaye'):
        if tx.id_transaction == target.id_transaction:
            continue
        sources.append({'kind': 'transaction', 'id': tx.id_transaction, 'date_effet': tx.date_transaction.isoformat(),
                        'available': str(-tx.montant_restant), 'label': f'Transaction n° {tx.id_transaction}'})
    key = Avance.id_client if target.id_client is not None else Avance.id_fournisseur
    for advance in db.query(Avance).filter(key == party_id, Avance.nature == 'avance', Avance.statut == 'active').order_by(Avance.date_effet, Avance.id_avance).all():
        if advance.montant_disponible > 0:
            sources.append({'kind': 'advance', 'id': str(advance.id_avance), 'date_effet': advance.date_effet.isoformat(),
                            'available': str(advance.montant_disponible), 'label': 'Avance'})
    return sources


def party_credit_history(db, *, id_client=None, id_fournisseur=None):
    if (id_client is None) == (id_fournisseur is None):
        raise HTTPException(422, 'Choisissez un client ou un fournisseur.')
    key = Avance.id_client if id_client is not None else Avance.id_fournisseur
    records = db.query(Avance).filter(key == (id_client or id_fournisseur)).order_by(Avance.date_effet.desc(), Avance.id_avance).all()
    items = [{**row_snapshot(a), 'available': str(a.montant_disponible) if a.nature == 'avance' else None} for a in records]
    tx_key = Transaction.id_client if id_client is not None else Transaction.id_fournisseur
    ids = db.query(Transaction.id_transaction).filter(tx_key == (id_client or id_fournisseur))
    allocations = db.query(AffectationCredit).filter(AffectationCredit.id_transaction_cible.in_(ids)).order_by(AffectationCredit.date_effet.desc(), AffectationCredit.id_affectation).all()
    from app.services.financial import contact_balances
    balance = contact_balances(db, direction='receivable' if id_client is not None else 'payable', contact_ids=[id_client or id_fournisseur])[id_client or id_fournisseur]
    debt_total = sum((max(Decimal('0'), t.montant_restant) for t in db.query(Transaction).filter(
        tx_key == (id_client or id_fournisseur), Transaction.est_actif.is_(True)).all()), Decimal('0'))
    return {'balance': str(balance), 'debt_total': str(debt_total), 'advances': items, 'allocations': [row_snapshot(a) for a in allocations],
            'available': str(sum((a.montant_disponible for a in records if a.nature == 'avance'), Decimal('0')))}
