from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from tests.test_correction_contract import correction_transaction, correction_sale, prepared, revision_trigger
from tests.lot_test_helpers import add_lot_cycle
from app.models.inventory import MouvementStock
from app.models.production import Production
from app.models.batiment import Batiment
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.egg_allocation import EggAllocation
from app.models.correction_operation import CorrectionOperation
from app.schemas.correction import CorrectionCommand
from app.services.correction_commands import preview_correction, apply_correction
from app.services.inventory import get_stock_quantity, get_average_unit_cost


def command(tx, changes):
    return CorrectionCommand(operation_id=uuid4(), reason='Correction du stock enregistré',
        target={'entity_type':'transaction','entity_id':tx.id_transaction,'expected_version':tx.row_version}, changes=changes)


@pytest.fixture
def consumed_purchase(db_session, correction_transaction):
    tx=correction_transaction
    tx.date_transaction=date(2026,9,1);tx.date_echeance=date(2026,10,10);tx.quantite=100;tx.montant_total=Decimal('250')
    db_session.add_all([
        MouvementStock(id_produit=tx.id_produit,quantite_delta=100,cout_unitaire=Decimal('2.50'),type_mouvement='achat',source_type='transaction',source_id=tx.id_transaction,date_mouvement=datetime(2026,9,1,tzinfo=timezone.utc)),
        MouvementStock(id_produit=tx.id_produit,quantite_delta=-50,cout_unitaire=Decimal('2.50'),type_mouvement='transformation_input',source_type='transformation',source_id=88,date_mouvement=datetime(2026,9,2,tzinfo=timezone.utc)),
    ])
    db_session.commit();revision_trigger(db_session,'transactions','quantite,prix_unitaire,date_transaction,stock_revision')
    return tx


def test_consumed_purchase_net_correction_retains_cost_snapshots(db_session,consumed_purchase,test_user):
    tx=consumed_purchase
    cmd=command(tx,{'quantite':60,'prix_unitaire':'3.00'})
    count=db_session.query(MouvementStock).count()
    preview=preview_correction(db_session,cmd)
    assert db_session.query(MouvementStock).count()==count and not db_session.dirty
    assert preview['impact']['stock']['final_quantities'][str(tx.id_produit)]=='10.000'
    result=apply_correction(db_session,prepared(db_session,cmd),test_user)
    assert get_stock_quantity(db_session,tx.id_produit)==Decimal('10')
    assert get_average_unit_cost(db_session,tx.id_produit)==Decimal('3')
    downstream=db_session.query(MouvementStock).filter_by(source_type='transformation').one()
    assert downstream.cout_unitaire==Decimal('2.50')
    inverse=db_session.query(MouvementStock).filter_by(type_mouvement='reversal').one()
    assert inverse.date_mouvement.date()==date(2026,9,1)
    assert tx.stock_revision==1 and result['record']['row_version']==2
    retry=apply_correction(db_session,prepared_command(cmd,preview),test_user)
    assert retry['replayed'] and db_session.query(MouvementStock).count()==count+2


def prepared_command(cmd,preview):
    from app.schemas.correction import CorrectionApplyCommand
    return CorrectionApplyCommand(**cmd.model_dump(exclude_unset=True),dependency_fingerprint=preview['dependency_fingerprint'])


def test_backdated_purchase_cannot_leave_historical_negative_stock(db_session,consumed_purchase):
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session,command(consumed_purchase,{'date_transaction':date(2026,9,3)}))
    assert error.value.status_code==409
    assert db_session.query(CorrectionOperation).count()==0


def test_stock_dependency_change_invalidates_preview(db_session,consumed_purchase,test_user):
    tx=consumed_purchase;cmd=command(tx,{'quantite':60});ready=prepared(db_session,cmd)
    db_session.add(MouvementStock(id_produit=tx.id_produit,quantite_delta=Decimal('0.001'),cout_unitaire=0,type_mouvement='ajustement',source_type='manual',source_id=99,date_mouvement=datetime(2026,9,2,tzinfo=timezone.utc)))
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session,ready,test_user)
    assert error.value.status_code==409 and db_session.query(CorrectionOperation).count()==0


def test_stock_correction_rolls_back_every_write(db_session,consumed_purchase,test_user,monkeypatch):
    tx=consumed_purchase;ready=prepared(db_session,command(tx,{'quantite':60}))
    count=db_session.query(MouvementStock).count()
    def fail():
        db_session.rollback()
        raise RuntimeError('Injected failure')
    monkeypatch.setattr(db_session,'commit',fail)
    with pytest.raises(RuntimeError):apply_correction(db_session,ready,test_user)
    db_session.refresh(tx)
    assert tx.quantite==100 and tx.stock_revision==0
    assert db_session.query(MouvementStock).count()==count and db_session.query(CorrectionOperation).count()==0


