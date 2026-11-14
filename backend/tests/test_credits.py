from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pydantic import TypeAdapter, ValidationError
from app.models.credit import Avance, AffectationCredit
from app.models.paiement import Paiement
from app.models.caisse import Caisse
from app.models.lettre_credit import LettreDeCredit
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.transaction import Transaction
from app.models.client import Client
from app.models.correction_operation import CorrectionOperation
from app.schemas.credit import CreditCommand
from app.services.credits import apply_credit, preview_credit, available_sources
from app.services.financial import contact_balances, financial_position_as_of, cash_ledger_as_of, bank_ledgers_as_of, payment_total_as_of
from app.services.financial_ledger import sync_payment_cash_movement
from app.utils.business_date import business_date
from tests.test_correction_contract import correction_sale, correction_transaction


def test_cash_summary_counts_payment_linked_movements_and_keeps_available_lc_separate(
    db_session, correction_sale, test_user,
):
    from app.routers import caisse as caisse_router

    sale, payment = correction_sale
    sale.date_transaction = business_date()
    payment.date_paiement = business_date()
    db_session.add(Caisse(id_paiement=payment.id_paiement, id_transaction=None,
                          montant=payment.montant, type_mouvement='ENTREE', statut='active',
                          date_mouvement=datetime.combine(business_date(), time(12), tzinfo=timezone.utc)))
    for reference, cycle, availability, value in [
        ('held', 'detenue', business_date(), '3.50'),
        ('unverified', 'a_verifier', business_date(), '100'),
        ('future', 'detenue', business_date() + timedelta(days=1), '200'),
    ]:
        db_session.add(LettreDeCredit(numero_reference=reference, montant=Decimal(value),
            date_emission=business_date(), date_disponibilite=availability,
            id_client=sale.id_client, type_detenteur='client', statut='active', statut_cycle=cycle))
    db_session.commit()
    cash = cash_ledger_as_of(db_session, business_date())
    summary = caisse_router.get_solde_complet(db=db_session, current_user=test_user)
    assert cash['balance'] == Decimal('5.00')
    assert summary.solde_reel == cash['balance'] + Decimal('3.50')
    assert summary.entrees_reelles == Decimal('8.50')
    assert summary.sorties_reelles == Decimal('0.00')


@pytest.fixture
def credit_pair(db_session, correction_sale, test_user):
    source, payment = correction_sale
    source.date_transaction = business_date() - timedelta(days=4)
    source.prix_unitaire = Decimal('1')
    source.montant_total = Decimal('10')
    payment.date_paiement = business_date() - timedelta(days=3)
    payment.montant = Decimal('20')
    sync_payment_cash_movement(db_session, payment, source, current_user=test_user)
    target = Transaction(date_transaction=business_date() - timedelta(days=2), id_client=source.id_client,
        id_produit=source.id_produit, quantite=8, prix_unitaire=Decimal('1'), montant_total=Decimal('8'), est_actif=True)
    db_session.add(target)
    db_session.commit()
    return source, target


def cmd(action, **values):
    return TypeAdapter(CreditCommand).validate_python({'operation_id': uuid4(), 'reason': 'Opération réelle de test', 'action': action, **values})


def apply(db, command, actor):
    return apply_credit(db, command, preview_credit(db, command)['dependency_fingerprint'], actor)


def net(db, tx):
    db.expire(tx, ['paiements'])
    return tx.montant_restant


def test_surplus_allocation_conserves_contact_balance_and_never_repeats_cash(db_session, credit_pair, test_user):
    source, target = credit_pair
    before = contact_balances(db_session, direction='receivable', contact_ids=[source.id_client])
    ledger = cash_ledger_as_of(db_session, business_date())
    c = cmd('allocate', id_transaction_source=source.id_transaction, id_transaction_cible=target.id_transaction,
            montant='4.00', date_effet=business_date())
    preview = preview_credit(db_session, c)
    assert db_session.query(AffectationCredit).count() == 0
    result = apply_credit(db_session, c, preview['dependency_fingerprint'], test_user)
    assert net(db_session, source) == Decimal('-6')
    assert net(db_session, target) == Decimal('4')
    assert contact_balances(db_session, direction='receivable', contact_ids=[source.id_client]) == before
    assert cash_ledger_as_of(db_session, business_date()) == ledger
    assert db_session.query(Caisse).count() == 1
    assert db_session.query(Paiement).filter(Paiement.id_affectation == c.operation_id).count() == 2
    replay = apply_credit(db_session, c, preview['dependency_fingerprint'], test_user)
    assert replay['replayed'] and replay['record'] == result['record']
    assert db_session.query(AffectationCredit).count() == 1
    assert payment_total_as_of(target, business_date() - timedelta(days=1)) == 0
    cancel = cmd('cancel_allocation', id_affectation=c.operation_id)
    apply(db_session, cancel, test_user)
    assert net(db_session, source) == Decimal('-10') and net(db_session, target) == Decimal('8')
    assert db_session.query(Caisse).count() == 1
    assert all(p.statut == 'annule' for p in db_session.query(Paiement).filter_by(id_affectation=c.operation_id))


