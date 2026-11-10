from copy import deepcopy
from decimal import Decimal
from uuid import uuid4

from tests.test_correction_contract import correction_sale, prepared, revision_trigger
from tests.test_stock_corrections import command, egg_orders
from app.models.correction_operation import EntityRevision
from app.models.paiement import Paiement
from app.services.correction_commands import preview_correction, apply_correction, _snapshot
from app.services.correction_history import transaction_correction_history
from app.models.transaction import Transaction


def test_history_returns_before_values_and_prepares_safe_reuse(db_session, correction_sale, test_user):
    tx, _ = correction_sale
    before = _snapshot('transaction', tx)
    revision_trigger(db_session, 'transactions', 'prix_unitaire')
    cmd = command(tx, {'prix_unitaire': '2.00'})
    result = apply_correction(db_session, prepared(db_session, cmd), test_user)
    db_session.add(EntityRevision(entity_type='transaction', entity_id=tx.id_transaction,
        revision=2, operation_id=cmd.operation_id, event_kind='update', before_snapshot=before,
        after_snapshot=deepcopy(result['record']), id_utilisateur=test_user.id_utilisateur))
    db_session.commit()
    history = transaction_correction_history(db_session, tx.id_transaction)
    assert len(history['items']) == 1 and not history['has_more']
    entry = history['items'][0]
    assert entry['reuse_changes'] == {'prix_unitaire': '1.50'}
    assert entry['before']['prix_unitaire'] == '1.50'
    assert entry['after']['prix_unitaire'] == '2.00'
    assert entry['actor_name'] == test_user.nom_utilisateur
    other = Transaction(date_transaction=tx.date_transaction, id_client=tx.id_client,
        id_produit=tx.id_produit, quantite=1, prix_unitaire=1, montant_total=1, est_actif=True)
    db_session.add(other); db_session.commit()
    assert transaction_correction_history(db_session, other.id_transaction)['items'] == []


def test_preview_balance_uses_latest_effective_payments(db_session, correction_sale):
    tx, _ = correction_sale
    # A mounted editor may still display the previous paid total.
    db_session.add(Paiement(id_transaction=tx.id_transaction, date_paiement=tx.date_transaction,
        montant=Decimal('20'), type_paiement='cash', statut='valide'))
    db_session.add(Paiement(id_transaction=tx.id_transaction, date_paiement=tx.date_transaction,
        montant=Decimal('99'), type_paiement='cash', statut='annule'))
    db_session.commit()
    preview = preview_correction(db_session, command(tx, {'prix_unitaire': '2.00'}))
    assert preview['impact']['balance'] == {'total': '20.00', 'paid': '25.00', 'remaining': '-5.00', 'side': 'client'}
    assert not db_session.dirty


def test_payment_correction_is_in_its_transaction_history(db_session, correction_sale, test_user):
    from app.schemas.correction import CorrectionCommand
    tx, payment = correction_sale
    before = _snapshot('paiement', payment)
    revision_trigger(db_session, 'paiements', 'notes')
    cmd = CorrectionCommand(operation_id=uuid4(), reason='Précision sur le paiement',
        target={'entity_type': 'paiement', 'entity_id': payment.id_paiement, 'expected_version': payment.row_version},
        changes={'notes': 'Justificatif reçu'})
    result = apply_correction(db_session, prepared(db_session, cmd), test_user)
    db_session.add(EntityRevision(entity_type='paiement', entity_id=payment.id_paiement,
        revision=2, operation_id=cmd.operation_id, event_kind='update', before_snapshot=before,
        after_snapshot=deepcopy(result['record']), id_utilisateur=test_user.id_utilisateur))
    db_session.commit()
    item = transaction_correction_history(db_session, tx.id_transaction)['items'][0]
    assert item['target']['entity_type'] == 'paiement'
    assert item['reuse_changes'] == {'notes': None}



def test_related_order_history_includes_the_stock_correction(db_session, egg_orders, test_user):
    tx, other, _ = egg_orders
    snapshots = {row.id_transaction: _snapshot('transaction', row) for row in (tx, other)}
    cmd = command(tx, {'quantite': 50})
    apply_correction(db_session, prepared(db_session, cmd), test_user)
    for row in (tx, other):
        db_session.add(EntityRevision(entity_type='transaction', entity_id=row.id_transaction,
            revision=row.row_version, operation_id=cmd.operation_id, event_kind='update',
            before_snapshot=snapshots[row.id_transaction], after_snapshot=_snapshot('transaction', row),
            id_utilisateur=test_user.id_utilisateur))
    db_session.commit()
    history = transaction_correction_history(db_session, other.id_transaction)
    assert len(history['items']) == 1
    assert history['items'][0]['target']['entity_id'] == tx.id_transaction
    assert history['items'][0]['impact']['stock']['after'][str(other.id_transaction)][0]['quantite'] == 30


def test_history_http_scope_and_pagination_validation(client, correction_sale, auth_headers):
    tx, _ = correction_sale
    response = client.get('/api/v1/corrections/history', params={'transaction_id': tx.id_transaction}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()['items'] == []
    assert response.json()['has_more'] is False
    assert client.get('/api/v1/corrections/history', params={'transaction_id': 99999}, headers=auth_headers).status_code == 404
    assert client.get('/api/v1/corrections/history', params={'transaction_id': tx.id_transaction, 'limit': 51}, headers=auth_headers).status_code == 422
    assert client.get('/api/v1/corrections/history', params={'transaction_id': tx.id_transaction, 'offset': -1}, headers=auth_headers).status_code == 422
