from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi import HTTPException
from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.correction_operation import CorrectionOperation
from app.models.credit import AffectationCredit, Avance
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.advance_settlement import AdvanceSettlementCommand
from app.services.advance_settlements import plan_settlement, apply_settlement
from app.services.financial import contact_balances
from app.utils.business_date import business_date
from tests.test_credits import cmd, apply
from tests.test_correction_contract import correction_sale, correction_transaction


@pytest.fixture
def unsettled(db_session, correction_sale):
    tx, old = correction_sale
    tx.date_transaction = business_date() - timedelta(days=5)
    old.statut = 'annule'
    db_session.commit()
    return tx


def advance(db, tx, actor, amount='6.00', days=2, account=None):
    return apply(db, cmd('advance', id_client=tx.id_client, id_fournisseur=tx.id_fournisseur,
        montant=amount, date_effet=business_date()-timedelta(days=days),
        type_paiement='virement' if account else 'cash', id_compte=account), actor)


def command(tx=None, **kwargs):
    return AdvanceSettlementCommand(operation_id=uuid4(), reason='Règlement avec avance', date_effet=business_date(),
        **({'id_transaction': tx.id_transaction} if tx else {}), **kwargs)


def save(db, command, actor):
    plan = plan_settlement(db, command)[0]
    return apply_settlement(db, command, plan['dependency_fingerprint'], actor)


def test_mixed_payment_moves_only_complement_and_replays(db_session, unsettled, test_user):
    tx = unsettled
    advance(db_session, tx, test_user)
    request = command(tx, montant_avance='6', paiement={'date_paiement': business_date(), 'montant': '9', 'type_paiement': 'cash'})
    result = save(db_session, request, test_user)
    db_session.expire(tx, ['paiements'])
    assert tx.montant_restant == 0
    assert db_session.query(Caisse).count() == 2
    assert sum(m.montant for m in db_session.query(Caisse).all()) == 15
    assert db_session.query(Paiement).filter(Paiement.nature == 'credit_recu').one().montant == 6
    assert result['impact']['payment_amount'] == '9.00'
    assert apply_settlement(db_session, request, 'a'*64, test_user)['replayed']
    assert db_session.query(Caisse).count() == 2


def test_oldest_debt_and_advances_are_proposed_and_saved_together(db_session, unsettled, test_user):
    tx = unsettled
    other = Transaction(id_client=tx.id_client, id_produit=tx.id_produit, date_transaction=business_date()-timedelta(days=1),
        quantite=5, prix_unitaire=1, montant_total=5, est_actif=True)
    db_session.add(other); db_session.commit()
    first = advance(db_session, tx, test_user, '7', days=4)
    second = advance(db_session, tx, test_user, '10', days=3)
    request = command(id_client=tx.id_client)
    plan = plan_settlement(db_session, request)[0]
    assert [(r['id_transaction'], r['montant']) for r in plan['targets']] == [(tx.id_transaction, '15.00'), (other.id_transaction, '2.00')]
    before = contact_balances(db_session, direction='receivable', contact_ids=[tx.id_client])
    save(db_session, request, test_user)
    db_session.expire_all()
    assert tx.montant_restant == 0 and other.montant_restant == 3
    assert db_session.query(Caisse).count() == 2
    assert contact_balances(db_session, direction='receivable', contact_ids=[tx.id_client]) == before
    rows = db_session.query(AffectationCredit).all()
    assert len(rows) == 3
    assert sum(a.montant for a in rows if str(a.id_avance) == first['record']['id_avance']) == 7


def test_explicit_bulk_adjustments_are_respected(db_session, unsettled, test_user):
    tx = unsettled
    advance(db_session, tx, test_user)
    save(db_session, command(id_client=tx.id_client, cibles=[{'id_transaction': tx.id_transaction, 'montant': '2.50'}]), test_user)
    db_session.expire_all()
    assert tx.montant_restant == Decimal('12.50')
    assert db_session.query(Avance).one().montant_disponible == Decimal('3.50')


def test_stale_preview_and_changed_uuid_payload_do_not_write(db_session, unsettled, test_user):
    tx = unsettled
    advance(db_session, tx, test_user)
    request = command(tx, montant_avance='3')
    plan = plan_settlement(db_session, request)[0]
    save(db_session, command(tx, montant_avance='2'), test_user)
    with pytest.raises(HTTPException) as error:
        apply_settlement(db_session, request, plan['dependency_fingerprint'], test_user)
    assert error.value.status_code == 409
    assert db_session.query(AffectationCredit).count() == 1
    save(db_session, request, test_user)
    with pytest.raises(HTTPException):
        apply_settlement(db_session, request.model_copy(update={'montant_avance': Decimal('1')}), 'a'*64, test_user)


