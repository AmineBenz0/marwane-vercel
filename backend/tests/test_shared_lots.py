from datetime import date, timedelta

import pytest

from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.lot_production import LotProduction


def make_arrival(client, db_session, auth_headers, **changes):
    buildings = [Batiment(nom="Shared A", est_actif=True), Batiment(nom="Shared B", est_actif=True)]
    db_session.add_all(buildings)
    db_session.commit()
    payload = {
        "nom_lot": "Arrivée commune", "date_debut": str(date.today() - timedelta(weeks=18)),
        "age_depart_semaines": 0, "effectif_initial": 300,
        "repartitions": [{"id_batiment": buildings[0].id_batiment, "effectif_initial": 100},
                         {"id_batiment": buildings[1].id_batiment, "effectif_initial": 200}],
        **changes,
    }
    result = client.post("/api/v1/lots-production", json=payload, headers=auth_headers)
    assert result.status_code == 201, result.text
    return payload, result.json()


def daily(client, headers, building, mortality):
    return client.post("/api/v1/productions/daily", json={
        "id_batiment": building, "date_production": str(date.today()),
        "quantites": {}, "mortalite": mortality, "consommation_aliment_kg": "8",
    }, headers=headers)


def test_shared_age_formula_and_independent_results(client, db_session, auth_headers):
    _, lot = make_arrival(client, db_session, auth_headers)
    a, b = lot["repartitions"]
    assert a["id_lot"] == b["id_lot"] == lot["id_lot"]
    assert a["age_semaines"] == b["age_semaines"] == lot["age_semaines"] == 18
    for allocation, deaths in [(a, 3), (b, 4)]:
        result = daily(client, auth_headers, allocation["id_batiment"], deaths)
        assert result.status_code == 201, result.text
        assert result.json()["records"][0]["id_cycle"] == allocation["id_cycle"]
        assert result.json()["records"][0]["formule"] == "25-1% Sem vita"
    summary = client.get("/api/v1/lots-production", headers=auth_headers).json()[0]
    assert summary["effectif_initial"] == 300
    assert summary["effectif_actuel"] == 293
    assert summary["mortalite_totale"] == 7
    assert [row["effectif_actuel"] for row in summary["repartitions"]] == [97, 196]
    for allocation, deaths in [(a, 3), (b, 4)]:
        weeks = client.get(f"/api/v1/cycles-production/{allocation['id_cycle']}/insights", headers=auth_headers).json()
        assert weeks["mortalite_totale"] == deaths
        assert weeks["semaines"][-1]["age_semaines"] == 18


@pytest.mark.parametrize("change", ["total", "duplicate", "negative", "empty"])
def test_invalid_distribution_is_rejected_atomically(client, db_session, auth_headers, change):
    payload, _ = make_arrival(client, db_session, auth_headers)
    if change == "total":
        payload["effectif_initial"] = 301
    elif change == "duplicate":
        payload["repartitions"][1]["id_batiment"] = payload["repartitions"][0]["id_batiment"]
    elif change == "negative":
        payload["repartitions"][0]["effectif_initial"] = -1
    else:
        payload["repartitions"] = []
    result = client.post("/api/v1/lots-production", json=payload, headers=auth_headers)
    assert result.status_code == 422, result.text
    assert db_session.query(LotProduction).count() == 1
    assert db_session.query(CycleProduction).count() == 2


def test_occupied_building_or_missing_building_leaves_no_partial_arrival(client, db_session, auth_headers):
    payload, _ = make_arrival(client, db_session, auth_headers)
    new = Batiment(nom="Free", est_actif=True)
    db_session.add(new)
    db_session.commit()
    payload["repartitions"][0]["id_batiment"] = new.id_batiment
    result = client.post("/api/v1/lots-production", json=payload, headers=auth_headers)
    assert result.status_code == 400
    payload["repartitions"][1]["id_batiment"] = 999999
    assert client.post("/api/v1/lots-production", json=payload, headers=auth_headers).status_code == 400
    assert db_session.query(LotProduction).count() == 1
    assert db_session.query(CycleProduction).filter(CycleProduction.id_batiment == new.id_batiment).count() == 0


