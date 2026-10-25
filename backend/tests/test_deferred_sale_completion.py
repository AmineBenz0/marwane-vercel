"""Completion against persisted stock; no live accounts or external services."""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.batiment import Batiment
from app.models.client import Client
from app.models.production import Production
from app.models.transaction import Transaction
from app.models.paiement import Paiement
from app.models.caisse import Caisse
from app.models.inventory import MouvementStock
from app.models.audit import TransactionAudit
from app.routers.transactions import create_transaction, create_transactions_with_payments_batch, update_transaction
from app.schemas.transaction import TransactionCreate, TransactionUpdate
from app.schemas.transaction_payment import TransactionPaymentBatchCreate
from app.services.egg_sales import sale_sources
from app.routers.transactions import complete_transaction
from app.schemas.transaction import DeferredSaleCompletion
from app.utils.egg_product_sync import ensure_sellable_egg_product


@pytest.fixture
def deferred_sale(db_session, monkeypatch):
    today = date.today()
    monkeypatch.setattr('app.services.egg_sales.business_date', lambda: today)
    building = Batiment(nom='Source livraison', est_actif=True)
    customer = Client(nom_client='Client livraison', est_actif=True)
    db_session.add_all([building, customer])
    db_session.flush()
    product = ensure_sellable_egg_product(db_session, 'normal', 'moyen')
    source = Production(id_batiment=building.id_batiment, date_production=today - timedelta(days=1),
        type_oeuf='normal', calibre='moyen', nombre_oeufs=600, grammage=55, nombre_cartons=2, est_actif=True)
    db_session.add(source)
    db_session.commit()
    payload = TransactionCreate(date_transaction=source.date_production, id_client=customer.id_client,
        id_produit=product.id_produit, id_batiment=building.id_batiment,
        allocation_automatique=True, est_promesse=True, date_livraison_prevue=today,
        quantite=1000, prix_unitaire=Decimal('1.50'))
    return building, customer, source, payload


def enter_production(db, building_id, quantity, day=None, **extra):
    source = Production(id_batiment=building_id, date_production=day or date.today(),
        type_oeuf=extra.get('type_oeuf', 'normal'), calibre=extra.get('calibre', 'moyen'),
        nombre_oeufs=quantity, grammage=55, nombre_cartons=1, est_actif=True)
    db.add(source)
    db.commit()
    return source


def proposal(client, transaction_id):
    result = client.get(f'/api/v1/transactions/{transaction_id}/completion')
    assert result.status_code == 200, result.text
    return result.json()


def confirmation(data, quantity=None):
    return dict(quantite=quantity if quantity is not None else data['quantite_proposee'],
                quantite_couverte_attendue=data['quantite_couverte'], empreinte_stock=data['empreinte_stock'])


@pytest.mark.parametrize('paid', [False, True])
def test_complete_300_then_100_preserves_sale_payments_and_origins(client, db_session, deferred_sale, paid):
    building, _, original_source, payload = deferred_sale
    if paid:
        batch = TransactionPaymentBatchCreate(items=[dict(client_ref='paid-deferred',
            transaction=payload.model_dump(), paiements=[dict(date_paiement=payload.date_transaction,
                montant='1500', type_paiement='cash')])])
        tx = create_transactions_with_payments_batch(batch, db_session, None)[0]['transaction']
    else:
        tx = create_transaction(payload, db_session, None)
    assert (tx.quantite_couverte, tx.quantite_en_attente) == (600, 400)
    original = (tx.id_transaction, tx.date_transaction, tx.quantite, tx.prix_unitaire, tx.montant_total)
    payments = [(p.id_paiement, p.montant, p.date_paiement, p.statut) for p in db_session.query(Paiement)]
    cash_entries = db_session.query(Caisse).count()
    stock_movements = db_session.query(MouvementStock).count()
    late_source = enter_production(db_session, building.id_batiment, 300)
    available = proposal(client, tx.id_transaction)
    assert available['quantite_proposee'] == 300
    assert available['repartition_stock'] == [dict(id_production=late_source.id_production,
        date_production=late_source.date_production.isoformat(), quantite=300, id_cycle=None)]
    request = confirmation(available)
    response = client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=request)
    assert response.status_code == 200, response.text
    assert (response.json()['quantite_couverte'], response.json()['quantite_en_attente']) == (900, 100)
    # A response lost in transit or a second tab must not confirm these eggs twice.
    assert client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=request).status_code == 409
    db_session.expire_all()
    assert [(a.id_production, a.quantite) for a in tx.allocations] == [(original_source.id_production, 600), (late_source.id_production, 300)]
    assert proposal(client, tx.id_transaction)['quantite_proposee'] == 0
    last = enter_production(db_session, building.id_batiment, 100)
    data = proposal(client, tx.id_transaction)
    assert data['quantite_proposee'] == 100
    response = client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(data))
    assert response.status_code == 200, response.text
    assert (response.json()['quantite_couverte'], response.json()['quantite_en_attente']) == (1000, 0)
    assert {item['id_production']: item['quantite'] for item in response.json()['repartition_stock']} == {
        original_source.id_production: 600, late_source.id_production: 300, last.id_production: 100}
    assert proposal(client, tx.id_transaction)['quantite_proposee'] == 0
    db_session.expire_all()
    assert original == (tx.id_transaction, tx.date_transaction, tx.quantite, tx.prix_unitaire, tx.montant_total)
    assert db_session.query(Transaction).count() == 1
    assert [(p.id_paiement, p.montant, p.date_paiement, p.statut) for p in db_session.query(Paiement)] == payments
    assert db_session.query(Caisse).count() == cash_entries
    assert db_session.query(MouvementStock).count() == stock_movements
    assert tx.montant_paye == (Decimal('1500') if paid else Decimal('0'))


