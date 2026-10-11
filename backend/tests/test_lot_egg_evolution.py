from datetime import date, timedelta

from app.models.production import Production
from tests.test_shared_lots import make_arrival


def add_record(db, allocation, day, kind="normal", count=10, **changes):
    row = Production(
        id_cycle=allocation["id_cycle"], id_batiment=allocation["id_batiment"],
        date_production=day, type_oeuf=kind, nombre_oeufs=count,
        grammage=55, nombre_cartons=1, **changes,
    )
    db.add(row)


def test_week_boundaries_all_buildings_calibres_and_missing_weeks(client, db_session, auth_headers):
    start = date.today() - timedelta(days=24)
    _, lot = make_arrival(client, db_session, auth_headers, date_debut=str(start))
    a, b = lot["repartitions"]
    add_record(db_session, a, start, count=100, calibre="moyen")
    add_record(db_session, a, start, count=50, calibre="gros")
    add_record(db_session, b, start + timedelta(days=6), count=200)
    add_record(db_session, a, start + timedelta(days=7), "blanc", 25)
    add_record(db_session, a, start + timedelta(days=7), "casse", 3)
    add_record(db_session, b, start + timedelta(days=7), "perdu", 2)
    add_record(db_session, a, start + timedelta(days=21), "double_jaune", 30)
    add_record(db_session, b, start + timedelta(days=21), "double_jaune_demarrage", 7)
    # Cancelled, unassigned, and outside-lot dates cannot inflate the chart.
    add_record(db_session, a, start, count=999, est_actif=False)
    add_record(db_session, a, start - timedelta(days=1), count=999)
    add_record(db_session, a, date.today() + timedelta(days=1), count=999)
    db_session.add(Production(id_batiment=a["id_batiment"], date_production=start,
                              type_oeuf="normal", nombre_oeufs=999, grammage=55, nombre_cartons=1))
    db_session.commit()
    response = client.get(f"/api/v1/lots-production/{lot['id_lot']}/egg-evolution", headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    weeks = data["semaines"]
    assert [week["semaine"] for week in weeks] == [1, 2, 3, 4]
    assert weeks[0]["quantites"]["normal"] == 350
    assert weeks[0]["saisies"] == 2  # Several calibres in one building-day count once.
    assert weeks[0]["saisies_attendues"] == 14
    assert weeks[1]["quantites"]["blanc"] == 25
    assert weeks[1]["quantites"]["casse"] == 5
    assert weeks[1]["quantites"]["normal"] == 0
    assert all(value is None for value in weeks[2]["quantites"].values())
    assert weeks[3]["partielle"] is True
    assert weeks[3]["saisies_attendues"] == 8
    assert all(week["incomplete"] for week in weeks)
    assert data["totaux"] == {"normal": 350, "blanc": 25, "casse": 5,
                              "double_jaune": 30, "double_jaune_demarrage": 7}


def test_closed_lot_stays_isolated_from_replacement_on_same_date(client, db_session, auth_headers):
    start = date.today() - timedelta(days=14)
    payload, old = make_arrival(client, db_session, auth_headers, date_debut=str(start))
    end = start + timedelta(days=7)
    add_record(db_session, old["repartitions"][0], end, count=12)
    db_session.commit()
    response = client.post(f"/api/v1/lots-production/{old['id_lot']}/terminer",
                           json={"date_fin_reelle": str(end)}, headers=auth_headers)
    assert response.status_code == 200, response.text
    new = client.post("/api/v1/lots-production", json={**payload, "date_debut": str(end)}, headers=auth_headers).json()
    add_record(db_session, new["repartitions"][0], end, count=40)
    db_session.commit()
    old_data = client.get(f"/api/v1/lots-production/{old['id_lot']}/egg-evolution", headers=auth_headers).json()
    new_data = client.get(f"/api/v1/lots-production/{new['id_lot']}/egg-evolution", headers=auth_headers).json()
    assert old_data["totaux"]["normal"] == 12
    assert old_data["semaines"][-1]["date_fin"] == str(end)
    assert new_data["totaux"]["normal"] == 40


def test_full_history_is_not_truncated_and_complete_zero_is_distinct_from_missing(client, db_session, auth_headers):
    start = date.today() - timedelta(days=279)
    _, lot = make_arrival(client, db_session, auth_headers, date_debut=str(start))
    for offset in range(280):
        for allocation in lot["repartitions"]:
            add_record(db_session, allocation, start + timedelta(days=offset), count=0 if offset < 7 else 1)
    db_session.commit()
    data = client.get(f"/api/v1/lots-production/{lot['id_lot']}/egg-evolution", headers=auth_headers).json()
    assert len(data["semaines"]) == 40
    assert data["totaux"]["normal"] == 546
    assert data["semaines"][0]["quantites"]["normal"] == 0
    assert all(week["saisies"] == 14 and not week["incomplete"] for week in data["semaines"])


def test_missing_and_empty_lots(client, db_session, auth_headers):
    assert client.get("/api/v1/lots-production/99999/egg-evolution", headers=auth_headers).status_code == 404
    _, lot = make_arrival(client, db_session, auth_headers, date_debut=str(date.today()))
    data = client.get(f"/api/v1/lots-production/{lot['id_lot']}/egg-evolution", headers=auth_headers).json()
    assert data["semaines"][0]["saisies"] == 0
    assert data["totaux"]["normal"] == 0
    assert data["semaines"][0]["quantites"]["normal"] is None
