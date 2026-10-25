"""Business flow tests against an isolated DB; no external services."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from app.models.batiment import Batiment
from app.models.client import Client
from app.models.production import Production
from app.models.transaction import Transaction
from app.routers.transactions import create_transaction, create_transactions_batch, update_transaction, delete_transaction
from app.routers.productions import _stock_report, delete_production, update_production
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionRead
from app.schemas.production import ProductionUpdate
from app.services.egg_sales import sale_sources, protect_production_source
from app.utils.egg_product_sync import ensure_sellable_egg_product


@pytest.fixture
def source_data(db_session):
    b = Batiment(nom='Source', est_actif=True)
    c = Client(nom_client='Acheteur', est_actif=True)
    db_session.add_all([b, c]); db_session.flush()
    rows = []
    for days, kind, size, count in [(2,'normal','moyen',100), (1,'normal','moyen',80), (1,'double_jaune',None,20), (1,'perdu',None,5)]:
        p = Production(id_batiment=b.id_batiment, date_production=date.today()-timedelta(days=days),
                       type_oeuf=kind, calibre=size, nombre_oeufs=count, grammage=55,
                       nombre_cartons=4, est_actif=True)
        rows.append(p)
        db_session.add(p)
    ensure_sellable_egg_product(db_session, 'normal', 'moyen')
    db_session.commit()
    return b, c, rows


def payload(data, quantity=30, row=1, **extra):
    b,c,rows=data
    return TransactionCreate(date_transaction=date.today(), id_client=c.id_client,
        id_production=rows[row].id_production, quantite=quantity, prix_unitaire=Decimal('1.5'), **extra)


def test_sale_derives_identity_syncs_stock_and_cancellation_restores(db_session, source_data):
    b,c,rows=source_data
    tx=create_transaction(payload(source_data), db_session, None)
    assert (tx.id_batiment, tx.production.id_production)==(b.id_batiment,rows[1].id_production)
    response=TransactionRead.model_validate(tx)
    assert response.date_production==rows[1].date_production
    assert response.nom_batiment_source=='Source'
    sources=sale_sources(db_session,b.id_batiment,rows[1].date_production)
    assert next(s for s in sources if s['type_oeuf']=='normal')['disponible']==50
    report=_stock_report(db_session,date.today(),cumulative=True)
    assert report['totals']['available_eggs']==170
    delete_transaction(tx.id_transaction, 'Annulation de test', db_session, None)
    assert next(s for s in sale_sources(db_session,b.id_batiment,rows[1].date_production) if s['type_oeuf']=='normal')['disponible']==80


def test_promise_covers_available_stock_and_reserves_future_stock(db_session, source_data):
    from app.models.egg_allocation import EggAllocation
    b, c, rows = source_data
    future = Production(id_batiment=b.id_batiment, date_production=date.today() + timedelta(days=1),
        type_oeuf='normal', calibre='moyen', nombre_oeufs=100, grammage=55,
        nombre_cartons=2, est_actif=True)
    db_session.add(future)
    db_session.flush()
    product = ensure_sellable_egg_product(db_session, 'normal', 'moyen')
    promise = TransactionCreate(
        date_transaction=date.today(), id_client=c.id_client, id_produit=product.id_produit,
        id_batiment=b.id_batiment, allocation_automatique=True, est_promesse=True,
        date_livraison_prevue=date.today() + timedelta(days=1), quantite=250,
        prix_unitaire=Decimal('1.5'),
    )
    tx = create_transaction(promise, db_session, None)
    assert sum(a.quantite for a in tx.allocations) == 180
    assert tx.quantite_en_attente == 70
    assert sum(row[0] for row in db_session.query(EggAllocation.quantite).filter_by(id_transaction=tx.id_transaction).all()) == 180
    # The pending 70 reserve the next production before another sale can use it.
    remaining = sale_sources(db_session, b.id_batiment, through_date=future.date_production)
    assert sum(row['disponible'] for row in remaining if row['type_oeuf'] == 'normal') == 30
    tomorrow_sale = TransactionCreate(
        date_transaction=future.date_production, id_client=c.id_client, id_produit=product.id_produit,
        id_batiment=b.id_batiment, allocation_automatique=True, quantite=31,
        prix_unitaire=Decimal('1.5'),
    )
    with pytest.raises(HTTPException) as exc:
        create_transaction(tomorrow_sale, db_session, None)
    assert exc.value.status_code == 409


def test_promise_example_covers_600_and_keeps_400_pending(db_session, source_data):
    b, c, rows = source_data
    additional = Production(id_batiment=b.id_batiment, date_production=rows[1].date_production,
        type_oeuf='normal', calibre='moyen', nombre_oeufs=420, grammage=55,
        nombre_cartons=8, est_actif=True)
    db_session.add(additional)
    product = ensure_sellable_egg_product(db_session, 'normal', 'moyen')
    promise = TransactionCreate(
        date_transaction=date.today(), id_client=c.id_client, id_produit=product.id_produit,
        id_batiment=b.id_batiment, allocation_automatique=True, est_promesse=True,
        date_livraison_prevue=date.today() + timedelta(days=1), quantite=1000,
        prix_unitaire=Decimal('1.5'),
    )
    tx = create_transaction(promise, db_session, None)
    assert tx.quantite_couverte == 600
    assert tx.quantite_en_attente == 400


def test_promise_without_stock_is_saved_but_unmarked_shortage_is_rejected(db_session, source_data):
    b, c, _ = source_data
    product = ensure_sellable_egg_product(db_session, 'normal', 'gros')
    kwargs = dict(date_transaction=date.today(), id_client=c.id_client, id_produit=product.id_produit,
                  id_batiment=b.id_batiment, allocation_automatique=True, quantite=40,
                  prix_unitaire=Decimal('1'))
    with pytest.raises(HTTPException) as exc:
        create_transaction(TransactionCreate(**kwargs), db_session, None)
    assert exc.value.status_code == 409
    product = ensure_sellable_egg_product(db_session, 'normal', 'gros')
    kwargs['id_produit'] = product.id_produit
    accepted = create_transaction(TransactionCreate(**kwargs, est_promesse=True,
        date_livraison_prevue=date.today() + timedelta(days=1)), db_session, None)
    assert accepted.quantite_couverte == 0
    assert accepted.quantite_en_attente == 40


def test_oversell_batch_rolls_back_all_rows(db_session,source_data):
    with pytest.raises(HTTPException) as exc:
        create_transactions_batch([payload(source_data,50),payload(source_data,40)],db_session,None)
    assert exc.value.status_code==409
    assert db_session.query(Transaction).count()==0


@pytest.mark.parametrize('change', ['building','product','future','loss'])
def test_invalid_or_tampered_source_rejected(db_session,source_data,change):
    data=payload(source_data)
    if change=='building': data.id_batiment=999
    if change=='product': data.id_produit=999
    if change=='future': data.date_transaction=date.today()-timedelta(days=3)
    if change=='loss': data.id_production=source_data[2][3].id_production
    with pytest.raises(HTTPException): create_transaction(data,db_session,None)
    assert db_session.query(Transaction).count()==0


def test_legacy_sales_reserve_oldest_eggs_without_rewriting_history(db_session,source_data):
    b,c,rows=source_data
    prod=ensure_sellable_egg_product(db_session,'normal','moyen')
    legacy=Transaction(date_transaction=date.today(),id_produit=prod.id_produit,id_client=c.id_client,
        id_batiment=b.id_batiment,quantite=120,prix_unitaire=1,montant_total=120)
    db_session.add(legacy);db_session.commit()
    assert sale_sources(db_session,b.id_batiment,rows[0].date_production)[0]['disponible']==0
    sources=sale_sources(db_session,b.id_batiment,rows[1].date_production)
    assert next(s for s in sources if s['type_oeuf']=='normal')['disponible']==60
    with pytest.raises(HTTPException):create_transaction(payload(source_data,61),db_session,None)
    assert legacy.id_production is None


def test_update_rechecks_stock_excludes_own_quantity_and_guards_production(db_session,source_data):
    tx=create_transaction(payload(source_data,30),db_session,None)
    update_transaction(tx.id_transaction,TransactionUpdate(quantite=60),db_session,None)
    with pytest.raises(HTTPException):
        update_transaction(tx.id_transaction,TransactionUpdate(quantite=81),db_session,None)
    db_session.rollback()
    source=source_data[2][1]
    with pytest.raises(HTTPException):protect_production_source(db_session,source,quantity=59)
    with pytest.raises(HTTPException):delete_production(source.id_production,'Correction',db_session,None)
    protect_production_source(db_session,source,quantity=60,category=('normal','moyen'))


def test_unassigned_sales_reduce_global_available_sources(db_session,source_data):
    b,c,rows=source_data
    prod=ensure_sellable_egg_product(db_session,'normal','moyen')
    db_session.add(Transaction(date_transaction=date.today(),id_produit=prod.id_produit,id_client=c.id_client,
        quantite=150,prix_unitaire=1,montant_total=150));db_session.commit()
    sources=sale_sources(db_session,b.id_batiment,rows[1].date_production)
    assert next(s for s in sources if s['type_oeuf']=='normal')['disponible']==30


def test_source_can_be_changed_to_another_type_without_stale_product(db_session,source_data):
    tx=create_transaction(payload(source_data,10),db_session,None)
    update_transaction(tx.id_transaction,TransactionUpdate(id_production=source_data[2][2].id_production),db_session,None)
    assert tx.produit.nom_produit=='Oeufs - Double jaune'
    assert tx.production.id_production==source_data[2][2].id_production


def test_daily_correction_and_cancellation_cannot_remove_sold_eggs(db_session,source_data):
    from app.routers.productions import update_daily_production, delete_daily_production
    from app.schemas.production import ProductionDailyInput, ProductionDailyCancel
    b,c,rows=source_data
    tx=create_transaction(payload(source_data,30),db_session,None)
    day=rows[1].date_production
    versions={p.id_production:p.date_modification.isoformat() for p in rows if p.date_production==day}
    with pytest.raises(HTTPException) as exc:
        update_daily_production(ProductionDailyInput(id_batiment=b.id_batiment,date_production=day,
            quantites={'normal':20,'double_jaune':20,'perdu':5},grammage=55,versions=versions),db_session,None)
    assert exc.value.status_code==409
    with pytest.raises(HTTPException):
        delete_daily_production(ProductionDailyCancel(id_batiment=b.id_batiment,date_production=day,
            versions=versions),db_session,None)
    assert db_session.get(Production,rows[1].id_production).est_actif


def test_payment_batch_keeps_source_cash_and_cancellation_in_sync(db_session,source_data):
    from app.routers.transactions import create_transactions_with_payments_batch
    from app.schemas.transaction_payment import TransactionPaymentBatchCreate
    from app.models.paiement import Paiement
    from app.models.caisse import Caisse
    batch=TransactionPaymentBatchCreate(items=[{'client_ref':'sale','transaction':payload(source_data).model_dump(),
        'paiements':[{'date_paiement':date.today(),'montant':'45','type_paiement':'cash'}]}])
    result=create_transactions_with_payments_batch(batch,db_session,None)
    tx=result[0]['transaction']
    assert tx.id_production==source_data[2][1].id_production
    assert tx.montant_paye==Decimal('45')
    assert db_session.query(Caisse).filter(Caisse.statut=='active').count()==1
    delete_transaction(tx.id_transaction,'Annulation du test',db_session,None)
    assert db_session.query(Paiement).one().statut=='annule'
    assert db_session.query(Caisse).filter(Caisse.statut=='active').count()==0


def test_invalid_payment_rolls_back_source_sale_and_stock(db_session,source_data):
    from app.routers.transactions import create_transactions_with_payments_batch
    from app.schemas.transaction_payment import TransactionPaymentBatchCreate
    b,c,rows=source_data
    batch=TransactionPaymentBatchCreate(items=[{'client_ref':'sale','transaction':payload(source_data).model_dump(),
        'paiements':[{'date_paiement':date.today(),'montant':'45','type_paiement':'lc','id_lc':999999}]}])
    with pytest.raises(HTTPException):create_transactions_with_payments_batch(batch,db_session,None)
    assert db_session.query(Transaction).count()==0
    assert next(s for s in sale_sources(db_session,b.id_batiment,rows[1].date_production) if s['type_oeuf']=='normal')['disponible']==80


def test_cumulative_sources_include_unsold_prior_days_without_daily_entry(db_session, source_data):
    b, _, rows = source_data
    tx = create_transaction(payload(source_data, 30, row=0), db_session, None)
    sources = sale_sources(db_session, b.id_batiment, through_date=date.today())
    assert [s['id_production'] for s in sources] == [p.id_production for p in rows[:3]]
    assert [s['disponible'] for s in sources] == [70, 80, 20]
    # Earlier production remains sellable even with no entry on the sale date.
    create_transaction(payload(source_data, 70, row=0), db_session, None)
    assert rows[0].id_production not in {
        s['id_production'] for s in sale_sources(db_session, b.id_batiment, through_date=date.today())
    }
    delete_transaction(tx.id_transaction, 'Annulation', db_session, None)
    restored = sale_sources(db_session, b.id_batiment, through_date=date.today())
    assert restored[0]['id_production'] == rows[0].id_production
    assert restored[0]['disponible'] == 30


def test_cumulative_sources_cutoff_building_inactive_and_edit_reservation(db_session, source_data):
    b, _, rows = source_data
    other = Batiment(nom='Autre', est_actif=True)
    db_session.add(other)
    db_session.flush()
    for building, day, active in [
        (b.id_batiment, date.today() + timedelta(days=1), True),
        (other.id_batiment, rows[0].date_production, True),
        (b.id_batiment, rows[0].date_production, False),
    ]:
        db_session.add(Production(id_batiment=building, date_production=day,
            type_oeuf='normal', calibre='gros', nombre_oeufs=500, grammage=70,
            nombre_cartons=1, est_actif=active))
    db_session.commit()
    tx = create_transaction(payload(source_data, 80), db_session, None)
    sources = sale_sources(db_session, b.id_batiment, through_date=date.today())
    assert {s['id_production'] for s in sources} == {rows[0].id_production, rows[2].id_production}
    editing = sale_sources(db_session, b.id_batiment,
        exclude_transaction_id=tx.id_transaction, through_date=date.today())
    assert next(s['disponible'] for s in editing if s['id_production'] == rows[1].id_production) == 80
    earlier = sale_sources(db_session, b.id_batiment, through_date=rows[0].date_production)
    assert [s['id_production'] for s in earlier] == [rows[0].id_production]


def test_cumulative_sources_keep_legacy_reservations(db_session, source_data):
    b, c, rows = source_data
    product = ensure_sellable_egg_product(db_session, 'normal', 'moyen')
    db_session.add(Transaction(date_transaction=date.today(), id_produit=product.id_produit,
        id_client=c.id_client, id_batiment=b.id_batiment, quantite=120,
        prix_unitaire=1, montant_total=120))
    db_session.commit()
    sources = sale_sources(db_session, b.id_batiment, through_date=date.today())
    assert [(s['id_production'], s['disponible']) for s in sources] == [
        (rows[1].id_production, 60), (rows[2].id_production, 20)]


def test_cumulative_sources_endpoint_and_exact_date_compatibility(client, source_data):
    b, _, rows = source_data
    cumulative = client.get('/api/v1/transactions/production-sources', params={
        'id_batiment': b.id_batiment, 'through_date': date.today().isoformat()})
    assert cumulative.status_code == 200
    assert len(cumulative.json()) == 3
    exact = client.get('/api/v1/transactions/production-sources', params={
        'id_batiment': b.id_batiment, 'date_production': rows[0].date_production.isoformat()})
    assert exact.status_code == 200
    assert len(exact.json()) == 1
    assert client.get('/api/v1/transactions/production-sources', params={
        'id_batiment': b.id_batiment}).status_code == 400


def test_fifo_sale_spans_days_as_one_transaction_and_cancels_exact_origins(db_session, source_data):
    b, _, rows = source_data
    tx = create_transaction(payload(source_data, 150, allocation_automatique=True), db_session, None)
    assert db_session.query(Transaction).count() == 1
    assert [(a.id_production, a.quantite) for a in tx.allocations] == [(rows[0].id_production, 100), (rows[1].id_production, 50)]
    assert sum(a.quantite for a in tx.allocations) == tx.quantite
    assert next(s['disponible'] for s in sale_sources(db_session, b.id_batiment, through_date=date.today()) if s['id_production'] == rows[1].id_production) == 30
    update_transaction(tx.id_transaction, TransactionUpdate(prix_unitaire=2), db_session, None)
    assert [(a.id_production, a.quantite) for a in tx.allocations] == [(rows[0].id_production, 100), (rows[1].id_production, 50)]
    delete_transaction(tx.id_transaction, 'Annulation', db_session, None)
    assert [s['disponible'] for s in sale_sources(db_session, b.id_batiment, through_date=date.today())] == [100, 80, 20]


def test_fifo_quantity_edit_reallocates_and_protects_each_origin(db_session, source_data):
    tx = create_transaction(payload(source_data, 150, allocation_automatique=True), db_session, None)
    update_transaction(tx.id_transaction, TransactionUpdate(quantite=120), db_session, None)
    assert [(a.id_production, a.quantite) for a in tx.allocations] == [(source_data[2][0].id_production, 100), (source_data[2][1].id_production, 20)]
    with pytest.raises(HTTPException):
        protect_production_source(db_session, source_data[2][0], quantity=99)
    with pytest.raises(HTTPException):
        create_transaction(payload(source_data, 61, allocation_automatique=True), db_session, None)


def test_fifo_batch_oversell_rolls_back_allocations(db_session, source_data):
    from app.models.egg_allocation import EggAllocation
    with pytest.raises(HTTPException):
        create_transactions_batch([payload(source_data, 100, allocation_automatique=True), payload(source_data, 81, allocation_automatique=True)], db_session, None)
    assert db_session.query(Transaction).count() == 0
    assert db_session.query(EggAllocation).count() == 0


def test_fifo_never_uses_production_after_sale_date(db_session, source_data):
    data = payload(source_data, 101, row=0, allocation_automatique=True)
    data.date_transaction = source_data[2][0].date_production
    with pytest.raises(HTTPException) as exc:
        create_transaction(data, db_session, None)
    assert exc.value.status_code == 409
    assert db_session.query(Transaction).count() == 0


def test_fifo_payment_is_recorded_once_and_cancellation_restores_all_sources(db_session, source_data):
    from app.routers.transactions import create_transactions_with_payments_batch
    from app.schemas.transaction_payment import TransactionPaymentBatchCreate
    from app.models.paiement import Paiement
    from app.models.caisse import Caisse
    data = payload(source_data, 150, allocation_automatique=True)
    batch = TransactionPaymentBatchCreate(items=[{'client_ref': 'fifo', 'transaction': data.model_dump(),
        'paiements': [{'date_paiement': date.today(), 'montant': '225', 'type_paiement': 'cash'}]}])
    tx = create_transactions_with_payments_batch(batch, db_session, None)[0]['transaction']
    assert len(tx.allocations) == 2
    assert tx.id_production == source_data[2][0].id_production
    assert db_session.query(Transaction).count() == 1
    assert db_session.query(Paiement).count() == 1
    assert db_session.query(Caisse).filter(Caisse.statut == 'active').count() == 1
    delete_transaction(tx.id_transaction, 'Annulation FIFO', db_session, None)
    assert db_session.query(Caisse).filter(Caisse.statut == 'active').count() == 0
    assert sum(s['disponible'] for s in sale_sources(db_session, source_data[0].id_batiment, through_date=date.today())) == 200
