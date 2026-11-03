"""Public API boundaries for contact-level advances, including legacy history."""
from decimal import Decimal
from uuid import uuid4
import pytest
from app.main import app
from app.utils.dependencies import get_current_active_user
from app.utils.business_date import business_date
from app.models.credit import AffectationCredit, Avance
from app.models.paiement import Paiement
from app.models.caisse import Caisse
from app.models.transaction import Transaction
from app.services.financial import contact_balances
from tests.test_credits import credit_pair, cmd, apply
from tests.test_correction_contract import correction_sale, correction_transaction
from tests.test_advance_settlements import command, save


@pytest.fixture
def actor(client, test_user):
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    return test_user


@pytest.mark.parametrize('batch', [False, True])
@pytest.mark.parametrize('method', ['compensation', 'carte', 'autre'])
def test_retired_payment_method_is_rejected_without_ledger_changes(client, db_session, credit_pair, actor, batch, method):
    target = credit_pair[1]
    payment = {'id_transaction': target.id_transaction, 'montant': '1',
        'date_paiement': business_date().isoformat(), 'type_paiement': method}
    before = (db_session.query(Paiement).count(), db_session.query(Caisse).count())
    path = '/api/v1/paiements/batch' if batch else '/api/v1/paiements'
    response = client.post(path, json={'paiements': [payment]} if batch else payment)
    assert response.status_code == 422, response.text
    assert (db_session.query(Paiement).count(), db_session.query(Caisse).count()) == before


@pytest.mark.parametrize('method', ['carte', 'autre'])
def test_retired_method_cannot_be_created_with_a_transaction(client, db_session, correction_transaction, actor, method):
    tx = correction_transaction
    before = (db_session.query(Transaction).count(), db_session.query(Paiement).count(), db_session.query(Caisse).count())
    response = client.post('/api/v1/transactions/batch-with-payments', json={'items': [{
        'client_ref': 'retired-method', 'transaction': {'date_transaction': business_date().isoformat(),
            'id_produit': tx.id_produit, 'id_fournisseur': tx.id_fournisseur, 'quantite': 1, 'prix_unitaire': '1'},
        'paiements': [{'date_paiement': business_date().isoformat(), 'montant': '1', 'type_paiement': method}]}]})
    assert response.status_code == 422, response.text
    assert (db_session.query(Transaction).count(), db_session.query(Paiement).count(), db_session.query(Caisse).count()) == before


@pytest.mark.parametrize('method', ['carte', 'autre'])
def test_retired_method_cannot_be_selected_by_correction_but_history_is_readable(client, db_session, correction_sale, actor, method):
    tx, payment = correction_sale
    command = {'operation_id': str(uuid4()), 'reason': 'Correction du moyen de paiement',
        'target': {'entity_type': 'paiement', 'entity_id': payment.id_paiement, 'expected_version': payment.row_version},
        'changes': {'type_paiement': method}}
    assert client.post('/api/v1/corrections/preview', json=command).status_code == 422
    assert client.post('/api/v1/corrections/apply', json={**command, 'dependency_fingerprint': 'a'*64}).status_code == 422
    db_session.refresh(payment)
    assert payment.type_paiement == 'cash'
    payment.type_paiement = method  # existing historical record from before removal
    db_session.commit()
    response = client.get(f'/api/v1/paiements/{payment.id_paiement}')
    assert response.status_code == 200, response.text
    assert response.json()['type_paiement'] == method


def test_retired_settlement_rejects_new_use_but_replays_saved_history(client, db_session, credit_pair, actor):
    target = credit_pair[1]
    original = cmd('advance', id_client=target.id_client, montant='3', date_effet=business_date(), type_paiement='cash')
    apply(db_session, original, actor)
    request = command(target, montant_avance='1')
    body = {'command': request.model_dump(mode='json'), 'dependency_fingerprint': 'a'*64}
    assert client.get('/api/v1/credits/settlements/options', params={'id_transaction': target.id_transaction}).status_code == 410
    assert client.post('/api/v1/credits/settlements/preview', json=request.model_dump(mode='json')).status_code == 410
    assert client.post('/api/v1/credits/settlements/apply', json=body).status_code == 410
    assert db_session.query(AffectationCredit).count() == 0
    saved = save(db_session, request, actor)  # historical data created by the retired implementation
    count = db_session.query(AffectationCredit).count()
    replay = client.post('/api/v1/credits/settlements/apply', json=body)
    assert replay.status_code == 200, replay.text
    assert replay.json()['replayed'] is True
    assert replay.json()['operation_id'] == saved['operation_id']
    assert db_session.query(AffectationCredit).count() == count


def test_advance_and_return_update_net_account_without_settling_transaction(client, db_session, credit_pair, actor):
    target = credit_pair[1]
    contact = target.id_client
    before = contact_balances(db_session, direction='receivable', contact_ids=[contact])[contact]
    outstanding = target.montant_restant
    def public_save(request):
        review = client.post('/api/v1/credits/preview', json=request.model_dump(mode='json'))
        assert review.status_code == 200, review.text
        result = client.post('/api/v1/credits/apply', json={'command': request.model_dump(mode='json'),
            'dependency_fingerprint': review.json()['dependency_fingerprint']})
        assert result.status_code == 200, result.text
    advance = cmd('advance', id_client=contact, montant='3', date_effet=business_date(), type_paiement='cash')
    public_save(advance)
    assert contact_balances(db_session, direction='receivable', contact_ids=[contact])[contact] == before - Decimal('3')
    db_session.refresh(target)
    assert target.montant_restant == outstanding
    assert db_session.query(AffectationCredit).count() == 0
    public_save(cmd('return_advance', id_avance=advance.operation_id, montant='1', date_effet=business_date(), type_paiement='cash'))
    assert contact_balances(db_session, direction='receivable', contact_ids=[contact])[contact] == before - Decimal('2')
    assert db_session.get(Avance, advance.operation_id).montant_disponible == Decimal('2')
    assert db_session.query(AffectationCredit).count() == 0
