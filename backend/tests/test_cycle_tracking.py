from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.batiment import Batiment
from app.utils.production_cycles import suggested_formula


@pytest.mark.parametrize(("age", "formula"), [
    (0, "17-1% Sem vita"), (17, "17-1% Sem vita"),
    (18, "25-1% Sem vita"), (25, "25-1% Sem vita"),
    (26, "26-35 Sem"), (35, "26-35 Sem"), (36, "36-45 Sem"),
    (45, "36-45 Sem"), (46, "46-55 Sem"), (55, "46-55 Sem"),
    (56, "56-65 Sem"), (65, "56-65 Sem"), (66, "66-75 Sem"),
    (75, "66-75 Sem"), (76, "76-85 Sem"), (85, "76-85 Sem"),
    (86, "86-Réforme"), (130, "86-Réforme"),
])
def test_formula_age_boundaries(age, formula):
    assert suggested_formula(age) == formula


def make_cycle(client, db_session, auth_headers, start=None, **overrides):
    building = Batiment(nom="Flock tracking", est_actif=True)
    db_session.add(building)
    db_session.commit()
    payload = {
        "id_batiment": building.id_batiment,
        "nom_cycle": "Cycle suivi",
        "date_debut": str(start or date.today()),
        "effectif_initial": 100,
        **overrides,
    }
    response = client.post("/api/v1/cycles-production", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_operational_day_auto_links_and_preserves_history(client, db_session, auth_headers):
    cycle = make_cycle(client, db_session, auth_headers, age_depart_semaines=18)
    payload = {
        "date_production": str(date.today()), "id_batiment": cycle["id_batiment"],
        "quantites": {}, "mortalite": 2, "consommation_aliment_kg": "8",
    }
    created = client.post("/api/v1/productions/daily", json=payload, headers=auth_headers)
    assert created.status_code == 201, created.text
    body = created.json()
    row = body["records"][0]
    assert row["nombre_oeufs"] == 0
    assert row["nombre_cartons"] == 0
    assert row["id_cycle"] == cycle["id_cycle"]
    assert row["formule"] == "25-1% Sem vita"
    stock = client.get("/api/v1/productions/stock/daily", headers=auth_headers).json()
    building = next(item for item in stock["batiments"] if item["id_batiment"] == cycle["id_batiment"])
    assert building["entries_count"] == 1
    assert building["categories"] == []
    assert building["mortalite"] == 2
    assert Decimal(str(building["consommation_aliment_kg"])) == 8
    changed = client.put("/api/v1/productions/daily", json={
        **payload, "quantites": {"normal": 70}, "grammage": "60",
        "formule": "26-35 Sem", "versions": body["versions"],
    }, headers=auth_headers)
    assert changed.status_code == 200, changed.text
    assert len(changed.json()["records"]) == 1
    assert changed.json()["records"][0]["formule"] == "26-35 Sem"
    context = client.get(f"/api/v1/cycles-production/context/{cycle['id_batiment']}",
                         params={"date_saisie": str(date.today())}, headers=auth_headers).json()
    assert context["cycle"]["effectif_actuel"] == 98


def test_manual_end_not_planned_end_and_frozen_age(client, db_session, auth_headers):
    start = date.today() - timedelta(weeks=110)
    cycle = make_cycle(client, db_session, auth_headers, start=start, duree_semaines=1)
    active = client.get(f"/api/v1/cycles-production/active/{cycle['id_batiment']}", headers=auth_headers).json()
    assert active["statut"] == "actif"
    assert active["semaine_cycle"] == 111
    assert active["formule_suggeree"] == "86-Réforme"
    ended = client.post(f"/api/v1/cycles-production/{cycle['id_cycle']}/terminer", json={
        "date_fin_reelle": str(start + timedelta(weeks=90)),
    }, headers=auth_headers)
    assert ended.status_code == 200, ended.text
    history = client.get(f"/api/v1/cycles-production/{cycle['id_cycle']}", headers=auth_headers).json()
    assert history["age_semaines"] == 90
    assert history["semaine_cycle"] == 91
    assert client.get(f"/api/v1/cycles-production/active/{cycle['id_batiment']}", headers=auth_headers).json() is None
    blocked = client.post("/api/v1/productions/daily", json={
        "date_production": str(date.today()), "id_batiment": cycle["id_batiment"],
        "quantites": {}, "mortalite": 1,
    }, headers=auth_headers)
    assert blocked.status_code == 400
    new = client.post("/api/v1/cycles-production", json={
        "id_batiment": cycle["id_batiment"], "nom_cycle": "Nouveau",
        "date_debut": str(date.today()), "effectif_initial": 150,
    }, headers=auth_headers)
    assert new.status_code == 201, new.text


def test_weekly_rates_use_recorded_bird_days_and_show_gaps(client, db_session, auth_headers):
    start = date.today() - timedelta(days=8)
    cycle = make_cycle(client, db_session, auth_headers, start=start, age_depart_semaines=26)
    for offset in (0, 1):
        result = client.post("/api/v1/productions/daily", json={
            "date_production": str(start + timedelta(days=offset)),
            "id_batiment": cycle["id_batiment"],
            "quantites": {"normal": 70, "casse": 5}, "grammage": "60",
            "consommation_aliment_kg": "10" if offset == 0 else None,
        }, headers=auth_headers)
        assert result.status_code == 201, result.text
    result = client.get(f"/api/v1/cycles-production/{cycle['id_cycle']}/insights", headers=auth_headers)
    assert result.status_code == 200, result.text
    first, second = result.json()["semaines"]
    assert first["jours_saisis"] == 2
    assert first["jours_attendus"] == 7
    assert first["oeufs"] == 140
    assert Decimal(str(first["ponte_pct"])) == 75
    assert first["jours_aliment"] == 1
    assert Decimal(str(first["g_poule_jour"])) == 100
    assert first["age_semaines"] == 26
    assert second["jours_saisis"] == 0
    assert second["ponte_pct"] is None


def test_history_assignment_is_explicit_and_keeps_recorded_formula(client, db_session, auth_headers):
    building = Batiment(nom="Existing daily", est_actif=True)
    db_session.add(building)
    db_session.commit()
    created = client.post("/api/v1/productions/daily", json={
        "date_production": str(date.today()), "id_batiment": building.id_batiment,
        "quantites": {"normal": 80}, "grammage": "60", "formule": "manuelle", "mortalite": 3,
    }, headers=auth_headers).json()
    cycle = client.post("/api/v1/cycles-production", json={
        "id_batiment": building.id_batiment, "nom_cycle": "Existant",
        "date_debut": str(date.today()), "effectif_initial": 100,
    }, headers=auth_headers).json()
    assert created["records"][0]["id_cycle"] is None
    result = client.post(f"/api/v1/cycles-production/{cycle['id_cycle']}/rattacher", json={
        "date_debut": str(date.today()), "date_fin": str(date.today()),
    }, headers=auth_headers)
    assert result.status_code == 200, result.text
    daily = client.get("/api/v1/productions/daily", params={
        "id_batiment": building.id_batiment, "date_production": str(date.today()),
    }, headers=auth_headers).json()
    assert daily["records"][0]["id_cycle"] == cycle["id_cycle"]
    assert daily["records"][0]["formule"] == "manuelle"
    assert daily["records"][0]["nombre_oeufs"] == 80
    repeat = client.post(f"/api/v1/cycles-production/{cycle['id_cycle']}/rattacher", json={
        "date_debut": str(date.today()), "date_fin": str(date.today()),
    }, headers=auth_headers)
    assert repeat.json()["rattachees"] == 0


def test_mortality_cannot_exceed_flock_or_close_before_entries(client, db_session, auth_headers):
    cycle = make_cycle(client, db_session, auth_headers, start=date.today() - timedelta(days=2))
    payload = {"date_production": str(date.today()), "id_batiment": cycle["id_batiment"],
               "quantites": {}, "mortalite": 101}
    assert client.post("/api/v1/productions/daily", json=payload, headers=auth_headers).status_code == 400
    payload["mortalite"] = 2
    assert client.post("/api/v1/productions/daily", json=payload, headers=auth_headers).status_code == 201
    close = client.post(f"/api/v1/cycles-production/{cycle['id_cycle']}/terminer", json={
        "date_fin_reelle": str(date.today() - timedelta(days=1)),
    }, headers=auth_headers)
    assert close.status_code == 400


def test_context_uses_entry_date_and_retains_closed_cycle(client, db_session, auth_headers):
    start = date.today() - timedelta(weeks=28)
    cycle = make_cycle(client, db_session, auth_headers, start=start)
    day = start + timedelta(weeks=18)
    context_url = f"/api/v1/cycles-production/context/{cycle['id_batiment']}"
    context = client.get(context_url, params={"date_saisie": str(day)}, headers=auth_headers).json()
    assert context["cycle"]["age_semaines"] == 18
    assert context["cycle"]["formule_suggeree"] == "25-1% Sem vita"
    ended = client.post(f"/api/v1/cycles-production/{cycle['id_cycle']}/terminer", json={
        "date_fin_reelle": str(start + timedelta(weeks=25)),
    }, headers=auth_headers)
    assert ended.status_code == 200
    historical = client.get(context_url, params={"date_saisie": str(day)}, headers=auth_headers).json()
    assert historical["cycle"]["id_cycle"] == cycle["id_cycle"]
    assert historical["cycle"]["age_semaines"] == 18
    assert historical["cycle"]["statut"] == "termine"
