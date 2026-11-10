"""Previewed, idempotent advance use with one atomic cash/bank complement."""
from decimal import Decimal
from uuid import uuid5
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from app.models.credit import Avance
from app.models.transaction import Transaction
from app.models.paiement import Paiement
from app.models.compte_bancaire import CompteBancaire
from app.models.correction_operation import CorrectionOperation
from app.schemas.credit import AllocateCommand
from app.services.credits import _advance_state, _hash, apply_credit, preview_credit, settlement_capacity
from app.services.correction_contract import replay_result
from app.services.settlement_state import settlement_state, row_snapshot
from app.services.payment_validation import resolve_payment_funding
from app.services.financial_ledger import sync_payment_cash_movement
from app.utils.business_date import business_date

ZERO = Decimal('0')


def _payload(command):
    result = command.model_dump(mode='json')
    if command.montant_avance is not None:
        result['montant_avance'] = format(command.montant_avance, '.2f')
    for item, target in zip(result.get('cibles') or [], command.cibles or []):
        item['montant'] = format(target.montant, '.2f')
    if command.paiement:
        result['paiement']['montant'] = format(command.paiement.montant, '.2f')
    return {'kind': 'advance_settlement', **result}


def _roots(db, target, *, lock=False):
    key = Avance.id_client if target.id_client is not None else Avance.id_fournisseur
    query = db.query(Avance).filter(key == (target.id_client or target.id_fournisseur),
        Avance.nature == 'avance', Avance.statut == 'active').order_by(Avance.id_avance).populate_existing()
    return (query.with_for_update() if lock else query).all()


def allocate_advances(db, target, amount, day, actor, operation_id, advance_id=None):
    """Use oldest eligible advances; caller owns the outer transaction/commit."""
    if amount <= 0:
        return []
    roots = _roots(db, target, lock=True)
    for root in roots:
        _advance_state(db, root, lock=True)
    eligible = sorted((a for a in roots if a.date_effet <= day and (advance_id is None or a.id_avance == advance_id)), key=lambda a: (a.date_effet, str(a.id_avance)))
    if amount > sum((a.montant_disponible for a in eligible), ZERO):
        raise HTTPException(409, 'L’avance disponible a changé. Vérifiez un nouvel aperçu.')
    remaining, ids = amount, []
    for advance in eligible:
        part = min(remaining, advance.montant_disponible)
        if part <= 0:
            continue
        command = AllocateCommand(operation_id=uuid5(operation_id, f'advance:{advance.id_avance}:target:{target.id_transaction}'),
            action='allocate', id_transaction_cible=target.id_transaction, id_avance=advance.id_avance,
            date_effet=day, montant=part, reason='Utilisation de l’avance disponible')
        plan = preview_credit(db, command)
        result = apply_credit(db, command, plan['dependency_fingerprint'], actor, commit=False)
        ids.append(result['record']['id_affectation'])
        remaining -= part
        if remaining == 0:
            break
    if remaining:
        raise HTTPException(409, 'L’avance ne suffit plus à ce règlement.')
    return ids


