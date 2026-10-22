from datetime import date, timedelta

import pytest

from app.models.batiment import Batiment
from app.models.production import Production
from app.utils.production_cycles import carried_formula


@pytest.mark.parametrize("formula,source,target,expected", [
    ("26-35 Sem", 24, 25, "26-35 Sem"),
    ("26-35 Sem", 24, 26, "26-35 Sem"),
    ("26-35 Sem", 24, 36, "36-45 Sem"),
    ("26-35 Sem", 40, 46, "26-35 Sem"),
    ("36-45 Sem", 40, 46, "46-55 Sem"),
    ("86-Réforme", 24, 100, "86-Réforme"),
    (None, 24, 36, "36-45 Sem"),
    ("legacy unknown", 24, 36, "36-45 Sem"),
])
def test_carry_and_catch_up(formula, source, target, expected):
    assert carried_formula(formula, source, target) == expected


def make_lot(client, db, headers, *, start, name="Formula lot"):
    building = Batiment(nom=name, est_actif=True)
    db.add(building)
    db.commit()
    result = client.post("/api/v1/lots-production", headers=headers, json={
        "nom_lot": name, "date_debut": str(start), "effectif_initial": 100,
        "age_depart_semaines": 0,
        "repartitions": [{"id_batiment": building.id_batiment, "effectif_initial": 100}],
    })
    assert result.status_code == 201, result.text
    return building.id_batiment


def save_day(client, headers, building, day, **extra):
    result = client.post("/api/v1/productions/daily", headers=headers, json={
        "id_batiment": building, "date_production": str(day),
        "quantites": {"normal": 10, "blanc": 2}, "grammage": "60", **extra,
    })
    assert result.status_code == 201, result.text
    return result.json()


def context(client, headers, building, day):
    result = client.get(f"/api/v1/cycles-production/context/{building}",
                        headers=headers, params={"date_saisie": str(day)})
    assert result.status_code == 200, result.text
    return result.json()["cycle"]["formule_suggeree"]


def test_saved_exception_survives_reload_catches_up_across_gap_and_stays_lot_scoped(client, db_session, auth_headers):
    start = date.today() - timedelta(weeks=50)
    building = make_lot(client, db_session, auth_headers, start=start)
    source_day = start + timedelta(weeks=24)
    saved = save_day(client, auth_headers, building, source_day, formule="26-35 Sem")
    assert context(client, auth_headers, building, source_day + timedelta(days=1)) == "26-35 Sem"
    other = make_lot(client, db_session, auth_headers, start=start, name="Other formula lot")
    assert context(client, auth_headers, other, source_day) == "25-1% Sem vita"
    assert context(client, auth_headers, building, source_day - timedelta(days=1)) == "25-1% Sem vita"
    # No entry was made during the entire matching 26–35 week phase.
    next_day = start + timedelta(weeks=36)
    assert context(client, auth_headers, building, next_day) == "36-45 Sem"
    defaulted = save_day(client, auth_headers, building, next_day)
    assert defaulted["records"][0]["formule"] == "36-45 Sem"
    history = client.get("/api/v1/productions/daily", headers=auth_headers, params={
        "id_batiment": building, "date_production": str(source_day),
    }).json()
    assert history["records"][0]["formule"] == saved["records"][0]["formule"] == "26-35 Sem"


def test_backward_exception_replacement_and_selecting_normal_resume_schedule(client, db_session, auth_headers):
    start = date.today() - timedelta(weeks=60)
    building = make_lot(client, db_session, auth_headers, start=start)
    save_day(client, auth_headers, building, start + timedelta(weeks=40), formule="26-35 Sem")
    carried = save_day(client, auth_headers, building, start + timedelta(weeks=46))
    assert carried["records"][0]["formule"] == "26-35 Sem"
    save_day(client, auth_headers, building, start + timedelta(weeks=47), formule="36-45 Sem")
    assert context(client, auth_headers, building, start + timedelta(weeks=48)) == "36-45 Sem"
    save_day(client, auth_headers, building, start + timedelta(weeks=48), formule="46-55 Sem")
    assert context(client, auth_headers, building, start + timedelta(weeks=56)) == "56-65 Sem"


def test_cancellation_and_failed_save_do_not_leave_an_exception(client, db_session, auth_headers, monkeypatch):
    start = date.today() - timedelta(weeks=50)
    building = make_lot(client, db_session, auth_headers, start=start)
    day = start + timedelta(weeks=40)
    saved = save_day(client, auth_headers, building, day, formule="26-35 Sem")
    result = client.request("DELETE", "/api/v1/productions/daily", headers=auth_headers, json={
        "id_batiment": building, "date_production": str(day),
        "versions": saved["versions"], "charge_versions": saved["charge_versions"],
    })
    assert result.status_code == 204, result.text
    assert context(client, auth_headers, building, day + timedelta(days=1)) == "36-45 Sem"
    from app.routers import productions
    def fail(*args):
        raise RuntimeError("Failed vaccine save")
    monkeypatch.setattr(productions, "sync_vaccine_expenses", fail)
    failed = client.post("/api/v1/productions/daily", headers=auth_headers, json={
        "id_batiment": building, "date_production": str(day),
        "quantites": {"normal": 10}, "formule": "26-35 Sem",
    })
    assert failed.status_code == 500
    assert context(client, auth_headers, building, day + timedelta(days=1)) == "36-45 Sem"


def test_backdated_correction_does_not_replace_a_later_saved_formula(client, db_session, auth_headers):
    start = date.today() - timedelta(weeks=60)
    building = make_lot(client, db_session, auth_headers, start=start)
    older = start + timedelta(weeks=40)
    saved = save_day(client, auth_headers, building, older, formule="26-35 Sem")
    save_day(client, auth_headers, building, start + timedelta(weeks=46), formule="46-55 Sem")
    changed = client.put("/api/v1/productions/daily", headers=auth_headers, json={
        "id_batiment": building, "date_production": str(older),
        "quantites": {"normal": 10}, "formule": "25-1% Sem vita",
        "versions": saved["versions"], "charge_versions": saved["charge_versions"],
    })
    assert changed.status_code == 200, changed.text
    assert context(client, auth_headers, building, start + timedelta(weeks=47)) == "46-55 Sem"
    # The same building can later house a fresh lot; old exceptions must not leak.
    assert db_session.query(Production).filter(Production.est_actif.is_(True)).count() == 3
