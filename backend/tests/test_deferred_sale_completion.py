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
from app.routers.transactions import create_transaction as create_transaction_response, create_transactions_with_payments_batch, update_transaction, delete_transaction, reactivate_transaction
from app.schemas.transaction import TransactionCreate, TransactionUpdate
from app.schemas.transaction_payment import TransactionPaymentBatchCreate
from app.services.egg_sales import sale_sources
from app.routers.transactions import complete_transaction
from app.schemas.transaction import DeferredSaleCompletion
from app.utils.egg_product_sync import ensure_sellable_egg_product
from app.routers.productions import create_daily_production, update_daily_production
from app.schemas.production import ProductionDailyInput


def create_transaction(payload, db, user):
    """Inspect persisted state after writes; API responses are immutable snapshots."""
    response = create_transaction_response(payload, db, user)
    return db.get(Transaction, response.id_transaction)


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
        date_production=late_source.date_production.isoformat(), quantite=300, quantite_livree=0, id_cycle=None)]
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


def test_automatic_reservation_keeps_stock_for_the_older_promise(client, db_session, deferred_sale):
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
    assert tx.quantite_couverte == 900
    assert tx.quantite_en_attente == 400
    assert proposal(client, tx.id_transaction)['quantite_proposee'] == 300
    assert later.quantite_couverte == 0
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


def test_reschedule_and_cancel_remainder_preserve_sale_and_record_history(client, db_session, deferred_sale, test_user):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    _, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, test_user)
    before = (tx.id_transaction, tx.quantite, tx.montant_total)
    db_session.add(Paiement(id_transaction=tx.id_transaction, date_paiement=date.today(),
                           montant=Decimal('1500'), type_paiement='cash', statut='valide'))
    db_session.commit()
    new_date = (payload.date_livraison_prevue + timedelta(days=2)).isoformat()
    response = client.patch(f'/api/v1/transactions/{tx.id_transaction}/delivery-date',
                            json={'date_livraison_prevue': new_date})
    assert response.status_code == 200, response.text
    response = client.post(f'/api/v1/transactions/{tx.id_transaction}/cancel-remainder')
    assert response.status_code == 200, response.text
    assert response.json()['quantite_couverte'] == 600
    assert response.json()['quantite_en_attente'] == 0
    assert response.json()['quantite_annulee'] == 400
    history = client.get(f'/api/v1/transactions/{tx.id_transaction}/completion-history').json()
    assert [event['type'] for event in history] == ['reschedule', 'cancel_remainder']
    assert db_session.query(Transaction).count() == 1
    assert (tx.id_transaction, tx.quantite, tx.montant_total) == before
    assert tx.montant_paye == Decimal('1500')
    assert tx.date_livraison_prevue.isoformat() == new_date
    app.dependency_overrides.pop(get_current_active_user, None)


def test_historical_stock_keeps_promise_remainder_until_its_cancellation_date(client, db_session, deferred_sale, test_user):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    _, _, source, payload = deferred_sale
    tx = create_transaction(payload, db_session, test_user)
    historical_date = source.date_production.isoformat()

    response = client.post(f'/api/v1/transactions/{tx.id_transaction}/cancel-remainder')
    assert response.status_code == 200, response.text
    snapshot = client.get('/api/v1/productions/stock', params={'date_stock': historical_date}).json()['totals']
    assert snapshot['promised_pending_eggs'] == 400
    assert snapshot['balance_after_promises'] == -400
    current = client.get('/api/v1/productions/stock').json()['totals']
    assert current['promised_pending_eggs'] == 0
    assert current['balance_after_promises'] == 0
    app.dependency_overrides.pop(get_current_active_user, None)


def test_whole_cancel_and_reactivation_preserve_completed_stock_and_void_payments(db_session, deferred_sale, test_user):
    _, _, _, payload = deferred_sale
    tx = create_transaction(payload, db_session, test_user)
    payment = Paiement(id_transaction=tx.id_transaction, date_paiement=payload.date_transaction,
                       montant=Decimal('1500'), type_paiement='cash', statut='valide')
    db_session.add(payment)
    db_session.commit()

    delete_transaction(tx.id_transaction, 'Correction du client', db_session, test_user)
    assert tx.est_actif is False
    assert payment.statut == 'annule'
    reactivate_transaction(tx.id_transaction, db_session, test_user)
    db_session.refresh(tx)

    assert tx.est_actif is True
    assert (tx.quantite_completee, tx.quantite_en_attente) == (600, 400)
    assert [(allocation.quantite, allocation.quantite_livree) for allocation in tx.allocations] == [(600, 600)]
    assert payment.statut == 'annule'
    assert db_session.query(Paiement).filter(Paiement.id_transaction == tx.id_transaction).count() == 1