def plan_settlement(db, command, *, lock=False):
    if command.date_effet > business_date():
        raise HTTPException(422, 'La date de règlement ne peut pas être future.')
    target = db.get(Transaction, command.id_transaction) if command.id_transaction else None
    if command.id_transaction and target is None:
        raise HTTPException(404, 'Transaction introuvable.')
    client_id = target.id_client if target else command.id_client
    supplier_id = target.id_fournisseur if target else command.id_fournisseur
    key = Transaction.id_client if client_id is not None else Transaction.id_fournisseur
    query = db.query(Transaction).filter(key == (client_id or supplier_id)).order_by(Transaction.id_transaction).populate_existing()
    all_transactions = (query.with_for_update() if lock else query).all()
    target = next((t for t in all_transactions if t.id_transaction == command.id_transaction), None) if target else None
    if target and not target.est_actif:
        raise HTTPException(409, 'Cette transaction est annulée.')
    if target and command.date_effet < target.date_transaction:
        raise HTTPException(422, 'L’utilisation ne peut pas précéder la transaction.')
    candidates = [target] if target else [t for t in all_transactions if t.est_actif and t.date_transaction <= command.date_effet and t.montant_restant > 0]
    candidates.sort(key=lambda t: (t.date_transaction, t.id_transaction))
    # Transactions first; advances, their effects, settlements, then all accounts.
    anchor = target or next(iter(all_transactions), None)
    if anchor is None:
        from types import SimpleNamespace
        anchor = SimpleNamespace(id_client=client_id, id_fournisseur=supplier_id)
    roots = _roots(db, anchor, lock=lock)
    root_states = [_advance_state(db, root, lock=lock) for root in roots]
    dependencies = settlement_state(db, candidates, lock=lock, lock_accounts=False)
    funding = resolve_payment_funding(db, command.paiement, target) if command.paiement else None
    account_ids = {a['id_compte'] for a in dependencies['accounts']}
    account_ids.update(m['id_compte'] for s in root_states for m in s['bank'])
    if funding and funding['id_compte']:
        account_ids.add(funding['id_compte'])
    query = db.query(CompteBancaire).filter(CompteBancaire.id_compte.in_(sorted(account_ids))).order_by(CompteBancaire.id_compte).populate_existing()
    accounts = (query.with_for_update() if lock else query).all()
    dependencies.update(accounts=[row_snapshot(a) for a in accounts], advances=root_states,
        party_transactions=[row_snapshot(t) for t in all_transactions])
    if command.id_avance is not None and not any(a.id_avance == command.id_avance for a in roots):
        raise HTTPException(409, 'Cette avance n’est plus disponible pour ce contact.')
    eligible = [a for a in roots if a.date_effet <= command.date_effet and (command.id_avance is None or a.id_avance == command.id_avance)]
    available = sum((a.montant_disponible for a in eligible), ZERO)
    capacities = {t.id_transaction: settlement_capacity(t, command.date_effet, credit=False) for t in candidates}
    explicit = {t.id_transaction: t.montant for t in command.cibles} if command.cibles is not None else None
    if explicit is not None and set(explicit) - set(capacities):
        raise HTTPException(409, 'Une transaction sélectionnée ne peut plus recevoir cette avance à cette date.')
    requested = sum(explicit.values(), ZERO) if explicit is not None else command.montant_avance
    if explicit is not None and command.montant_avance is not None and requested != command.montant_avance:
        raise HTTPException(422, 'Le total sélectionné ne correspond pas au montant d’avance.')
    if requested is None:
        requested = min(available, sum(capacities.values(), ZERO))
    if requested > available:
        raise HTTPException(409, 'Le montant dépasse les avances disponibles à cette date.')
    remaining, targets = requested, []
    for tx in candidates:
        part = explicit.get(tx.id_transaction, ZERO) if explicit is not None else min(remaining, capacities[tx.id_transaction])
        if part > capacities[tx.id_transaction]:
            raise HTTPException(409, 'Le montant dépasse le reste à régler à cette date.')
        remaining -= part
        targets.append({'id_transaction': tx.id_transaction, 'date_transaction': tx.date_transaction.isoformat(),
            'produit_nom': tx.produit.nom_produit, 'before': format(tx.montant_restant, '.2f'),
            'capacity': format(capacities[tx.id_transaction], '.2f'), 'montant': format(part, '.2f'),
            'after': format(tx.montant_restant - part, '.2f')})
    if remaining:
        raise HTTPException(409, 'Les transactions ne peuvent pas absorber ce montant d’avance à cette date.')
    payment_amount = command.paiement.montant if command.paiement else ZERO
    if target and payment_amount > max(ZERO, capacities[target.id_transaction] - requested):
        raise HTTPException(422, 'Le complément dépasse le reste à régler après utilisation de l’avance.')
    if target and targets:
        targets[0]['after'] = format(target.montant_restant - requested - payment_amount, '.2f')
    plan = {'montant_avance': format(requested, '.2f'), 'available': format(available, '.2f'),
        'advance_after': format(available - requested, '.2f'), 'payment_amount': format(payment_amount, '.2f'),
        'money_effect': 'bank' if funding and funding['id_compte'] else 'cash' if payment_amount else 'unchanged',
        'direction': 'ENTREE' if client_id is not None else 'SORTIE', 'targets': targets,
        'id_client': client_id, 'id_fournisseur': supplier_id,
        'dependency_fingerprint': _hash({'command': _payload(command), 'state': dependencies})}
    return plan, candidates, funding


def apply_settlement(db, command, fingerprint, actor):
    payload = _payload(command)
    request_hash = _hash(payload)
    try:
        replay = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if replay is not None:
            return {**replay, 'replayed': True}
        plan, targets, funding = plan_settlement(db, command, lock=True)
        replay = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if replay is not None:
            return {**replay, 'replayed': True}
        if plan['dependency_fingerprint'] != fingerprint:
            raise HTTPException(409, 'Les avances ou les règlements ont changé. Vérifiez un nouvel aperçu.')
        if Decimal(plan['montant_avance']) == 0 and command.paiement is None:
            raise HTTPException(422, 'Aucun montant à enregistrer.')
        by_id = {t.id_transaction: t for t in targets}
        allocation_ids = []
        for row in plan['targets']:
            allocation_ids.extend(allocate_advances(db, by_id[row['id_transaction']], Decimal(row['montant']),
                command.date_effet, actor, command.operation_id, command.id_avance))
        payment_ids = []
        if command.paiement:
            tx = by_id[command.id_transaction]
            payment = Paiement(**command.paiement.model_dump(exclude={'source_reglement', 'id_compte', 'cle_idempotence'}),
                **funding, id_transaction=tx.id_transaction, statut='valide',
                cle_idempotence=f'advance-settlement-{command.operation_id}', id_utilisateur_creation=actor.id_utilisateur)
            db.add(payment)
            db.flush()
            sync_payment_cash_movement(db, payment, tx, current_user=actor, reason=command.reason)
            payment_ids.append(payment.id_paiement)
        result = {'operation_id': str(command.operation_id), 'impact': plan,
            'record': {'allocation_ids': allocation_ids, 'payment_ids': payment_ids}}
        db.add(CorrectionOperation(operation_id=command.operation_id, request_hash=request_hash,
            id_utilisateur=actor.id_utilisateur, reason=command.reason, request_payload=payload, result_payload=result))
        db.flush()
        for row in plan['targets']:
            tx = by_id[row['id_transaction']]
            db.expire(tx, ['paiements'])
            if tx.montant_restant != Decimal(row['after']):
                raise HTTPException(409, 'Le règlement enregistré diffère de l’aperçu.')
        db.commit()
        return {**result, 'replayed': False}
    except (HTTPException, IntegrityError) as error:
        db.rollback()
        replay = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if replay is not None:
            return {**replay, 'replayed': True}
        if isinstance(error, IntegrityError):
            raise HTTPException(409, 'Ce règlement entre en conflit avec les opérations liées.') from error
        raise
    except Exception:
        db.rollback()
        raise