def test_shared_corrections_and_independent_lifecycle_are_guarded(client, db_session, auth_headers):
    payload, lot = make_arrival(client, db_session, auth_headers)
    a, b = lot["repartitions"]
    url = f"/api/v1/lots-production/{lot['id_lot']}"
    assert client.put(f"/api/v1/cycles-production/{a['id_cycle']}", json={"age_depart_semaines": 5}, headers=auth_headers).status_code == 409
    assert client.post(f"/api/v1/cycles-production/{b['id_cycle']}/terminer", json={}, headers=auth_headers).status_code == 409
    payload["age_depart_semaines"] = 8
    updated = client.put(url, json=payload, headers=auth_headers)
    assert updated.status_code == 200, updated.text
    assert [row["age_semaines"] for row in updated.json()["repartitions"]] == [26, 26]
    for allocation in (a, b):
        context = client.get(f"/api/v1/cycles-production/context/{allocation['id_batiment']}",
                             params={"date_saisie": str(date.today())}, headers=auth_headers).json()
        assert context["cycle"]["formule_suggeree"] == "26-35 Sem"
    assert daily(client, auth_headers, a["id_batiment"], 10).status_code == 201
    payload["repartitions"][0]["effectif_initial"] = 5
    payload["repartitions"][1]["effectif_initial"] = 295
    rejected = client.put(url, json=payload, headers=auth_headers)
    assert rejected.status_code == 400
    summary = client.get("/api/v1/lots-production", headers=auth_headers).json()[0]
    assert [row["effectif_initial"] for row in summary["repartitions"]] == [100, 200]


def test_closure_is_atomic_and_freezes_every_allocation(client, db_session, auth_headers):
    payload, lot = make_arrival(client, db_session, auth_headers)
    a, b = lot["repartitions"]
    assert daily(client, auth_headers, b["id_batiment"], 2).status_code == 201
    url = f"/api/v1/lots-production/{lot['id_lot']}/terminer"
    blocked = client.post(url, json={"date_fin_reelle": str(date.today() - timedelta(days=1))}, headers=auth_headers)
    assert blocked.status_code == 400
    assert all(row.statut == "actif" for row in db_session.query(CycleProduction).all())
    closed = client.post(url, json={}, headers=auth_headers)
    assert closed.status_code == 200, closed.text
    assert closed.json()["statut"] == "termine"
    assert all(row["statut"] == "termine" for row in closed.json()["repartitions"])
    assert closed.json()["effectif_actuel"] == 298
    assert client.post(url, json={}, headers=auth_headers).json()["id_lot"] == lot["id_lot"]
    for allocation in (a, b):
        assert client.get(f"/api/v1/cycles-production/active/{allocation['id_batiment']}", headers=auth_headers).json() is None
    # Arrival and closure days are inclusive, so a replacement starts the next day.
    payload["date_debut"] = str(date.today())
    assert client.post("/api/v1/lots-production", json=payload, headers=auth_headers).status_code == 400


def test_closed_historical_arrival_allows_a_new_shared_arrival(client, db_session, auth_headers):
    payload, lot = make_arrival(client, db_session, auth_headers)
    end = date.today() - timedelta(weeks=1)
    closed = client.post(f"/api/v1/lots-production/{lot['id_lot']}/terminer",
                         json={"date_fin_reelle": str(end)}, headers=auth_headers).json()
    assert [row["age_semaines"] for row in closed["repartitions"]] == [17, 17]
    payload["date_debut"] = str(date.today())
    new = client.post("/api/v1/lots-production", json=payload, headers=auth_headers)
    assert new.status_code == 201, new.text
    for allocation in lot["repartitions"]:
        historical = client.get(f"/api/v1/cycles-production/context/{allocation['id_batiment']}",
                                params={"date_saisie": str(end)}, headers=auth_headers).json()
        assert historical["cycle"]["id_lot"] == lot["id_lot"]
        assert historical["cycle"]["age_semaines"] == 17


def test_update_rejects_building_allocation_above_incoming_total(client, db_session, auth_headers):
    payload, lot = make_arrival(client, db_session, auth_headers)
    payload["repartitions"][0]["effectif_initial"] = payload["effectif_initial"] + 1
    result = client.put(f"/api/v1/lots-production/{lot['id_lot']}", json=payload, headers=auth_headers)
    assert result.status_code == 422
    saved = client.get("/api/v1/lots-production", headers=auth_headers).json()[0]
    assert [row["effectif_initial"] for row in saved["repartitions"]] == [100, 200]