@pytest.fixture
def egg_orders(db_session,correction_sale):
    tx,_=correction_sale
    building=Batiment(nom='Phase 4 building',est_actif=True)
    db_session.add(building);db_session.flush()
    tx.produit.nom_produit='Oeufs - Gros';tx.id_batiment=building.id_batiment
    tx.quantite=100;tx.montant_total=150;tx.est_promesse=True;tx.allocation_automatique=True
    tx.date_transaction=date.today();tx.date_creation=datetime(2026,9,1,tzinfo=timezone.utc)
    source=Production(id_batiment=building.id_batiment,date_production=date.today(),type_oeuf='normal',calibre='gros',nombre_oeufs=80,grammage=60,nombre_cartons=3,est_actif=True)
    db_session.add(source);db_session.flush()
    tx.allocations.append(EggAllocation(id_production=source.id_production,quantite=80,quantite_livree=30))
    other=Transaction(date_transaction=date.today(),id_client=tx.id_client,id_produit=tx.id_produit,id_batiment=building.id_batiment,quantite=50,prix_unitaire=Decimal('1.50'),montant_total=75,est_promesse=True,allocation_automatique=True,est_actif=True,date_creation=datetime(2026,9,2,tzinfo=timezone.utc))
    db_session.add(other);db_session.commit()
    revision_trigger(db_session,'transactions','quantite,stock_revision,id_production,id_cycle')
    return tx,other,source


def test_egg_reduction_preserves_delivery_and_releases_to_next_order(db_session,egg_orders,test_user):
    tx,other,source=egg_orders
    cmd=command(tx,{'quantite':50});preview=preview_correction(db_session,cmd)
    assert not db_session.dirty and db_session.query(CorrectionOperation).count()==0
    plan=preview['impact']['stock']
    assert plan['after'][str(other.id_transaction)][0]['quantite']==30
    result=apply_correction(db_session,prepared_command(cmd,preview),test_user)
    assert tx.allocations[0].quantite==50 and tx.allocations[0].quantite_livree==30
    assert other.allocations[0].quantite==30 and other.allocations[0].quantite_livree==0
    assert other.stock_revision==1 and other.row_version==2
    assert tx.date_creation.date()==date(2026,9,1)
    assert result['record']['stock_revision']==1


def test_egg_reduction_below_delivered_is_blocked(db_session,egg_orders):
    tx,_,_=egg_orders
    with pytest.raises(HTTPException) as error:preview_correction(db_session,command(tx,{'quantite':29}))
    assert error.value.status_code==409


def test_egg_source_and_production_dependency_invalidates_preview(db_session,egg_orders,test_user):
    tx,_,source=egg_orders
    cmd=prepared(db_session,command(tx,{'quantite':60}))
    source.nombre_oeufs+=1;db_session.commit()
    with pytest.raises(HTTPException) as error:apply_correction(db_session,cmd,test_user)
    assert error.value.status_code==409 and db_session.query(CorrectionOperation).count()==0


def test_ordinary_egg_origin_correction_keeps_total_and_payment(db_session,egg_orders,test_user):
    tx,other,old=egg_orders
    tx.est_promesse=False;tx.quantite=80;tx.montant_total=120;tx.id_production=old.id_production
    tx.allocations[0].quantite_livree=0
    new=Production(id_batiment=old.id_batiment,date_production=old.date_production,type_oeuf='normal',calibre='gros',nombre_oeufs=100,grammage=60,nombre_cartons=4,est_actif=True)
    # Avoid an unrelated promise claiming the new source in this fixture.
    other.est_actif=False
    db_session.add(new);db_session.commit()
    ready=prepared(db_session,command(tx,{'stock_allocations':[{'id_production':new.id_production,'quantite':80}]}))
    result=apply_correction(db_session,ready,test_user)
    assert tx.id_production==new.id_production and tx.allocations[0].id_production==new.id_production
    assert tx.montant_total==120 and result['record']['stock_revision']==1
    assert tx.paiements[0].montant==Decimal('5')