def test_complement_failure_rolls_back_allocations_and_child_journals(db_session, unsettled, test_user, monkeypatch):
    import app.services.advance_settlements as service
    tx = unsettled
    advance(db_session, tx, test_user)
    def fail(*args, **kwargs):
        raise RuntimeError('Injected failure after advance allocation')
    monkeypatch.setattr(service, 'sync_payment_cash_movement', fail)
    with pytest.raises(RuntimeError):
        save(db_session, command(tx, montant_avance='6', paiement={'date_paiement': business_date(), 'montant': '9', 'type_paiement': 'cash'}), test_user)
    assert db_session.query(AffectationCredit).count() == 0
    assert db_session.query(CorrectionOperation).count() == 1
    assert db_session.query(Caisse).count() == 1
    db_session.expire_all()
    assert tx.montant_restant == 15


def test_supplier_bank_complement_is_one_additional_debit(db_session, correction_transaction, test_user):
    tx = correction_transaction
    tx.date_transaction = business_date()-timedelta(days=5)
    account = CompteBancaire(nom_banque='Avance', numero_compte='MIXED-ADVANCE', solde_actuel=0)
    db_session.add(account); db_session.commit()
    advance(db_session, tx, test_user, '10', account=account.id_compte)
    save(db_session, command(tx, montant_avance='10', paiement={'date_paiement': business_date(), 'montant': '15',
        'type_paiement': 'virement', 'id_compte': account.id_compte, 'source_reglement': 'banque'}), test_user)
    assert account.solde_actuel == -25
    assert db_session.query(MouvementBancaire).count() == 2
    assert db_session.query(Caisse).count() == 0


def test_future_advance_and_other_party_cannot_fund_payment(db_session, unsettled, test_user):
    tx = unsettled
    advance(db_session, tx, test_user, days=0)
    request = command(tx, montant_avance='1').model_copy(update={'date_effet': business_date()-timedelta(days=1)})
    with pytest.raises(HTTPException):
        plan_settlement(db_session, request)
    request = command(id_fournisseur=999, montant_avance='1')
    with pytest.raises(HTTPException):
        plan_settlement(db_session, request)


def test_creation_with_advance_payment_and_retry_is_atomic(client, db_session, correction_transaction, test_user, monkeypatch):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    tx = correction_transaction
    tx.date_transaction = business_date()-timedelta(days=5); db_session.commit()
    advance(db_session, tx, test_user, '5')
    payload = {'operation_id': str(uuid4()), 'items': [{'client_ref': 'new-with-advance', 'transaction': {
        'date_transaction': business_date().isoformat(), 'id_produit': tx.id_produit, 'id_fournisseur': tx.id_fournisseur,
        'quantite': 10, 'prix_unitaire': '1'}, 'montant_avance': '5', 'paiements': [{
            'date_paiement': business_date().isoformat(), 'montant': '5', 'type_paiement': 'cash'}]}]}
    first = client.post('/api/v1/transactions/batch-with-payments', json=payload)
    assert first.status_code == 201, first.text
    # Simulate a competing retry whose first journal read happened before the
    # original request committed. The post-lock conflict must replay it too.
    import app.services.correction_contract as contract
    original_replay = contract.replay_result
    calls = []
    def raced_replay(*args, **kwargs):
        calls.append(True)
        return None if len(calls) == 1 else original_replay(*args, **kwargs)
    monkeypatch.setattr(contract, 'replay_result', raced_replay)
    second = client.post('/api/v1/transactions/batch-with-payments', json=payload)
    assert second.status_code == 201, second.text
    assert first.json() == second.json()
    assert db_session.query(Transaction).count() == 2
    target = db_session.get(Transaction, first.json()[0]['transaction']['id_transaction'])
    assert target.montant_restant == 0
    assert db_session.query(Caisse).count() == 2


def test_selected_advance_is_used_without_consuming_an_older_one(db_session, unsettled, test_user):
    tx = unsettled
    older = advance(db_session, tx, test_user, '4', days=4)
    chosen = advance(db_session, tx, test_user, '3', days=2)
    request = command(tx, id_avance=chosen['record']['id_avance'], montant_avance='2')
    save(db_session, request, test_user)
    row = db_session.query(AffectationCredit).one()
    assert str(row.id_avance) == chosen['record']['id_avance']
    assert str(row.id_avance) != older['record']['id_avance']


def test_multiple_new_lines_cannot_overspend_the_same_advance(client, db_session, correction_transaction, test_user):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    tx = correction_transaction
    tx.date_transaction = business_date()-timedelta(days=5); db_session.commit()
    advance(db_session, tx, test_user, '5')
    item = {'transaction': {'date_transaction': business_date().isoformat(), 'id_produit': tx.id_produit,
        'id_fournisseur': tx.id_fournisseur, 'quantite': 10, 'prix_unitaire': '1'}, 'montant_avance': '4', 'paiements': []}
    response = client.post('/api/v1/transactions/batch-with-payments', json={'operation_id': str(uuid4()),
        'items': [{**item, 'client_ref': 'one'}, {**item, 'client_ref': 'two'}]})
    assert response.status_code == 409, response.text
    assert db_session.query(Transaction).count() == 1
    assert db_session.query(AffectationCredit).count() == 0
    assert db_session.query(Caisse).count() == 1