def test_partial_choice_keeps_earlier_reservations_and_blocks_another_client(client, db_session, deferred_sale):
    building, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, None)
    newcomer = Client(nom_client='Autre client', est_actif=True)
    db_session.add(newcomer)
    db_session.commit()
    enter_production(db_session, building.id_batiment, 300)
    # A later promise must not take the older sale's 300 reserved eggs.
    later = create_transaction(payload.model_copy(update={'id_client': newcomer.id_client,
        'quantite': 100, 'montant_total': Decimal('150'),
        'date_livraison_prevue': payload.date_livraison_prevue + timedelta(days=1)}), db_session, None)
    assert proposal(client, later.id_transaction)['quantite_proposee'] == 0
    assert sum(s['disponible'] for s in sale_sources(db_session, building.id_batiment, through_date=date.today())) == 0
    denied = client.post('/api/v1/transactions', json=dict(date_transaction=date.today().isoformat(),
        id_client=newcomer.id_client, id_produit=payload.id_produit, id_batiment=building.id_batiment,
        allocation_automatique=True, quantite=1, prix_unitaire='1.5'))
    assert denied.status_code == 409
    preview = proposal(client, tx.id_transaction)
    response = client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(preview, 200))
    assert response.status_code == 200
    assert response.json()['quantite_en_attente'] == 200
    assert proposal(client, tx.id_transaction)['quantite_proposee'] == 100
    assert proposal(client, later.id_transaction)['quantite_proposee'] == 0


def test_preview_invalidated_by_new_stock_and_excludes_future_or_wrong_category(client, db_session, deferred_sale):
    building, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, None)
    enter_production(db_session, building.id_batiment, 100, day=date.today() + timedelta(days=1))
    enter_production(db_session, building.id_batiment, 100, calibre='gros')
    enter_production(db_session, building.id_batiment, 100, type_oeuf='perdu', calibre=None)
    assert proposal(client, tx.id_transaction)['quantite_proposee'] == 0
    enter_production(db_session, building.id_batiment, 100)
    old = proposal(client, tx.id_transaction)
    enter_production(db_session, building.id_batiment, 100)
    assert client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(old)).status_code == 409
    assert proposal(client, tx.id_transaction)['quantite_couverte'] == 600


@pytest.mark.parametrize('quantity', [0, -1, 1.5, '300', True, 301])
def test_invalid_or_excessive_completion_rejected(client, db_session, deferred_sale, quantity):
    building, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, None)
    enter_production(db_session, building.id_batiment, 300)
    data = proposal(client, tx.id_transaction)
    assert client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(data, quantity)).status_code in (409, 422)
    assert proposal(client, tx.id_transaction)['quantite_couverte'] == 600


