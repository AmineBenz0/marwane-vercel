"""One preview and one atomic write for LC payment, cession or deposit effects."""
from copy import deepcopy
from datetime import datetime, time, timezone
from decimal import Decimal
from hashlib import sha256
import json
from fastapi import HTTPException
from sqlalchemy import case, func, or_, text
from sqlalchemy.exc import IntegrityError
from app.models.caisse import Caisse
from app.models.cession_lc import CessionLC
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.correction_operation import CorrectionOperation
from app.models.lettre_credit import LettreDeCredit
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.services.correction_contract import replay_result
from app.services.financial_ledger import create_cash_snapshot, record_bank_movement, sync_payment_cash_movement
from app.services.ledger import record_correction, void_bank_movement, void_cash_movement
from app.services.settlement_state import json_value
from app.utils.business_date import business_date


def row_snapshot(row):
    def normalized(value):
        if isinstance(value, datetime):
            value = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return json_value(value)
    return {column.name: normalized(getattr(row, column.name)) for column in row.__table__.columns}


def _hash(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), default=json_value).encode()).hexdigest()


def _payload(command):
    payload = command.model_dump(mode='json', exclude_unset=True)
    if 'montant' in payload.get('changes', {}):
        payload['changes']['montant'] = format(command.changes.montant, '.2f')
    return {'kind': 'lc_correction', **payload}


def _rows(db, model, predicate, key, lock):
    query = db.query(model).filter(predicate).order_by(key).populate_existing()
    return (query.with_for_update() if lock else query).all()


def _context(db, command, lock):
    # Match payment creation's transaction -> LC ordering. If a new parent
    # appeared before the LC lock, fail rather than lock a parent out of order.
    tx_ids = {v[0] for v in db.query(Paiement.id_transaction).filter(Paiement.id_lc == command.id_lc).all()}
    transactions = _rows(db, Transaction, Transaction.id_transaction.in_(sorted(tx_ids)), Transaction.id_transaction, lock)
    lcs = _rows(db, LettreDeCredit, LettreDeCredit.id_lc == command.id_lc, LettreDeCredit.id_lc, lock)
    if not lcs:
        raise HTTPException(404, 'Lettre de crédit introuvable.')
    lc = lcs[0]
    if lc.version_utilisation != command.expected_version:
        raise HTTPException(409, 'La lettre de crédit a changé. Actualisez son aperçu.')
    payments = _rows(db, Paiement, Paiement.id_lc == lc.id_lc, Paiement.id_paiement, lock)
    if {p.id_transaction for p in payments} != tx_ids:
        raise HTTPException(409, 'Une utilisation est apparue. Actualisez la lettre de crédit.')
    cessions = _rows(db, CessionLC, CessionLC.id_lc == lc.id_lc, CessionLC.id_cession, lock)
    cash = _rows(db, Caisse, or_(Caisse.id_paiement.in_([p.id_paiement for p in payments]),
        Caisse.id_cession.in_([c.id_cession for c in cessions])), Caisse.id_mouvement, lock)
    bank = _rows(db, MouvementBancaire, or_(MouvementBancaire.id_paiement.in_([p.id_paiement for p in payments]),
        MouvementBancaire.cle_idempotence.like(f'lc-bank-deposit-{lc.id_lc}-%'),
        MouvementBancaire.cle_idempotence == f'lc-bank-deposit-{lc.id_lc}'), MouvementBancaire.id_mouvement, lock)
    account_ids = {m.id_compte for m in bank if m.statut == 'active'}
    if command.changes.id_compte is not None:
        account_ids.add(command.changes.id_compte)
    accounts = _rows(db, CompteBancaire, CompteBancaire.id_compte.in_(sorted(account_ids)), CompteBancaire.id_compte, lock)
    for account in accounts:
        balance = db.query(func.coalesce(func.sum(case((MouvementBancaire.type_mouvement == 'ENTREE', MouvementBancaire.montant),
            else_=-MouvementBancaire.montant)), 0)).filter(MouvementBancaire.id_compte == account.id_compte,
            MouvementBancaire.statut == 'active').scalar()
        if Decimal(str(account.solde_actuel)) != Decimal(str(balance)):
            raise HTTPException(409, 'Réconciliez le compte bancaire avant de corriger cette LC.')
    if account_ids != {a.id_compte for a in accounts}:
        raise HTTPException(422, 'Compte bancaire introuvable.')
    # Include sibling settlements in the fingerprint and prohibit changes which
    # would invalidate a downstream refund or non-cash credit allocation.
    siblings = _rows(db, Paiement, Paiement.id_transaction.in_(sorted(tx_ids)), Paiement.id_paiement, lock)
    state = {'lc': row_snapshot(lc), 'transactions': [row_snapshot(t) for t in transactions],
        'payments': [row_snapshot(p) for p in payments], 'siblings': [row_snapshot(p) for p in siblings],
        'cessions': [row_snapshot(c) for c in cessions], 'cash': [row_snapshot(m) for m in cash],
        'bank': [row_snapshot(m) for m in bank], 'accounts': [row_snapshot(a) for a in accounts]}
    return lc, payments, cessions, cash, bank, transactions, siblings, state


