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
