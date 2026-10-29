from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException

from tests.test_correction_contract import correction_transaction, correction_sale, prepared, revision_trigger
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


def test_stock_migration_and_bootstrap_match():
    from pathlib import Path
    root=Path(__file__).resolve().parents[2]
    sql=(root/'backend/migrations/stock_correction_revisions.sql').read_text()
    assert (root/'supabase_migrations/20261029220023_stock_correction_revisions.sql').read_text()==sql
    assert sql in (root/'supabase_bootstrap.sql').read_text()