def test_delivered_source_cannot_be_replaced(db_session,egg_orders):
    tx,_,old=egg_orders
    new=Production(id_batiment=old.id_batiment,date_production=old.date_production,type_oeuf='normal',calibre='gros',nombre_oeufs=100,grammage=60,nombre_cartons=4,est_actif=True)
    db_session.add(new);db_session.commit()
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session,command(tx,{'stock_allocations':[{'id_production':new.id_production,'quantite':80}]}))
    assert error.value.status_code==409


def test_egg_plan_cannot_silently_release_priority_reservations(db_session,egg_orders):
    tx,_,_=egg_orders
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session,command(tx,{'stock_allocations':[]}))
    assert error.value.status_code==409


def test_identical_egg_allocation_save_is_noop(db_session,egg_orders,test_user):
    tx,other,source=egg_orders
    ready=prepared(db_session,command(tx,{'stock_allocations':[{'id_production':source.id_production,'quantite':80}]}))
    result=apply_correction(db_session,ready,test_user)
    assert result['no_op'] and tx.stock_revision==0 and other.stock_revision==0
    assert db_session.query(CorrectionOperation).count()==0


def test_stock_migration_and_bootstrap_match():
    from pathlib import Path
    root=Path(__file__).resolve().parents[2]
    sql=(root/'backend/migrations/stock_correction_revisions.sql').read_text()
    assert (root/'supabase_migrations/20261029220023_stock_correction_revisions.sql').read_text()==sql
    assert sql in (root/'supabase_bootstrap.sql').read_text()


def extra_egg_source(db, source, quantity=40, cycle=None):
    production = Production(id_batiment=source.id_batiment, date_production=source.date_production,
        type_oeuf='normal', calibre='gros', nombre_oeufs=quantity, grammage=60,
        nombre_cartons=2, est_actif=True, id_cycle=cycle)
    db.add(production)
    db.commit()
    return production


@pytest.mark.parametrize('available', [40, 60])
def test_explicit_and_automatic_final_allocations_agree(db_session, egg_orders, test_user, available):
    tx, other, source = egg_orders
    extra_egg_source(db_session, source, available)
    automatic = preview_correction(db_session, command(tx, {'quantite': 120}))
    allocations = automatic['impact']['stock']['after'][str(tx.id_transaction)]
    cmd = command(tx, {'quantite': 120, 'stock_allocations': [
        {key: row[key] for key in ('id_production', 'quantite')} for row in allocations]})
    explicit = preview_correction(db_session, cmd)
    assert explicit['impact']['stock'] == automatic['impact']['stock']
    assert not db_session.dirty and db_session.query(CorrectionOperation).count() == 0
    ready = prepared_command(cmd, explicit)
    result = apply_correction(db_session, ready, test_user)
    db_session.expire_all()
    assert sum(a.quantite for a in tx.allocations) == 120
    assert sum(a.quantite for a in other.allocations) == available - 40
    assert tx.allocations[0].quantite_livree == 30
    assert result['impact']['stock'] == explicit['impact']['stock']
    assert apply_correction(db_session, ready, test_user)['impact'] == result['impact']


def test_explicit_increase_preserves_other_orders_saved_allocations(db_session, egg_orders):
    tx, other, source = egg_orders
    extra = extra_egg_source(db_session, source)
    other.allocations.append(EggAllocation(id_production=extra.id_production, quantite=20, quantite_livree=0))
    db_session.commit()
    automatic = preview_correction(db_session, command(tx, {'quantite': 120}))
    assert sum(a['quantite'] for a in automatic['impact']['stock']['after'][str(tx.id_transaction)]) == 100
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, command(tx, {'quantite': 120, 'stock_allocations': [
            {'id_production': source.id_production, 'quantite': 80},
            {'id_production': extra.id_production, 'quantite': 40}]}))
    assert error.value.status_code == 409 and other.allocations[0].quantite == 20
    assert db_session.query(CorrectionOperation).count() == 0


def test_explicit_increase_cannot_take_earlier_orders_pending_stock(db_session, egg_orders):
    tx, other, source = egg_orders
    other.date_creation = tx.date_creation - timedelta(days=1)
    db_session.commit()
    extra = extra_egg_source(db_session, source)
    automatic = preview_correction(db_session, command(tx, {'quantite': 120}))
    after = automatic['impact']['stock']['after']
    assert sum(a['quantite'] for a in after[str(tx.id_transaction)]) == 80
    assert after[str(other.id_transaction)][0]['quantite'] == 40
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, command(tx, {'quantite': 120, 'stock_allocations': [
            {'id_production': source.id_production, 'quantite': 80},
            {'id_production': extra.id_production, 'quantite': 40}]}))
    assert error.value.status_code == 409 and not other.allocations
    assert db_session.query(CorrectionOperation).count() == 0


