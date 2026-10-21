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