def test_closing_remainder_releases_reserved_stock_to_next_promise(client, db_session, deferred_sale, test_user, monkeypatch):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    from app.services.egg_sales import assign_pending_promises, deferred_sale_reservations
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    building, _, _, payload = deferred_sale
    oldest = create_transaction(payload, db_session, test_user)
    next_sale = create_transaction(payload.model_copy(update={
        'quantite': 500, 'montant_total': Decimal('750'),
        'date_livraison_prevue': payload.date_livraison_prevue + timedelta(days=1),
    }), db_session, test_user)
    enter_production(db_session, building.id_batiment, 300)
    assign_pending_promises(db_session, building_id=building.id_batiment, current_user=test_user)
    db_session.commit()
    assert (oldest.quantite_completee, oldest.quantite_en_attente) == (600, 400)
    assert deferred_sale_reservations(db_session)[oldest.id_transaction] == 300
    response = client.post(f'/api/v1/transactions/{oldest.id_transaction}/cancel-remainder')
    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert (oldest.quantite_completee, oldest.quantite_en_attente, oldest.quantite_annulee) == (600, 0, 400)
    assert oldest.quantite_couverte == 600
    assert next_sale.quantite_couverte == 300
    assert next_sale.quantite_en_attente == 500
    app.dependency_overrides.pop(get_current_active_user, None)


def test_thursday_sale_friday_stock_saturday_completion_keeps_single_financial_sale(client, db_session, deferred_sale, monkeypatch, test_user):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    building, _, original_source, payload = deferred_sale
    today = date.today()
    days_since_thursday = (today.weekday() - 3) % 7 or 7
    thursday = today - timedelta(days=days_since_thursday)
    friday, saturday = thursday + timedelta(days=1), thursday + timedelta(days=2)
    monkeypatch.setattr('app.services.egg_sales.business_date', lambda: saturday)
    original_source.date_production = thursday
    db_session.commit()
    transaction = create_transaction(payload.model_copy(update={
        'date_transaction': thursday,
        'date_livraison_prevue': saturday,
    }), db_session, None)
    enter_production(db_session, building.id_batiment, 400, day=friday)
    first = proposal(client, transaction.id_transaction)
    assert first['quantite_proposee'] == 400
    assert client.post(f'/api/v1/transactions/{transaction.id_transaction}/completion',
                       json=confirmation(first, 300)).status_code == 200
    second = proposal(client, transaction.id_transaction)
    assert second['quantite_proposee'] == 100
    assert client.post(f'/api/v1/transactions/{transaction.id_transaction}/completion',
                       json=confirmation(second, 100)).status_code == 200
    db_session.expire_all()
    history = client.get(f'/api/v1/transactions/{transaction.id_transaction}/completion-history').json()
    assert [sum(source['quantite'] for source in event['repartition_stock']) for event in history] == [300, 100]
    assert all(source['date_production'] == friday.isoformat() for event in history for source in event['repartition_stock'])
    assert transaction.date_transaction == thursday
    assert transaction.quantite == 1000
    assert db_session.query(Transaction).count() == 1
    assert db_session.query(Paiement).count() == 0


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