@pytest.mark.parametrize('supplier', [False, True])
@pytest.mark.parametrize('bank', [False, True])
def test_advance_allocate_return_and_cancel_all_effects(db_session, credit_pair, correction_transaction, test_user, supplier, bank):
    target = correction_transaction if supplier else credit_pair[1]
    account = CompteBancaire(nom_banque='Avances test', numero_compte=str(uuid4()), solde_actuel=Decimal('0'))
    db_session.add(account)
    db_session.commit()
    direction = 'payable' if supplier else 'receivable'
    contact = target.id_fournisseur if supplier else target.id_client
    party = {'id_fournisseur' if supplier else 'id_client': contact}
    before = contact_balances(db_session, direction=direction, contact_ids=[contact])[contact]
    c = cmd('advance', **party, montant='30', date_effet=business_date(), type_paiement='virement' if bank else 'cash', id_compte=account.id_compte if bank else None)
    initial = apply(db_session, c, test_user)
    advance = db_session.get(Avance, c.operation_id)
    assert advance.montant_disponible == Decimal('30')
    assert contact_balances(db_session, direction=direction, contact_ids=[contact])[contact] == before - Decimal('30')
    ledger_model = MouvementBancaire if bank else Caisse
    movement = db_session.query(ledger_model).filter_by(id_avance=c.operation_id, statut='active').one()
    assert movement.type_mouvement == ('SORTIE' if supplier else 'ENTREE')
    allocation = cmd('allocate', id_avance=c.operation_id, id_transaction_cible=target.id_transaction, montant='5', date_effet=business_date())
    cash_count = db_session.query(Caisse).count()
    bank_count = db_session.query(MouvementBancaire).count()
    apply(db_session, allocation, test_user)
    db_session.expire(advance)
    assert advance.montant_disponible == Decimal('25')
    assert contact_balances(db_session, direction=direction, contact_ids=[contact])[contact] == before - Decimal('30')
    assert db_session.query(Caisse).count() == cash_count and db_session.query(MouvementBancaire).count() == bank_count
    with pytest.raises(HTTPException):
        preview_credit(db_session, cmd('cancel_advance', id_avance=advance.id_avance))
    returned = cmd('return_advance', id_avance=advance.id_avance, montant='10', date_effet=business_date(),
        type_paiement='virement' if bank else 'cash', id_compte=account.id_compte if bank else None)
    apply(db_session, returned, test_user)
    db_session.expire(advance)
    assert advance.montant_disponible == Decimal('15')
    back = db_session.query(ledger_model).filter_by(id_avance=returned.operation_id, statut='active').one()
    assert back.type_mouvement == ('ENTREE' if supplier else 'SORTIE')
    apply(db_session, cmd('cancel_advance', id_avance=returned.operation_id), test_user)
    apply(db_session, cmd('cancel_allocation', id_affectation=allocation.operation_id), test_user)
    apply(db_session, cmd('cancel_advance', id_avance=advance.id_avance), test_user)
    assert contact_balances(db_session, direction=direction, contact_ids=[contact])[contact] == before
    assert db_session.query(ledger_model).filter(ledger_model.id_avance.in_([advance.id_avance, returned.operation_id]), ledger_model.statut == 'active').count() == 0
    if bank:
        db_session.refresh(account)
        assert account.solde_actuel == Decimal('0')
        assert bank_ledgers_as_of(db_session, business_date())[account.id_compte] == Decimal('0')


@pytest.mark.parametrize('case', ['excess', 'other_contact', 'same_transaction', 'past', 'future', 'inactive'])
def test_invalid_allocations_are_rejected(db_session, credit_pair, test_user, case):
    source, target = credit_pair
    values = dict(id_transaction_source=source.id_transaction, id_transaction_cible=target.id_transaction,
                  montant='4', date_effet=business_date())
    if case == 'excess': values['montant'] = '9'
    if case == 'same_transaction': values['id_transaction_cible'] = source.id_transaction
    if case == 'past': values['date_effet'] = source.date_transaction
    if case == 'future': values['date_effet'] += timedelta(days=1)
    if case == 'inactive': target.est_actif = False
    if case == 'other_contact':
        other = Client(nom_client='Autre client')
        db_session.add(other)
        db_session.flush()
        target.id_client = other.id_client
    db_session.commit()
    with pytest.raises((HTTPException, ValidationError)):
        preview_credit(db_session, cmd('allocate', **values))


