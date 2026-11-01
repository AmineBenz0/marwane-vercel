from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.correction_operation import CorrectionOperation
from app.models.paiement import Paiement
from app.schemas.refund import RefundCommand, RefundApplyCommand
from app.schemas.correction import CorrectionCommand
from app.services.correction_commands import preview_correction
from app.services.financial import contact_balances, payment_total_as_of, query_financial_transactions, cash_ledger_as_of, bank_ledgers_as_of
from app.services.financial_ledger import sync_payment_cash_movement, void_payment
from app.services.refunds import apply_refund, preview_refund
from app.utils.business_date import business_date
from tests.test_correction_contract import correction_sale, correction_transaction


def setup_credit(db, tx, actor, *, bank=False):
    today = business_date()
    tx.date_transaction = today - timedelta(days=2)
    tx.montant_total = Decimal('10')
    tx.quantite = 10
    tx.prix_unitaire = Decimal('1')
    # Contract fixture has a 5 MAD payment; retain and synchronize it too.
    for existing in tx.paiements:
        existing.date_paiement = today - timedelta(days=1)
        sync_payment_cash_movement(db, existing, tx, current_user=actor)
    account = CompteBancaire(nom_banque='Refund test', numero_compte=str(uuid4()), solde_actuel=Decimal('0'))
    db.add(account)
    db.flush()
    payment = Paiement(id_transaction=tx.id_transaction, montant=Decimal('20'), date_paiement=today - timedelta(days=1),
        type_paiement='virement' if bank else 'cash', id_compte=account.id_compte if bank else None,
        source_reglement=('banque' if bank else 'caisse') if tx.id_fournisseur else None,
        statut='valide', id_utilisateur_creation=actor.id_utilisateur)
    db.add(payment)
    db.flush()
    sync_payment_cash_movement(db, payment, tx, current_user=actor)
    db.commit()
    db.expire(tx, ['paiements'])
    return payment, account


def command(tx, account=None, **kwargs):
    return RefundCommand(operation_id=uuid4(), id_transaction=tx.id_transaction,
        date_paiement=business_date(), montant=Decimal('2.50'), type_paiement='virement' if account else 'cash',
        id_compte=account.id_compte if account else None, reason='Restitution réelle du trop-perçu', **kwargs)


def prepared(db, cmd):
    return RefundApplyCommand(**cmd.model_dump(), dependency_fingerprint=preview_refund(db, cmd)['dependency_fingerprint'])


@pytest.mark.parametrize('supplier', [False, True])
@pytest.mark.parametrize('bank', [False, True])
def test_refund_net_projections_history_direction_and_retry(db_session, correction_sale, correction_transaction, test_user, supplier, bank):
    tx = correction_transaction if supplier else correction_sale[0]
    payment, account = setup_credit(db_session, tx, test_user, bank=bank)
    before_paid = tx.montant_paye
    old_balance = account.solde_actuel
    old_cash = cash_ledger_as_of(db_session, business_date())
    before_day = business_date() - timedelta(days=1)
    assert payment_total_as_of(tx, before_day) == before_paid
    cmd = command(tx, account if bank else None)
    count = db_session.query(Paiement).count()
    ready = prepared(db_session, cmd)
    assert db_session.query(Paiement).count() == count  # preview is read-only
    result = apply_refund(db_session, ready, test_user)
    refund = db_session.get(Paiement, result['record']['id_paiement'])
    db_session.expire(tx, ['paiements'])
    assert refund.nature == 'remboursement' and refund.montant == Decimal('2.50')
    assert tx.montant_paye == before_paid - Decimal('2.50')
    assert payment_total_as_of(tx, before_day) == before_paid
    assert payment_total_as_of(tx, business_date()) == tx.montant_paye
    direction = 'payable' if supplier else 'receivable'
    contact = tx.id_fournisseur if supplier else tx.id_client
    assert contact_balances(db_session, direction=direction, contact_ids=[contact])[contact] == tx.montant_restant
    assert tx.id_transaction in [t.id_transaction for t in query_financial_transactions(db_session, direction=direction, statut='surpaye')]
    ledger_model = MouvementBancaire if bank else Caisse
    movement = db_session.query(ledger_model).filter_by(id_paiement=refund.id_paiement, statut='active').one()
    assert movement.type_mouvement == ('ENTREE' if supplier else 'SORTIE')
    assert movement.montant == Decimal('2.50')
    if bank:
        db_session.refresh(account)
        expected = old_balance + (Decimal('2.50') if supplier else Decimal('-2.50'))
        assert account.solde_actuel == expected
        assert bank_ledgers_as_of(db_session, business_date())[account.id_compte] == expected
    else:
        after = cash_ledger_as_of(db_session, business_date())
        assert after['inflows' if supplier else 'outflows'] == old_cash['inflows' if supplier else 'outflows'] + Decimal('2.50')
    replay = apply_refund(db_session, ready, test_user)
    assert replay['replayed'] and replay['record'] == result['record']
    assert db_session.query(Paiement).count() == count + 1
    assert db_session.query(CorrectionOperation).count() == 1
    assert payment.montant == Decimal('20') and payment.statut == 'valide'
    void_payment(db_session, refund, current_user=test_user, reason='Annulation du test erroné')
    db_session.commit()
    db_session.expire(tx, ['paiements'])
    assert tx.montant_paye == before_paid
    assert db_session.query(ledger_model).filter_by(id_paiement=refund.id_paiement, statut='active').count() == 0
    assert apply_refund(db_session, ready, test_user)['record'] == result['record']  # saved original response