def test_production_saves_reserve_fifo_and_repeat_updates_do_not_duplicate(client, db_session, deferred_sale, monkeypatch, test_user):
    building, _, _, payload = deferred_sale
    today = date.today()
    monkeypatch.setattr('app.services.egg_sales.business_date', lambda: today)
    oldest = create_transaction(payload, db_session, test_user)
    later = create_transaction(payload.model_copy(update={
        'quantite': 300, 'montant_total': Decimal('450'),
    }), db_session, test_user)
    assert (oldest.quantite_couverte, oldest.quantite_en_attente) == (600, 400)
    assert (later.quantite_couverte, later.quantite_en_attente) == (0, 300)

    daily = create_daily_production(ProductionDailyInput(
        id_batiment=building.id_batiment,
        date_production=today,
        quantites={'normal': 300},
        grammage=Decimal('55'),
    ), db_session, test_user)
    assert (oldest.quantite_couverte, oldest.quantite_completee, oldest.quantite_en_attente) == (900, 600, 400)
    assert (later.quantite_couverte, later.quantite_en_attente) == (0, 300)
    assert daily['reservations_stock'] == [dict(id_transaction=oldest.id_transaction, quantite=300)]
    stock = client.get('/api/v1/productions/stock').json()
    assert stock['totals']['reserved_eggs'] == 300
    assert stock['totals']['physical_eggs'] == 300
    assert stock['totals']['available_eggs'] == 0
    assert stock['totals']['promised_pending_eggs'] == 700
    assert stock['totals']['balance_after_promises'] == -400
    assert stock['batiments'][0]['categories'][0]['reserved_eggs'] == 300
    assert sum(row['disponible'] for row in sale_sources(db_session, building.id_batiment, through_date=today)) == 0

    daily = update_daily_production(ProductionDailyInput(
        id_batiment=building.id_batiment,
        date_production=today,
        quantites={'normal': 500},
        grammage=Decimal('55'),
        versions=daily['versions'],
        charge_versions=daily['charge_versions'],
    ), db_session, test_user)
    assert (oldest.quantite_couverte, oldest.quantite_completee, oldest.quantite_en_attente) == (1000, 600, 400)
    assert (later.quantite_couverte, later.quantite_completee, later.quantite_en_attente) == (100, 0, 300)
    assert daily['reservations_stock'] == [
        dict(id_transaction=oldest.id_transaction, quantite=100),
        dict(id_transaction=later.id_transaction, quantite=100),
    ]
    stock = client.get('/api/v1/productions/stock').json()['totals']
    assert (stock['available_eggs'], stock['reserved_eggs'], stock['physical_eggs']) == (0, 500, 500)
    assert (stock['promised_pending_eggs'], stock['balance_after_promises']) == (700, -200)

    daily = update_daily_production(ProductionDailyInput(
        id_batiment=building.id_batiment,
        date_production=today,
        quantites={'normal': 500},
        grammage=Decimal('55'),
        versions=daily['versions'],
        charge_versions=daily['charge_versions'],
    ), db_session, test_user)
    assert (oldest.quantite_couverte, oldest.quantite_completee, oldest.quantite_en_attente) == (1000, 600, 400)
    assert (later.quantite_couverte, later.quantite_completee, later.quantite_en_attente) == (100, 0, 300)
    assert daily['reservations_stock'] == []
    editing_oldest = sale_sources(db_session, building.id_batiment,
        exclude_transaction_id=oldest.id_transaction, through_date=today)
    editing_later = sale_sources(db_session, building.id_batiment,
        exclude_transaction_id=later.id_transaction, through_date=today)
    assert sum(row['disponible'] for row in editing_oldest) == 1000
    assert sum(row['disponible'] for row in editing_later) == 100
    assert sum(row['disponible'] for row in sale_sources(db_session, building.id_batiment, through_date=today)) == 0
    assert (oldest.quantite_couverte, later.quantite_couverte) == (1000, 100)
    audits = db_session.query(TransactionAudit).filter(
        TransactionAudit.champ_modifie == 'reservation_automatique_stock',
        TransactionAudit.id_transaction.in_([oldest.id_transaction, later.id_transaction]),
    ).all()
    assert len(audits) == 3
    assert {audit.id_utilisateur for audit in audits} == {test_user.id_utilisateur}