def test_stale_preview_and_failure_roll_back_both_sides(db_session, credit_pair, test_user, monkeypatch):
    source, target = credit_pair
    c = cmd('allocate', id_transaction_source=source.id_transaction, id_transaction_cible=target.id_transaction,
            montant='4', date_effet=business_date())
    old = preview_credit(db_session, c)
    source.paiements[0].notes = 'Changement après aperçu'
    db_session.commit()
    with pytest.raises(HTTPException) as exc:
        apply_credit(db_session, c, old['dependency_fingerprint'], test_user)
    assert exc.value.status_code == 409
    fresh = preview_credit(db_session, c)
    def fail(): raise RuntimeError('Injected failure before commit')
    with monkeypatch.context() as patcher:
        patcher.setattr(db_session, 'commit', fail)
        with pytest.raises(RuntimeError):
            apply_credit(db_session, c, fresh['dependency_fingerprint'], test_user)
    assert db_session.query(AffectationCredit).count() == 0
    assert db_session.query(Paiement).filter(Paiement.id_affectation.isnot(None)).count() == 0
    assert db_session.query(CorrectionOperation).count() == 0
    assert net(db_session, source) == Decimal('-10') and net(db_session, target) == Decimal('8')


@pytest.mark.parametrize('bank', [False, True])
def test_advance_failure_does_not_leave_cash_or_bank_effect(db_session, credit_pair, test_user, monkeypatch, bank):
    from app.services import credits
    account = CompteBancaire(nom_banque='Atomic advance', numero_compte=str(uuid4()), solde_actuel=Decimal('0'))
    db_session.add(account)
    db_session.commit()
    c = cmd('advance', id_client=credit_pair[0].id_client, montant='20', date_effet=business_date(),
            type_paiement='virement' if bank else 'cash', id_compte=account.id_compte if bank else None)
    original = credits._advance_movement
    def fail(*args):
        original(*args)
        raise RuntimeError('Ledger written, operation fails')
    with monkeypatch.context() as patcher:
        patcher.setattr(credits, '_advance_movement', fail)
        with pytest.raises(RuntimeError): apply(db_session, c, test_user)
    assert db_session.query(Avance).count() == 0
    assert db_session.query(Caisse).filter(Caisse.id_avance.isnot(None)).count() == 0
    assert db_session.query(MouvementBancaire).filter(MouvementBancaire.id_avance.isnot(None)).count() == 0
    db_session.refresh(account)
    assert account.solde_actuel == 0


def test_credit_endpoints_and_sources(client, db_session, credit_pair, test_user):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    source, target = credit_pair
    assert available_sources(db_session, target.id_transaction)[0]['id'] == source.id_transaction
    c = cmd('allocate', id_transaction_source=source.id_transaction, id_transaction_cible=target.id_transaction,
            montant='4', date_effet=business_date())
    preview = client.post('/api/v1/credits/preview', json=c.model_dump(mode='json'))
    assert preview.status_code == 410
    body = {'command': c.model_dump(mode='json'), 'dependency_fingerprint': 'a'*64}
    assert client.post('/api/v1/credits/apply', json=body).status_code == 410
    assert db_session.query(AffectationCredit).count() == 0
    # Seed a historical allocation: reads, exact retries and cancellation remain supported.
    result = apply(db_session, c, test_user)
    assert client.post('/api/v1/credits/apply', json=body).json()['replayed'] is True
    record_id = result['payment_ids'][0]
    assert client.delete(f'/api/v1/paiements/{record_id}').status_code == 409
    assert client.delete(f'/api/v1/transactions/{target.id_transaction}').status_code == 409
    assert len(client.get('/api/v1/credits/allocations', params={'transaction_id': target.id_transaction}).json()) == 1
    cancel = cmd('cancel_allocation', id_affectation=c.operation_id)
    review = client.post('/api/v1/credits/preview', json=cancel.model_dump(mode='json'))
    assert review.status_code == 200
    assert client.post('/api/v1/credits/apply', json={'command': cancel.model_dump(mode='json'),
        'dependency_fingerprint': review.json()['dependency_fingerprint']}).status_code == 200
    assert db_session.get(AffectationCredit, c.operation_id).statut == 'annule'