def plan_lc_correction(db, command, *, lock=False):
    lc, payments, cessions, cash, bank, transactions, siblings, state = _context(db, command, lock)
    active_payments = [p for p in payments if p.statut != 'annule']
    reversed_ids = {c.id_cession_origine for c in cessions if c.id_cession_origine is not None}
    active_cessions = [c for c in cessions if c.id_cession_origine is None and c.id_cession not in reversed_ids]
    deposits = [m for m in bank if m.id_paiement is None and m.statut == 'active']
    uses = len(active_payments) + len(active_cessions) + len(deposits)
    if uses > 1 or (lc.statut == 'utilisee') != (uses == 1):
        raise HTTPException(409, 'Réconciliez les utilisations de cette LC avant de la corriger.')
    payment = active_payments[0] if active_payments else None
    cession = active_cessions[0] if active_cessions else None
    deposit = deposits[0] if deposits else None
    usage = 'payment' if payment else 'cession' if cession else 'deposit' if deposit else 'unused'
    changes = command.changes.model_dump(exclude_unset=True)
    financial = bool(set(changes) - {'notes'}) or command.action == 'cancel_usage'
    if financial and any(p.statut != 'annule' and p.nature in {'remboursement', 'credit_recu', 'credit_transfere'} for p in siblings):
        raise HTTPException(409, 'Traitez les remboursements ou crédits liés avant cette correction.')
    if command.action == 'cancel_usage' and not uses:
        raise HTTPException(409, 'Cette LC n’a pas d’utilisation active à annuler.')
    before = row_snapshot(lc)
    after = {**before, **{k: json_value(v) for k, v in changes.items() if k not in {'date_effet', 'id_compte'}}}
    after['montant'] = format(changes.get('montant', lc.montant), '.2f')
    holder_change = bool({'id_client', 'id_fournisseur'} & changes.keys())
    if holder_change:
        if payment or deposit:
            raise HTTPException(409, 'Annulez d’abord cette utilisation avant de changer le détenteur.')
        after['id_client'] = changes.get('id_client')
        after['id_fournisseur'] = changes.get('id_fournisseur')
        after['type_detenteur'] = 'client' if after['id_client'] else 'fournisseur'
        if not cession and after['id_fournisseur']:
            raise HTTPException(422, 'Une LC disponible est attribuée à un client. Utilisez une cession pour la transmettre.')
        model, key, value = (Client, Client.id_client, after['id_client']) if after['id_client'] else (Fournisseur, Fournisseur.id_fournisseur, after['id_fournisseur'])
        contacts = _rows(db, model, key == value, key, lock)
        if not contacts or not contacts[0].est_actif:
            raise HTTPException(422, 'Le détenteur est introuvable ou inactif.')
        state['selected_contact'] = row_snapshot(contacts[0])
    if cession and holder_change and after['id_client'] == cession.id_cedant_client and after['id_fournisseur'] == cession.id_cedant_fournisseur:
        raise HTTPException(422, 'Pour rendre la LC au cédant, annulez son utilisation plutôt que créer une cession vers lui-même.')
    emission = changes.get('date_emission', lc.date_emission)
    available = changes.get('date_disponibilite', lc.date_disponibilite)
    amount = changes.get('montant', lc.montant)
    if emission > business_date() or available < emission:
        raise HTTPException(422, 'Vérifiez les dates d’émission et de disponibilité.')
    if 'id_compte' in changes and not deposit:
        raise HTTPException(422, 'Le compte bancaire concerne uniquement un versement bancaire de LC.')
    if 'date_effet' in changes and not uses:
        raise HTTPException(422, 'Cette LC n’a pas d’utilisation à dater.')
    day = changes.get('date_effet', payment.date_paiement if payment else cession.date_cession if cession else deposit.date_mouvement.date() if deposit else None)
    if day is not None and not available <= day <= business_date():
        raise HTTPException(422, 'L’utilisation doit être comprise entre la disponibilité de la LC et aujourd’hui.')
    tx_by_id = {t.id_transaction: t for t in transactions}
    active_cash = [m for m in cash if m.statut == 'active']
    active_bank = [m for m in bank if m.statut == 'active']
    if payment:
        tx = tx_by_id[payment.id_transaction]
        if (payment.nature != 'paiement' or payment.type_paiement != 'lc' or not payment.est_effectif
            or payment.montant != lc.montant or not tx.est_actif or day < tx.date_transaction
            or tx.id_client != lc.id_client or tx.id_fournisseur != lc.id_fournisseur):
            raise HTTPException(409, 'Le paiement, sa transaction et le détenteur doivent être réconciliés.')
        expected_bank = payment.source_reglement == 'banque' and tx.id_fournisseur is not None
        movements = active_cash + active_bank
        if len(movements) != 1:
            raise HTTPException(409, 'Le paiement LC doit avoir un seul mouvement associé.')
        m = movements[0]
        if (m.id_paiement != payment.id_paiement or m.montant != payment.montant
            or m.type_mouvement != payment.ledger_direction(tx) or m.date_mouvement.date() != payment.date_paiement
            or m.id_charge is not None or m.id_avance is not None
            or isinstance(m, MouvementBancaire) != expected_bank
            or expected_bank and (m.id_compte != payment.id_compte or m.source != 'lc')
            or isinstance(m, Caisse) and (m.id_transaction != tx.id_transaction or m.id_cession is not None)):
            raise HTTPException(409, 'Le mouvement du paiement LC doit être réconcilié.')
    elif deposit:
        if active_cash or len(active_bank) != 1 or deposit.montant != lc.montant or deposit.type_mouvement != 'ENTREE' or deposit.source != 'lc' or deposit.reference != lc.numero_reference or deposit.id_charge or deposit.id_avance:
            raise HTTPException(409, 'Le versement bancaire de cette LC doit être réconcilié.')
    elif cession:
        if (cession.type_cessionnaire != lc.type_detenteur or cession.id_cessionnaire_client != lc.id_client
            or cession.id_cessionnaire_fournisseur != lc.id_fournisseur or active_bank
            or any(m.id_cession != cession.id_cession or m.montant != lc.montant or m.type_mouvement != 'SORTIE' for m in active_cash)
            or len(active_cash) > 1):
            raise HTTPException(409, 'La cession et son détenteur doivent être réconciliés.')
    elif active_cash or active_bank:
        raise HTTPException(409, 'Cette LC disponible conserve des mouvements actifs à réconcilier.')
    if command.action == 'cancel_usage':
        after['statut'] = 'active'
        if cession:
            after.update(type_detenteur=cession.type_cedant, id_client=cession.id_cedant_client, id_fournisseur=cession.id_cedant_fournisseur)
    after['version_utilisation'] = lc.version_utilisation + 1
    new_account = changes.get('id_compte', deposit.id_compte if deposit else None)
    cancel = command.action == 'cancel_usage'
    remaining = None
    if payment:
        tx = tx_by_id[payment.id_transaction]
        db.expire(tx, ['paiements'])
        remaining = format(tx.montant_restant + payment.montant - (0 if cancel else amount), '.2f')
    old_day = payment.date_paiement if payment else cession.date_cession if cession else deposit.date_mouvement.date() if deposit else None
    effect_changed = cancel or amount != lc.montant or day != old_day or deposit is not None and new_account != deposit.id_compte
    cession_changed = cession is not None and (effect_changed or holder_change)
    bank_after = []
    if not cancel:
        if deposit:
            bank_after = [{'id_compte': new_account, 'montant': format(amount, '.2f'), 'direction': 'ENTREE'}]
        elif active_bank:
            bank_after = [{'id_compte': active_bank[0].id_compte, 'montant': format(amount, '.2f'), 'direction': active_bank[0].type_mouvement}]
    deltas = {}
    for m in active_bank:
        deltas[m.id_compte] = deltas.get(m.id_compte, Decimal('0')) - (m.montant if m.type_mouvement == 'ENTREE' else -m.montant)
    for m in bank_after:
        deltas[m['id_compte']] = deltas.get(m['id_compte'], Decimal('0')) + (Decimal(m['montant']) if m['direction'] == 'ENTREE' else -Decimal(m['montant']))
    bank_balances = [{'id_compte': a['id_compte'], 'before': a['solde_actuel'],
        'after': format(Decimal(a['solde_actuel']) + deltas.get(a['id_compte'], Decimal('0')), '.2f')}
        for a in state['accounts'] if a['id_compte'] in deltas]
    plan = {'operation_id': str(command.operation_id), 'before': before, 'after': after,
        'usage': usage, 'action': command.action, 'montant': format(amount, '.2f'),
        'date_effet': day.isoformat() if day else None, 'id_compte': new_account,
        'usage_before': {'date_effet': old_day.isoformat() if old_day else None, 'id_compte': deposit.id_compte if deposit else None},
        'bank_balances': bank_balances,
        'payment_id': payment.id_paiement if payment else None, 'remaining_after': remaining,
        'balance_side': 'client' if payment and tx_by_id[payment.id_transaction].id_client is not None else 'fournisseur',
        'cession_id': cession.id_cession if cession else None, 'deposit_id': deposit.id_mouvement if deposit else None,
        'bank_before': [{'id_compte': m.id_compte, 'montant': format(m.montant, '.2f'), 'direction': m.type_mouvement} for m in active_bank],
        'money_effect': 'replaced' if effect_changed and usage in {'payment', 'deposit'} else 'unchanged',
        'cession_replaced': cession_changed,
        'dependency_fingerprint': _hash({'command': _payload(command), 'state': state})}
    return plan, (lc, payment, cession, deposit, cash, bank, tx_by_id)


