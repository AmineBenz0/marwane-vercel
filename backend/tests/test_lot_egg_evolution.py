from datetime import date, timedelta

from app.models.batiment import Batiment
from app.models.production import Production


def make_lot(client, db_session, auth_headers, *, name, start, building_name, age=0, flock=100):
    building = db_session.query(Batiment).filter(Batiment.nom == building_name).first()
    if building is None:
        building = Batiment(nom=building_name, est_actif=True)
        db_session.add(building)
        db_session.commit()
    response = client.post("/api/v1/lots-production", json={
        "nom_lot": name,
        "date_debut": str(start),
        "age_depart_semaines": age,
        "effectif_initial": flock,
        "repartitions": [{"id_batiment": building.id_batiment, "effectif_initial": flock}],
    }, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def add_record(db_session, cycle, day, kind="normal", count=10, **changes):
    row = Production(
        id_cycle=cycle["id_cycle"], id_batiment=cycle["id_batiment"],
        date_production=day, type_oeuf=kind, nombre_oeufs=count,
        grammage=55, nombre_cartons=1, **changes,
    )
    db_session.add(row)


def test_week_boundaries_and_egg_evolution_are_scoped_to_one_building(
    client, db_session, auth_headers,
):
    start = date.today() - timedelta(days=24)
    lot = make_lot(client, db_session, auth_headers, name="Lot A", start=start,
                   building_name="Evolution A", age=30)
    other_lot = make_lot(client, db_session, auth_headers, name="Lot B", start=start,
                         building_name="Evolution B", age=4)
    cycle = lot["repartitions"][0]
    other_cycle = other_lot["repartitions"][0]
    add_record(db_session, cycle, start, count=100, calibre="moyen")
    add_record(db_session, cycle, start, count=50, calibre="gros")
    add_record(db_session, cycle, start + timedelta(days=6), count=200)
    add_record(db_session, cycle, start + timedelta(days=7), "blanc", 25)
    add_record(db_session, cycle, start + timedelta(days=7), "casse", 3)
    add_record(db_session, cycle, start + timedelta(days=7), "perdu", 2)
    add_record(db_session, cycle, start + timedelta(days=21), "double_jaune", 30)
    add_record(db_session, cycle, start + timedelta(days=21), "double_jaune_demarrage", 7)
    # A different lot's same-day record must not leak into this lot's chart.
    add_record(db_session, other_cycle, start + timedelta(days=6), count=999)
    # Cancelled, unassigned, and out-of-period records are excluded.
    add_record(db_session, cycle, start, count=999, est_actif=False)
    add_record(db_session, cycle, start - timedelta(days=1), count=999)
    add_record(db_session, cycle, date.today() + timedelta(days=1), count=999)
    db_session.add(Production(
        id_batiment=cycle["id_batiment"], date_production=start,
        type_oeuf="normal", nombre_oeufs=999, grammage=55, nombre_cartons=1,
    ))
    db_session.commit()

    response = client.get(f"/api/v1/lots-production/{lot['id_lot']}/egg-evolution", headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    weeks = data["semaines"]
    assert [week["semaine"] for week in weeks] == [1, 2, 3, 4]
    assert weeks[0]["quantites"]["normal"] == 350
    assert weeks[0]["saisies"] == 2
    assert weeks[0]["saisies_attendues"] == 7
    assert weeks[1]["quantites"]["blanc"] == 25
    assert weeks[1]["quantites"]["casse"] == 5
    assert weeks[1]["quantites"]["normal"] is None
    assert all(value is None for value in weeks[2]["quantites"].values())
    assert weeks[3]["partielle"] is True
    assert weeks[3]["saisies_attendues"] == 4
    assert all(week["incomplete"] for week in weeks)
    assert data["totaux"] == {
        "normal": 350, "blanc": 25, "casse": 5,
        "double_jaune": 30, "double_jaune_demarrage": 7,
    }


def test_closed_lot_stays_isolated_from_replacement_on_same_date(client, db_session, auth_headers):
    start = date.today() - timedelta(days=14)
    old = make_lot(client, db_session, auth_headers, name="Old", start=start,
                   building_name="Turnover", age=20)
    end = start + timedelta(days=7)
    add_record(db_session, old["repartitions"][0], end, count=12)
    db_session.commit()
    response = client.post(f"/api/v1/lots-production/{old['id_lot']}/terminer",
                           json={"date_fin_reelle": str(end)}, headers=auth_headers)
    assert response.status_code == 200, response.text
    new = make_lot(client, db_session, auth_headers, name="New", start=end,
                   building_name="Turnover", age=2, flock=80)
    add_record(db_session, new["repartitions"][0], end, count=40)
    db_session.commit()
    old_data = client.get(f"/api/v1/lots-production/{old['id_lot']}/egg-evolution", headers=auth_headers).json()
    new_data = client.get(f"/api/v1/lots-production/{new['id_lot']}/egg-evolution", headers=auth_headers).json()
    assert old_data["totaux"]["normal"] == 12
    assert old_data["semaines"][-1]["date_fin"] == str(end)
    assert new_data["totaux"]["normal"] == 40


def test_full_history_is_not_truncated_and_complete_zero_differs_from_missing(
    client, db_session, auth_headers,
):
    start = date.today() - timedelta(days=279)
    lot = make_lot(client, db_session, auth_headers, name="Long-running", start=start,
                   building_name="Long history", flock=100)
    cycle = lot["repartitions"][0]
    for offset in range(280):
        add_record(db_session, cycle, start + timedelta(days=offset), count=0 if offset < 7 else 1)
    db_session.commit()
    data = client.get(f"/api/v1/lots-production/{lot['id_lot']}/egg-evolution", headers=auth_headers).json()
    assert len(data["semaines"]) == 40
    assert data["totaux"]["normal"] == 273
    assert data["semaines"][0]["quantites"]["normal"] == 0
    assert all(week["saisies"] == 7 and not week["incomplete"] for week in data["semaines"])


def test_missing_and_empty_lots(client, db_session, auth_headers):
    assert client.get("/api/v1/lots-production/99999/egg-evolution", headers=auth_headers).status_code == 404
    lot = make_lot(client, db_session, auth_headers, name="Empty", start=date.today(),
                   building_name="Empty history")
    data = client.get(f"/api/v1/lots-production/{lot['id_lot']}/egg-evolution", headers=auth_headers).json()
    assert data["semaines"][0]["saisies"] == 0
    assert data["totaux"]["normal"] == 0
    assert data["semaines"][0]["quantites"]["normal"] is None