def test_source_swap_releases_old_stock_before_validating_pending_priority(db_session, egg_orders, test_user):
    tx, other, source = egg_orders
    tx.est_promesse = False
    tx.quantite = 80
    tx.montant_total = 120
    tx.id_production = source.id_production
    tx.allocations[0].quantite_livree = 0
    db_session.commit()
    extra = extra_egg_source(db_session, source, 80)
    cmd = command(tx, {'stock_allocations': [{'id_production': extra.id_production, 'quantite': 80}]})
    preview = preview_correction(db_session, cmd)
    assert preview['impact']['stock']['after'][str(other.id_transaction)] == [
        {'id_production': source.id_production, 'quantite': 50, 'quantite_livree': 0}]
    apply_correction(db_session, prepared_command(cmd, preview), test_user)
    db_session.expire_all()
    assert tx.allocations[0].id_production == extra.id_production
    assert other.allocations[0].id_production == source.id_production
    assert other.allocations[0].quantite == 50


@pytest.mark.parametrize('available', [40, 60])
def test_explicit_plan_reserves_pending_priority_without_changing_chosen_sources(
        db_session, egg_orders, test_user, available):
    tx, other, source = egg_orders
    extra = extra_egg_source(db_session, source, available)
    cmd = command(tx, {'quantite': 120, 'stock_allocations': [
        {'id_production': source.id_production, 'quantite': 80}]})
    preview = preview_correction(db_session, cmd)
    plan = preview['impact']['stock']
    assert plan['after'][str(tx.id_transaction)] == [
        {'id_production': source.id_production, 'quantite': 80, 'quantite_livree': 30}]
    expected_other = [] if available == 40 else [
        {'id_production': extra.id_production, 'quantite': 20, 'quantite_livree': 0}]
    assert plan['after'].get(str(other.id_transaction), []) == expected_other
    result = apply_correction(db_session, prepared_command(cmd, preview), test_user)
    db_session.expire_all()
    assert sum(a.quantite for a in tx.allocations) == 80
    assert sum(a.quantite for a in other.allocations) == available - 40
    from app.services.egg_sales import _stock_state
    _, _, reservations = _stock_state(db_session)
    assert reservations[tx.id_transaction][extra.id_production] == 40
    retry = apply_correction(db_session, prepared_command(cmd, preview), test_user)
    assert retry['replayed'] and retry['impact'] == result['impact']


@pytest.mark.parametrize('selection', ['explicit', 'automatic', 'related'])
@pytest.mark.parametrize('invalid', ['building', 'before_lot', 'after_lot'])
def test_all_selected_sources_validate_lot(db_session, egg_orders, selection, invalid):
    tx, other, source = egg_orders
    building = db_session.get(Batiment, source.id_batiment)
    if invalid == 'building':
        building = Batiment(nom='Other lot building', est_actif=True)
        db_session.add(building)
        db_session.commit()
    start = source.date_production + timedelta(days=1) if invalid == 'before_lot' else source.date_production - timedelta(days=10)
    _, cycle = add_lot_cycle(db_session, building, name='Validation lot', date_debut=start,
        date_fin_reelle=source.date_production - timedelta(days=1) if invalid == 'after_lot' else None)
    extra = extra_egg_source(db_session, source, cycle=cycle.id_cycle)
    changes = {'quantite': 120}
    if selection == 'explicit':
        changes['stock_allocations'] = [
            {'id_production': source.id_production, 'quantite': 80},
            {'id_production': extra.id_production, 'quantite': 40}]
    elif selection == 'related':
        changes = {'quantite': 80}  # Younger order would use the invalid source.
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, command(tx, changes))
    assert error.value.status_code == 409 and 'lot' in error.value.detail
    assert db_session.query(CorrectionOperation).count() == 0
    assert not other.allocations