def preview_lc_correction(db, command):
    return plan_lc_correction(db, command)[0]


def apply_lc_correction(db, command, fingerprint, actor):
    payload = _payload(command)
    request_hash = _hash(payload)
    try:
        previous = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if previous is not None:
            return {**previous, 'replayed': True}
        plan, context = plan_lc_correction(db, command, lock=True)
        previous = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if previous is not None:
            return {**previous, 'replayed': True}
        if plan['dependency_fingerprint'] != fingerprint:
            raise HTTPException(409, 'Les opérations liées ont changé. Vérifiez un nouvel aperçu.')
        lc, payment, cession, deposit, cash, bank, transactions = context
        changes = command.changes.model_dump(exclude_unset=True)
        cancel = command.action == 'cancel_usage'
        actual = any(plan['before'].get(k) != plan['after'].get(k) for k in changes if k not in {'date_effet', 'id_compte'})
        actual = actual or cancel or ('date_effet' in changes and changes['date_effet'].isoformat() != (payment.date_paiement.isoformat() if payment else cession.date_cession.isoformat() if cession else deposit.date_mouvement.date().isoformat()))
        actual = actual or ('id_compte' in changes and deposit.id_compte != changes['id_compte'])
        if not actual:
            raise HTTPException(422, 'Aucune valeur n’a changé.')
        now = datetime.now(timezone.utc)
        after = {**plan['after'], 'date_modification': now.isoformat(), 'id_utilisateur_modification': actor.id_utilisateur}
        payment_result = None
        change_payment = payment is not None and (cancel or Decimal(plan['montant']) != payment.montant or plan['date_effet'] != payment.date_paiement.isoformat())
        if change_payment:
            payment_result = {**row_snapshot(payment), 'montant': plan['montant'], 'date_paiement': plan['date_effet'],
                'statut': 'annule' if cancel else payment.statut, 'row_version': payment.row_version + 1,
                'id_utilisateur_modification': actor.id_utilisateur, 'date_modification': now.isoformat()}
            if cancel:
                payment_result.update(motif_annulation=command.reason, date_annulation=now.isoformat())
        result = {'operation_id': str(command.operation_id), 'record': after, 'impact': plan,
            'payments': {str(payment.id_paiement): payment_result} if change_payment else {}}
        payload['authorized_payments'] = {str(payment.id_paiement): {
            'expected_version': payment.row_version, 'after': payment_result}} if change_payment else {}
        operation = CorrectionOperation(operation_id=command.operation_id, request_hash=request_hash,
            id_utilisateur=actor.id_utilisateur, reason=command.reason, request_payload=payload, result_payload=deepcopy(result))
        db.add(operation)
        db.flush()
        if db.get_bind().dialect.name == 'postgresql':
            db.execute(text("SELECT set_config('app.correction_operation_id', :op, true)"), {'op': str(command.operation_id)})
        for field in ('montant', 'date_emission', 'date_disponibilite', 'notes', 'type_detenteur', 'id_client', 'id_fournisseur', 'statut'):
            value = after[field]
            if field == 'montant': value = Decimal(value)
            if field.startswith('date_'): value = datetime.fromisoformat(value).date()
            setattr(lc, field, value)
        lc.version_utilisation = after['version_utilisation']
        lc.id_utilisateur_modification = actor.id_utilisateur
        lc.date_modification = now
        if change_payment:
            payment.montant = Decimal(plan['montant'])
            payment.date_paiement = datetime.fromisoformat(plan['date_effet']).date()
            payment.id_utilisateur_modification = actor.id_utilisateur
            payment.date_modification = now
            if cancel:
                payment.statut, payment.motif_annulation, payment.date_annulation = 'annule', command.reason, now
            sync_payment_cash_movement(db, payment, transactions[payment.id_transaction], current_user=actor,
                reason=command.reason, operation_id=command.operation_id)
        if deposit and plan['money_effect'] == 'replaced':
            void_bank_movement(db, deposit, raison=command.reason, current_user=actor, operation_id=command.operation_id)
            if not cancel:
                record_bank_movement(db, id_compte=plan['id_compte'], montant=lc.montant, type_mouvement='ENTREE',
                    source='lc', reference=lc.numero_reference, notes=command.reason[:255],
                    date_mouvement=datetime.combine(datetime.fromisoformat(plan['date_effet']).date(), time.min, tzinfo=timezone.utc),
                    cle_idempotence=f'lc-bank-deposit-{lc.id_lc}-{lc.version_utilisation}', current_user=actor)
        if cession and plan['cession_replaced']:
            reversal = CessionLC(id_lc=lc.id_lc, type_cedant=cession.type_cessionnaire,
                id_cedant_client=cession.id_cessionnaire_client, id_cedant_fournisseur=cession.id_cessionnaire_fournisseur,
                type_cessionnaire=cession.type_cedant, id_cessionnaire_client=cession.id_cedant_client,
                id_cessionnaire_fournisseur=cession.id_cedant_fournisseur, date_cession=business_date(),
                id_cession_origine=cession.id_cession, motif=command.reason, id_utilisateur_creation=actor.id_utilisateur)
            db.add(reversal)
            if not cancel:
                replacement = CessionLC(id_lc=lc.id_lc, type_cedant=cession.type_cedant,
                    id_cedant_client=cession.id_cedant_client, id_cedant_fournisseur=cession.id_cedant_fournisseur,
                    type_cessionnaire=lc.type_detenteur, id_cessionnaire_client=lc.id_client,
                    id_cessionnaire_fournisseur=lc.id_fournisseur, date_cession=datetime.fromisoformat(plan['date_effet']).date(),
                    motif=command.reason, id_utilisateur_creation=actor.id_utilisateur)
                db.add(replacement)
                db.flush()
            for m in cash:
                if m.statut == 'active':
                    void_cash_movement(db, m, raison=command.reason, current_user=actor, operation_id=command.operation_id)
                    if not cancel:
                        movement = Caisse(montant=lc.montant, type_mouvement='SORTIE', id_cession=replacement.id_cession,
                            date_mouvement=datetime.combine(datetime.fromisoformat(plan['date_effet']).date(), time.min, tzinfo=timezone.utc))
                        db.add(movement)
                        db.flush()
                        create_cash_snapshot(db, movement.id_mouvement)
        record_correction(db, type_entite='lettre_credit', id_entite=lc.id_lc, action='correction', raison=command.reason,
            current_user=actor, details={'before': plan['before'], 'after': after, 'usage': plan['usage']}, operation_id=command.operation_id)
        db.flush()
        db.refresh(lc)
        if row_snapshot(lc) != after:
            raise HTTPException(409, 'La LC enregistrée diffère de l’aperçu. Actualisez les données.')
        if change_payment:
            db.refresh(payment)
            if row_snapshot(payment) != payment_result:
                raise HTTPException(409, 'Le paiement enregistré diffère de la correction prévue.')
        # Reconcile the saved graph before committing, while all locks remain held.
        verify = command.model_copy(update={'expected_version': lc.version_utilisation, 'action': 'correct',
            'changes': command.changes.__class__(notes=lc.notes)})
        plan_lc_correction(db, verify)
        db.commit()
        return {**result, 'replayed': False}
    except (HTTPException, IntegrityError) as exc:
        db.rollback()
        previous = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if previous is not None:
            return {**previous, 'replayed': True}
        if isinstance(exc, IntegrityError):
            raise HTTPException(409, 'Cette correction entre en conflit avec les opérations liées.') from exc
        raise
    except Exception:
        db.rollback()
        raise