def test_full_refund_exhausts_credit_and_second_request_is_rejected(db_session, correction_sale, test_user):
    tx = correction_sale[0]
    setup_credit(db_session, tx, test_user)
    cmd = command(tx).model_copy(update={'montant': -tx.montant_restant})
    apply_refund(db_session, prepared(db_session, cmd), test_user)
    db_session.expire(tx, ['paiements'])
    assert tx.montant_restant == 0 and tx.statut_paiement == 'paye'
    with pytest.raises(HTTPException, match='409'):
        preview_refund(db_session, command(tx))


@pytest.mark.parametrize('bank', [False, True])
def test_stale_preview_idempotency_conflict_and_rollback(db_session, correction_sale, test_user, monkeypatch, bank):
    tx = correction_sale[0]
    payment, account = setup_credit(db_session, tx, test_user, bank=bank)
    cmd = command(tx, account if bank else None)
    ready = prepared(db_session, cmd)
    payment.notes = 'Changed after preview'
    db_session.commit()
    with pytest.raises(HTTPException) as exc:
        apply_refund(db_session, ready, test_user)
    assert exc.value.status_code == 409
    ready = prepared(db_session, cmd)
    original_count = db_session.query(Caisse).count()
    old_bank_balance = account.solde_actuel
    def fail(*args, **kwargs):
        raise RuntimeError('Injected audit failure')
    with monkeypatch.context() as patcher:
        patcher.setattr('app.services.refunds.record_correction', fail)
        with pytest.raises(RuntimeError):
            apply_refund(db_session, ready, test_user)
    assert db_session.query(Paiement).filter_by(nature='remboursement').count() == 0
    assert db_session.query(Caisse).count() == original_count
    db_session.refresh(account)
    assert account.solde_actuel == old_bank_balance
    result = apply_refund(db_session, prepared(db_session, cmd), test_user)
    with pytest.raises(HTTPException) as exc:
        apply_refund(db_session, ready.model_copy(update={'montant': Decimal('1')}), test_user)
    assert exc.value.status_code == 409