@pytest.fixture
def product_change(db_session, correction_sale):
    tx, _ = correction_sale
    tx.quantite = 1
    tx.montant_total = Decimal('1.50')
    product = Produit(nom_produit='Replacement stock product', type_produit='produit_fini',
        pour_clients=True, pour_fournisseurs=False)
    db_session.add(product)
    db_session.flush()
    day = datetime.combine(tx.date_transaction, datetime.min.time(), tzinfo=timezone.utc)
    for pid, quantity, cost, source_type, source_id, kind in [
        (tx.id_produit, 1, 1, 'manual', 100, 'ajustement'),
        (tx.id_produit, -1, 1, 'transaction', tx.id_transaction, 'vente'),
        (product.id_produit, 2, 1, 'manual', 101, 'ajustement'),
        (product.id_produit, 1, 2, 'manual', 102, 'ajustement'),
    ]:
        db_session.add(MouvementStock(id_produit=pid, quantite_delta=quantity, cout_unitaire=cost,
            type_mouvement=kind, source_type=source_type, source_id=source_id, date_mouvement=day))
    db_session.commit()
    revision_trigger(db_session, 'transactions', 'id_produit,stock_revision')
    return tx, product


@pytest.mark.parametrize('tie', [False, True])
def test_inventory_cost_matches_preview_history_storage_and_retry(db_session, product_change, test_user, tie):
    tx, product = product_change
    if tie:
        receipts = db_session.query(MouvementStock).filter_by(id_produit=product.id_produit).all()
        receipts[0].quantite_delta = 1
        receipts[0].cout_unitaire = Decimal('1.2344')
        receipts[1].cout_unitaire = Decimal('1.2345')
        db_session.commit()
    cmd = command(tx, {'id_produit': product.id_produit})
    preview = preview_correction(db_session, cmd)
    expected = '1.2345' if tie else '1.3333'
    assert preview['impact']['stock']['after']['cout_unitaire'] == expected
    ready = prepared_command(cmd, preview)
    result = apply_correction(db_session, ready, test_user)
    db_session.expire_all()
    actual = db_session.query(MouvementStock).filter_by(id_produit=product.id_produit,
        source_type='transaction', source_id=tx.id_transaction, id_mouvement_inverse=None).one()
    assert actual.cout_unitaire == Decimal(expected)
    assert result['impact']['stock'] == preview['impact']['stock']
    saved = db_session.get(CorrectionOperation, cmd.operation_id)
    assert saved.result_payload['impact']['stock'] == result['impact']['stock']
    assert apply_correction(db_session, ready, test_user)['impact'] == result['impact']


@pytest.mark.parametrize('assignment,kind', [
    ('cout_unitaire = cout_unitaire + 0.0001', 'vente'),
    ('quantite_delta = -2', 'vente'),
    ("date_mouvement = '2026-01-01 00:00:00'", 'vente'),
    ("source_type = 'manual'", 'vente'),
    ("type_mouvement = 'ajustement'", 'vente'),
    ('cout_unitaire = cout_unitaire + 0.0001', 'reversal'),
])
def test_saved_stock_mismatch_rolls_back_operation(db_session, product_change, test_user, assignment, kind):
    tx, product = product_change
    ready = prepared(db_session, command(tx, {'id_produit': product.id_produit}))
    old_product_id = tx.id_produit
    count = db_session.query(MouvementStock).count()
    # Simulate stored values changed by a DB trigger, after ORM assignment.
    db_session.execute(text(f"""CREATE TRIGGER change_saved_stock AFTER INSERT ON mouvements_stock
        WHEN NEW.source_type = 'transaction' AND NEW.type_mouvement = '{kind}'
        BEGIN UPDATE mouvements_stock SET {assignment}
        WHERE id_mouvement_stock = NEW.id_mouvement_stock; END"""))
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session, ready, test_user)
    assert error.value.status_code == 409
    db_session.refresh(tx)
    assert tx.id_produit == old_product_id and tx.stock_revision == 0
    assert db_session.query(MouvementStock).count() == count
    assert db_session.query(CorrectionOperation).count() == 0


@pytest.mark.parametrize('related', [False, True])
def test_saved_allocation_mismatch_rolls_back_all_orders(db_session, egg_orders, test_user, related):
    tx, other, _ = egg_orders
    ready = prepared(db_session, command(tx, {'quantite': 50}))
    target = other if related else tx
    event = 'INSERT' if related else 'UPDATE'
    db_session.execute(text(f"""CREATE TRIGGER change_saved_allocation AFTER {event} ON egg_sale_allocations
        WHEN NEW.id_transaction = {target.id_transaction}
        BEGIN UPDATE egg_sale_allocations SET quantite = quantite + 1 WHERE id = NEW.id; END"""))
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session, ready, test_user)
    assert error.value.status_code == 409
    db_session.expire_all()
    assert tx.quantite == 100 and tx.allocations[0].quantite == 80
    assert not other.allocations and other.stock_revision == 0
    assert db_session.query(CorrectionOperation).count() == 0
