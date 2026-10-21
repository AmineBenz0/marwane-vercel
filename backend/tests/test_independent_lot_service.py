"""Exercise lot lifecycle and production rules without an HTTP transport."""
from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from app.models.batiment import Batiment
from app.models.production import Production
from app.routers.lots_production import create_lot, list_lots, terminate_lot, update_lot
from app.routers.productions import create_daily_production, get_production, _stock_report
from app.schemas.cycle_production import CycleProductionTerminate
from app.schemas.lot_production import LotProductionCreate
from app.schemas.production import ProductionDailyInput
from app.utils.production_cycles import find_cycle_for_date


def building(db, name):
    row = Batiment(nom=name, est_actif=True)
    db.add(row)
    db.commit()
    return row


def arrival(row, name, start, count=100, age=0):
    return LotProductionCreate(
        nom_lot=name, date_debut=start, age_depart_semaines=age,
        effectif_initial=count,
        repartitions=[{"id_batiment": row.id_batiment, "effectif_initial": count}],
    )


def test_editing_starting_age_preserves_the_other_lot_schedule(db_session):
    today = date.today()
    a, b = building(db_session, "Age A"), building(db_session, "Age B")
    payload_a = arrival(a, "Lot A", today - timedelta(days=14), age=10)
    payload_b = arrival(b, "Lot B", today - timedelta(days=7), count=200, age=24)
    lot_a = create_lot(payload_a, db_session, None)
    lot_b = create_lot(payload_b, db_session, None)
    update_lot(lot_a["id_lot"], payload_a.model_copy(update={"age_depart_semaines": 30}), db_session, None)
    lots = list_lots(id_batiment=None, statut=None, db=db_session, current_user=None)
    by_id = {lot["id_lot"]: lot for lot in lots}
    assert by_id[lot_a["id_lot"]]["age_semaines"] == 32
    assert by_id[lot_b["id_lot"]]["age_depart_semaines"] == 24
    assert by_id[lot_b["id_lot"]]["age_semaines"] == 25
    assert by_id[lot_b["id_lot"]]["date_debut"] == payload_b.date_debut
    assert by_id[lot_b["id_lot"]]["effectif_initial"] == 200


def test_turnover_preserves_old_entries_stock_and_another_building(db_session):
    today = date.today()
    start, close = today - timedelta(days=10), today - timedelta(days=1)
    a, b = building(db_session, "Turnover A"), building(db_session, "Turnover B")
    lot_a = create_lot(arrival(a, "Lot A", start), db_session, None)
    lot_b = create_lot(arrival(b, "Lot B", start, count=200, age=20), db_session, None)
    old_cycle = lot_a["repartitions"][0]["id_cycle"]
    saved = create_daily_production(ProductionDailyInput(
        id_batiment=a.id_batiment, date_production=close,
        quantites={"normal": 80}, mortalite=1, consommation_aliment_kg=5,
    ), db_session, None)
    entry_id = saved["records"][0]["id_production"]
    before = _stock_report(db_session, today, cumulative=True)
    terminate_lot(lot_a["id_lot"], CycleProductionTerminate(date_fin_reelle=close), db_session, None)
    after = _stock_report(db_session, today, cumulative=True)
    assert before["totals"]["available_eggs"] == after["totals"]["available_eggs"] == 80

    with pytest.raises(HTTPException) as overlap:
        create_lot(arrival(a, "Too early", close - timedelta(days=1)), db_session, None)
    assert overlap.value.status_code == 400
    db_session.rollback()
    replacement = create_lot(arrival(a, "Lot C", close, count=90), db_session, None)
    assert find_cycle_for_date(db_session, a.id_batiment, close).id_cycle == replacement["repartitions"][0]["id_cycle"]
    historical = get_production(entry_id, db_session, None)
    assert historical["id_cycle"] == old_cycle

    entry_b = create_daily_production(ProductionDailyInput(
        id_batiment=b.id_batiment, date_production=today,
        quantites={"normal": 100}, mortalite=2, consommation_aliment_kg=10,
    ), db_session, None)
    assert entry_b["records"][0]["id_cycle"] == lot_b["repartitions"][0]["id_cycle"]


def test_excess_mortality_rolls_back_the_entire_daily_entry(db_session):
    today = date.today()
    a = building(db_session, "Mortality limit")
    create_lot(arrival(a, "Lot A", today, count=100), db_session, None)
    with pytest.raises(HTTPException) as failure:
        create_daily_production(ProductionDailyInput(
            id_batiment=a.id_batiment, date_production=today,
            quantites={"normal": 80}, mortalite=101, consommation_aliment_kg=5,
        ), db_session, None)
    assert failure.value.status_code == 400
    assert db_session.query(Production).count() == 0