def test_refund_api_preserves_classification_and_validates_payload(client, db_session, correction_sale, test_user):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    tx = correction_sale[0]
    setup_credit(db_session, tx, test_user)
    payload = command(tx).model_dump(mode='json')
    preview = client.post('/api/v1/remboursements/preview', json=payload)
    assert preview.status_code == 200
    payload['dependency_fingerprint'] = preview.json()['dependency_fingerprint']
    result = client.post('/api/v1/remboursements/apply', json=payload)
    assert result.status_code == 200
    assert result.json()['record']['nature'] == 'remboursement'
    status = client.get(f'/api/v1/paiements/transaction/{tx.id_transaction}/statut')
    assert Decimal(status.json()['montant_rembourse']) == Decimal('2.50')
    refunds = client.get('/api/v1/paiements', params={'id_transaction': tx.id_transaction})
    assert any(p['nature'] == 'remboursement' for p in refunds.json())
    cash = client.get('/api/v1/caisse/mouvements', params={'id_transaction': tx.id_transaction})
    assert any(m['nature_reglement'] == 'remboursement' and m['type_mouvement'] == 'SORTIE' for m in cash.json())
    invalid = {**payload, 'operation_id': str(uuid4()), 'montant': '-1'}
    assert client.post('/api/v1/remboursements/preview', json={k: v for k, v in invalid.items() if k != 'dependency_fingerprint'}).status_code == 422


@pytest.mark.parametrize('case', ['past', 'future', 'too_much', 'inactive', 'broken_ledger', 'instrument'])
def test_invalid_refunds_are_rejected(db_session, correction_sale, test_user, case):
    tx = correction_sale[0]
    payment, _ = setup_credit(db_session, tx, test_user)
    cmd = command(tx)
    if case == 'past':
        cmd = cmd.model_copy(update={'date_paiement': tx.date_transaction})
    elif case == 'future':
        cmd = cmd.model_copy(update={'date_paiement': business_date() + timedelta(days=1)})
    elif case == 'too_much':
        cmd = cmd.model_copy(update={'montant': Decimal('100')})
    elif case == 'inactive':
        tx.est_actif = False
    elif case == 'instrument':
        payment.type_paiement = 'cheque'
        payment.statut_cheque = 'encaisse'
    else:
        db_session.query(Caisse).filter_by(id_paiement=payment.id_paiement).one().montant = Decimal('999')
    db_session.commit()
    with pytest.raises(HTTPException):
        preview_refund(db_session, cmd)


@pytest.mark.parametrize('amount', ['0', '-1', '0.001', 'NaN', 'Infinity'])
def test_refund_precision_and_sign_are_validated(amount):
    with pytest.raises(ValidationError):
        RefundCommand(operation_id=uuid4(), id_transaction=1, date_paiement=business_date(),
            montant=amount, type_paiement='cash', reason='Refund test')


def test_refund_financial_values_cannot_use_correction_command(db_session, correction_sale, test_user):
    tx = correction_sale[0]
    setup_credit(db_session, tx, test_user)
    result = apply_refund(db_session, prepared(db_session, command(tx)), test_user)
    with pytest.raises(HTTPException) as exc:
        preview_correction(db_session, CorrectionCommand(operation_id=uuid4(), reason='Not an editable payment',
            target={'entity_type': 'paiement', 'entity_id': result['record']['id_paiement'], 'expected_version': 1},
            changes={'montant': '1'}))
    assert exc.value.status_code == 409


def test_backdated_refund_cannot_spend_credit_already_returned_before_a_later_payment(db_session, correction_sale, test_user):
    tx = correction_sale[0]
    setup_credit(db_session, tx, test_user)
    today = business_date()
    tx.date_transaction = today - timedelta(days=5)
    for payment in tx.paiements:
        payment.date_paiement = today - timedelta(days=4)
        sync_payment_cash_movement(db_session, payment, tx, current_user=test_user)
    db_session.commit()
    first = command(tx).model_copy(update={'montant': Decimal('15'), 'date_paiement': today - timedelta(days=3)})
    apply_refund(db_session, prepared(db_session, first), test_user)
    replenishment = Paiement(id_transaction=tx.id_transaction, montant=Decimal('20'),
        date_paiement=today - timedelta(days=1), type_paiement='cash', statut='valide')
    db_session.add(replenishment)
    db_session.flush()
    sync_payment_cash_movement(db_session, replenishment, tx, current_user=test_user)
    db_session.commit()
    backdated = command(tx).model_copy(update={'montant': Decimal('1'), 'date_paiement': today - timedelta(days=4)})
    with pytest.raises(HTTPException) as exc:
        preview_refund(db_session, backdated)
    assert exc.value.status_code == 409