def test_credit_rows_remain_compatible_with_transaction_correction_and_refunds(db_session, credit_pair, test_user):
    from app.schemas.correction import CorrectionCommand, CorrectionTarget
    from app.services.correction_commands import preview_correction
    from app.schemas.refund import RefundCommand, RefundApplyCommand
    from app.services.refunds import preview_refund, apply_refund
    from app.services.reconciliation import run_integrity_check
    source, target = credit_pair
    c = cmd('allocate', id_transaction_source=source.id_transaction, id_transaction_cible=target.id_transaction,
            montant='4', date_effet=business_date())
    apply(db_session, c, test_user)
    # The UUID link must serialize through the existing correction dependency fingerprint.
    correction = CorrectionCommand(operation_id=uuid4(), target=CorrectionTarget(entity_type='transaction',
        entity_id=source.id_transaction, expected_version=source.row_version), reason='Échéance corrigée',
        changes={'date_echeance': business_date() + timedelta(days=4)})
    assert preview_correction(db_session, correction)['can_apply']
    refund = RefundCommand(operation_id=uuid4(), id_transaction=source.id_transaction, montant='6',
        date_paiement=business_date(), type_paiement='cash', reason='Crédit réellement rendu')
    review = preview_refund(db_session, refund)
    apply_refund(db_session, RefundApplyCommand(**refund.model_dump(), dependency_fingerprint=review['dependency_fingerprint']), test_user)
    assert net(db_session, source) == 0 and net(db_session, target) == 4
    assert cash_ledger_as_of(db_session, business_date())['balance'] == Decimal('14')
    assert not any(i['code'] in {'CREDIT_PAIR_MISMATCH', 'PAYMENT_MOVEMENT_MISMATCH', 'ADVANCE_MOVEMENT_MISMATCH'} for i in run_integrity_check(db_session))


def test_one_cent_advance_as_of_position_retries_and_historical_balances(db_session, credit_pair, test_user):
    from app.services.credit_balances import advance_balances
    source, target = credit_pair
    day = business_date() - timedelta(days=1)
    before = financial_position_as_of(db_session, day)
    c = cmd('advance', id_client=source.id_client, montant='0.01', date_effet=day, type_paiement='cash')
    result = apply(db_session, c, test_user)
    same = c.model_copy(update={'montant': Decimal('0.010')})
    assert apply_credit(db_session, same, 'ignored-on-retry', test_user)['record'] == result['record']
    assert advance_balances(db_session, direction='receivable', as_of=day - timedelta(days=1)) == {}
    assert financial_position_as_of(db_session, day)['receivables'] == before['receivables'] - Decimal('0.01')
    alloc = cmd('allocate', id_avance=c.operation_id, id_transaction_cible=target.id_transaction, montant='0.01', date_effet=business_date())
    apply(db_session, alloc, test_user)
    assert financial_position_as_of(db_session, day)['receivables'] == before['receivables'] - Decimal('0.01')
    assert advance_balances(db_session, direction='receivable')[source.id_client] == 0
    with pytest.raises(HTTPException):
        preview_credit(db_session, cmd('return_advance', id_avance=c.operation_id, montant='0.01', date_effet=business_date(), type_paiement='cash'))


def test_backdated_allocation_cannot_consume_credit_already_used_later(db_session, credit_pair, test_user):
    source, target = credit_pair
    apply(db_session, cmd('allocate', id_transaction_source=source.id_transaction, id_transaction_cible=target.id_transaction,
        montant='8', date_effet=business_date() - timedelta(days=1)), test_user)
    # Replenish the source today; that cannot make yesterday's already-used funds available again.
    payment = Paiement(id_transaction=source.id_transaction, montant=Decimal('10'), date_paiement=business_date(),
        type_paiement='cash', statut='valide', id_utilisateur_creation=test_user.id_utilisateur)
    db_session.add(payment); db_session.flush()
    sync_payment_cash_movement(db_session, payment, source, current_user=test_user)
    third = Transaction(date_transaction=target.date_transaction, id_client=target.id_client, id_produit=target.id_produit,
        quantite=10, prix_unitaire=Decimal('1'), montant_total=Decimal('10'), est_actif=True)
    db_session.add(third); db_session.commit()
    with pytest.raises(HTTPException):
        preview_credit(db_session, cmd('allocate', id_transaction_source=source.id_transaction, id_transaction_cible=third.id_transaction,
            montant='3', date_effet=business_date() - timedelta(days=2)))