def test_cancelling_old_promise_releases_reserved_stock_to_next_sale(db_session, deferred_sale, monkeypatch):
    _, _, _, payload = deferred_sale
    today = date.today()
    monkeypatch.setattr('app.services.egg_sales.business_date', lambda: today)
    oldest = create_transaction(payload.model_copy(update={
        'quantite': 500, 'montant_total': Decimal('750'),
    }), db_session, None)
    next_sale = create_transaction(payload.model_copy(update={
        'quantite': 300, 'montant_total': Decimal('450'),
    }), db_session, None)
    assert (next_sale.quantite_couverte, next_sale.quantite_en_attente) == (100, 200)

    delete_transaction(oldest.id_transaction, 'Annulation du test', db_session, None)

    assert (next_sale.quantite_couverte, next_sale.quantite_en_attente) == (300, 200)


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
        expected_reserved = quantity
        assert stock['physical_eggs'] == expected_reserved
        assert stock['reserved_eggs'] == expected_reserved
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


def test_completion_context_and_initial_history_are_read_only_and_traceable(client, db_session, deferred_sale, test_user):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    building, customer, initial_source, payload = deferred_sale
    tx = create_transaction(payload, db_session, None)
    late_source = enter_production(db_session, building.id_batiment, 300)
    preview = proposal(client, tx.id_transaction)
    assert preview['nom_client'] == customer.nom_client
    assert preview['nom_batiment'] == building.nom
    assert client.get(f'/api/v1/transactions/{tx.id_transaction}').json()['quantite_reservee'] == 300
    completed = client.post(f'/api/v1/transactions/{tx.id_transaction}/completion', json=confirmation(preview, 200))
    assert completed.status_code == 200, completed.text
    assert completed.json()['quantite_reservee'] == 100
    # The existing API still returns only completion events unless opted in.
    assert len(client.get(f'/api/v1/transactions/{tx.id_transaction}/completion-history').json()) == 1
    history = client.get(f'/api/v1/transactions/{tx.id_transaction}/completion-history', params={'include_initial': True}).json()
    assert [e['quantite'] for e in history] == [600, 200]
    assert history[0]['type'] == 'initial'
    assert history[0]['repartition_stock'][0]['id_production'] == initial_source.id_production
    assert history[0]['repartition_stock'][0]['quantite'] == 600
    assert history[1]['repartition_stock'][0]['id_production'] == late_source.id_production
    # Old audit records without per-event origins must not invent initial origins.
    import json
    audit = db_session.query(TransactionAudit).filter_by(champ_modifie='completion_livraison_differee').one()
    data = json.loads(audit.nouvelle_valeur)
    data.pop('repartition_stock')
    audit.nouvelle_valeur = json.dumps(data)
    db_session.commit()
    baseline = client.get(f'/api/v1/transactions/{tx.id_transaction}/completion-history', params={'include_initial': True}).json()[0]
    assert baseline['quantite'] == 600
    assert baseline['repartition_stock'] == []
    assert db_session.query(Transaction).count() == 1
    assert db_session.query(Paiement).count() == 0


def test_monthly_report_keeps_historical_debts_separate_from_current_debts(client, db_session, deferred_sale, monkeypatch):
    _, customer, _, payload = deferred_sale
    cutoff = date.today().replace(day=20)
    monkeypatch.setattr('app.routers.reports.business_date', lambda: cutoff)
    prior = cutoff.replace(day=1) - timedelta(days=1)
    transactions = []
    for day in (prior, cutoff.replace(day=10), cutoff.replace(day=27)):
        tx = Transaction(date_transaction=day, id_client=customer.id_client,
            id_produit=payload.id_produit, quantite=1, prix_unitaire=100, montant_total=100, est_actif=True)
        db_session.add(tx)
        transactions.append(tx)
    db_session.flush()
    db_session.add(Paiement(id_transaction=transactions[0].id_transaction,
        date_paiement=cutoff.replace(day=15), montant=100, type_paiement='cash', statut='valide'))
    db_session.commit()
    response = client.get('/api/v1/reports/monthly', params={'month': prior.strftime('%Y-%m')})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['date_soldes_actuels'] == cutoff.isoformat()
    assert Decimal(data['creances']) == 100
    # The prior sale has since been paid, the current sale is unpaid, and the
    # future-dated sale must not enter the current snapshot.
    assert Decimal(data['creances_actuelles']) == 100
    current = client.get('/api/v1/reports/monthly', params={'month': cutoff.strftime('%Y-%m')}).json()
    assert Decimal(current['ventes']) == 200
    assert Decimal(current['creances']) == 200
    assert Decimal(current['creances_actuelles']) == 100