def test_price_edit_preserves_confirmed_later_origins_without_confirming_more(client, db_session, deferred_sale):
    building, _, original_source, payload = deferred_sale
    tx = create_transaction(payload, db_session, None)
    late = enter_production(db_session, building.id_batiment, 300)
    data = proposal(client, tx.id_transaction)
    assert client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(data, 200)).status_code == 200
    update_transaction(tx.id_transaction, TransactionUpdate(prix_unitaire=Decimal('2')), db_session, None)
    assert {a.id_production: a.quantite for a in tx.allocations} == {original_source.id_production: 600, late.id_production: 200}
    assert tx.quantite_en_attente == 200


def test_completion_audits_the_actor_and_rejects_cancelled_or_regular_sales(client, db_session, deferred_sale, test_user):
    building, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, None)
    enter_production(db_session, building.id_batiment, 300)
    data = proposal(client, tx.id_transaction)
    complete_transaction(tx.id_transaction, DeferredSaleCompletion(**confirmation(data)), db_session, test_user)
    audit = db_session.query(TransactionAudit).filter_by(champ_modifie='completion_livraison_differee').one()
    assert audit.id_utilisateur == test_user.id_utilisateur
    assert audit.ancienne_valeur == '600'
    assert '900' in audit.nouvelle_valeur
    tx.est_actif = False
    db_session.commit()
    assert client.get(f'/api/v1/transactions/{tx.id_transaction}/completion').status_code == 409
    tx.est_actif = True
    tx.est_promesse = False
    db_session.commit()
    assert client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(data)).status_code == 409


def test_one_source_can_be_partially_confirmed_twice_without_duplicate_origins(client, db_session, deferred_sale):
    building, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, None)
    new_source = enter_production(db_session, building.id_batiment, 300)
    for count in (200, 100):
        data = proposal(client, tx.id_transaction)
        assert client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(data, count)).status_code == 200
    db_session.expire_all()
    assert [a.quantite for a in tx.allocations if a.id_production == new_source.id_production] == [300]
    assert tx.quantite_en_attente == 100


def test_discovery_tracks_paid_sale_partial_completion_and_history(client, db_session, deferred_sale):
    building, customer, original_source, payload = deferred_sale
    original_source.date_production = date.today() - timedelta(days=91)
    db_session.commit()
    # A sale from a previous accounting period must still be discoverable.
    payload = payload.model_copy(update={'date_transaction': date.today() - timedelta(days=90)})
    tx = create_transaction(payload, db_session, None)
    db_session.add(Paiement(id_transaction=tx.id_transaction, date_paiement=date.today(),
                           montant=1500, type_paiement='cash', statut='valide'))
    db_session.commit()
    endpoint = '/api/v1/transactions/deferred-sales'
    rows = client.get(endpoint).json()
    assert len(rows) == 1
    assert rows[0]['nom_client'] == customer.nom_client
    assert rows[0]['quantite_en_attente'] == 400
    assert rows[0]['quantite_reservee'] == 0
    enter_production(db_session, building.id_batiment, 300)
    assert client.get(endpoint).json()[0]['quantite_reservee'] == 300
    data = proposal(client, tx.id_transaction)
    assert client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(data)).status_code == 200
    rows = client.get(endpoint).json()
    assert (rows[0]['quantite_en_attente'], rows[0]['quantite_reservee']) == (100, 0)
    enter_production(db_session, building.id_batiment, 100)
    data = proposal(client, tx.id_transaction)
    assert client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(data)).status_code == 200
    assert client.get(endpoint).json() == []
    history = client.get('/api/v1/transactions', params={'est_promesse': True}).json()
    assert len(history) == 1
    assert history[0]['quantite_en_attente'] == 0
    assert history[0]['montant_paye'] == '1500.00'
    assert db_session.query(Transaction).count() == 1
    assert db_session.query(Paiement).count() == 1


