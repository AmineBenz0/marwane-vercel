"""The performance API preserves dated lot ownership and source-day identity."""
from datetime import date, timedelta

import pytest

from app.models.batiment import Batiment
from app.models.production import Production
from tests.lot_test_helpers import add_lot_cycle


@pytest.mark.parametrize('closed', [False, True])
def test_performance_dates_ownership_and_recorded_zero(client, db_session, closed):
    today = date.today()
    start = today - timedelta(days=10)
    end = start + timedelta(days=4) if closed else today
    building = Batiment(nom='Bâtiment B source', est_actif=True)
    db_session.add(building)
    db_session.flush()
    _, historical = add_lot_cycle(db_session, building, name='Historical lot B',
        date_debut=start - timedelta(days=30), date_fin_reelle=start - timedelta(days=1), statut='termine')
    lot, cycle = add_lot_cycle(db_session, building, name='Selected lot B', date_debut=start,
        date_fin_reelle=end if closed else None, statut='termine' if closed else 'actif')

    def record(day, quantity, owner, active=True):
        row = Production(id_batiment=building.id_batiment, id_cycle=owner,
            date_production=day, type_oeuf='normal', calibre='moyen', nombre_oeufs=quantity,
            grammage=55, nombre_cartons=0, est_actif=active)
        db_session.add(row)
        db_session.flush()
        return row

    entered = record(start, 1750, cycle.id_cycle)
    zero = record(end, 0, cycle.id_cycle)
    unassigned = record(start + timedelta(days=1), 999, None)
    old = record(start - timedelta(days=2), 800, historical.id_cycle)
    record(start - timedelta(days=1), 777, cycle.id_cycle)
    record(end + timedelta(days=1), 666, cycle.id_cycle)
    record(start + timedelta(days=2), 555, cycle.id_cycle, active=False)
    db_session.commit()
    ownership = {row.id_production: row.id_cycle for row in db_session.query(Production).all()}

    response = client.get('/api/v1/productions/performance', params={'id_cycle': cycle.id_cycle})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['cycle']['id_lot'] == lot.id_lot
    assert data['cycle']['id_batiment'] == building.id_batiment
    days = [row for row in data['rows'] if row['rowType'] == 'day']
    assert [(row['date_production'], row['oeufs']) for row in days] == [
        (entered.date_production.isoformat(), 1750), (zero.date_production.isoformat(), 0)]
    assert days[0]['date'] == start.strftime('%d/%m/%y')
    assert not any(row['date_production'] == unassigned.date_production.isoformat() for row in days)
    db_session.expire_all()
    assert {row.id_production: row.id_cycle for row in db_session.query(Production).all()} == ownership
    assert db_session.get(Production, unassigned.id_production).id_cycle is None
    assert db_session.get(Production, old.id_production).id_cycle == historical.id_cycle