def test_discovery_respects_priority_excludes_future_stock_and_cancelled_sales(client, db_session, deferred_sale):
    building, _, _, payload = deferred_sale
    first = create_transaction(payload, db_session, None)
    later = create_transaction(payload.model_copy(update={
        'date_livraison_prevue': date.today() + timedelta(days=2)}), db_session, None)
    cancelled = create_transaction(payload.model_copy(update={
        'date_livraison_prevue': date.today() + timedelta(days=3)}), db_session, None)
    cancelled.est_actif = False
    db_session.commit()
    enter_production(db_session, building.id_batiment, 300)
    enter_production(db_session, building.id_batiment, 1000, day=date.today() + timedelta(days=1))
    rows = client.get('/api/v1/transactions/deferred-sales').json()
    assert [r['id_transaction'] for r in rows] == [first.id_transaction, later.id_transaction]
    assert [r['quantite_reservee'] for r in rows] == [300, 0]
    history = client.get('/api/v1/transactions', params={'est_promesse': True, 'est_actif': True}).json()
    assert {r['id_transaction']: r['quantite_reservee'] for r in history} == {
        first.id_transaction: 300, later.id_transaction: 0}
    assert client.get('/api/v1/transactions', params={'est_promesse': False}).json() == []


def test_paid_sale_agrees_across_profile_stock_history_and_monthly_reports(client, db_session, deferred_sale, test_user):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    building, customer, original_source, payload = deferred_sale
    prior_month = date.today().replace(day=1) - timedelta(days=1)
    original_source.date_production = prior_month - timedelta(days=1)
    db_session.commit()
    payload = payload.model_copy(update={'date_transaction': prior_month})
    batch = TransactionPaymentBatchCreate(items=[dict(client_ref='reporting',
        transaction=payload.model_dump(), paiements=[dict(date_paiement=prior_month,
            montant='1500', type_paiement='cash')])])
    tx = create_transactions_with_payments_batch(batch, db_session, None)[0]['transaction']
    def report(month):
        result = client.get('/api/v1/reports/monthly', params={'month': month.strftime('%Y-%m')})
        assert result.status_code == 200, result.text
        return result.json()
    before = [report(prior_month), report(date.today())]
    historical = client.get('/api/v1/productions/stock', params={'date_stock': prior_month.isoformat()}).json()
    assert historical['totals']['sold_eggs'] == 600
    for quantity in (300, 100):
        enter_production(db_session, building.id_batiment, quantity)
        stock = client.get('/api/v1/productions/stock').json()['totals']
        assert stock['physical_eggs'] == quantity
        assert stock['reserved_eggs'] == quantity
        assert stock['available_eggs'] == 0
        preview = proposal(client, tx.id_transaction)
        result = client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(preview))
        assert result.status_code == 200, result.text
    profile = client.get(f'/api/v1/clients/{customer.id_client}/profile').json()
    assert len(profile['transactions']) == 1
    sale = profile['transactions'][0]
    assert sale['quantite_couverte'] == 1000
    assert sale['quantite_en_attente'] == 0
    assert Decimal(sale['montant_paye']) == 1500
    history = client.get(f'/api/v1/transactions/{tx.id_transaction}/completion-history').json()
    assert [e['quantite'] for e in history] == [300, 100]
    assert [sum(s['quantite'] for s in e['repartition_stock']) for e in history] == [300, 100]
    assert all(s['date_production'] == date.today().isoformat() for e in history for s in e['repartition_stock'])
    assert client.get('/api/v1/productions/stock/daily').json()['totals']['sold_eggs'] == 400
    assert client.get('/api/v1/productions/stock', params={'date_stock': prior_month.isoformat()}).json() == historical
    assert before == [report(prior_month), report(date.today())]
    assert Decimal(before[0]['ventes']) == 1500
    assert Decimal(before[1]['ventes']) == 0
    assert db_session.query(Transaction).count() == 1
    assert db_session.query(Paiement).count() == 1


def test_current_report_reservations_agree_with_legacy_global_sales(client, db_session, deferred_sale):
    building, customer, _, payload = deferred_sale
    create_transaction(payload, db_session, None)
    db_session.add(Transaction(date_transaction=payload.date_transaction,
        id_client=customer.id_client, id_produit=payload.id_produit,
        quantite=100, prix_unitaire=1, montant_total=100, est_actif=True))
    db_session.commit()
    enter_production(db_session, building.id_batiment, 300)
    stock = client.get('/api/v1/productions/stock').json()['totals']
    assert stock['physical_eggs'] == 200
    assert stock['reserved_eggs'] == 200
    assert stock['available_eggs'] == 0
    assert sum(row['disponible'] for row in sale_sources(db_session, building.id_batiment, through_date=date.today())) == 0
