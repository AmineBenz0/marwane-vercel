from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.models.batiment import Batiment
from app.models.production import Production


def daily_payload(db_session):
    building = Batiment(nom="Daily types", est_actif=True)
    db_session.add(building)
    db_session.commit()
    db_session.refresh(building)
    return {
        "date_production": str(date.today()),
        "id_batiment": building.id_batiment,
        "quantites": {"normal": 120, "double_jaune": 30, "casse": 4, "blanc": 10, "perdu": 6},
        "grammage": "63.25",
        "mortalite": 2,
        "consommation_aliment_kg": "12",
    }


def test_daily_types_feed_stock_and_stats_once(client, db_session, auth_headers):
    payload = daily_payload(db_session)
    response = client.post("/api/v1/productions/daily", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    rows = response.json()["records"]
    assert len(rows) == 4
    assert {row["type_oeuf"]: row["nombre_oeufs"] for row in rows} == {
        "normal": 120, "double_jaune": 30, "casse": 10, "blanc": 10,
    }
    casse_row = next(row for row in rows if row["type_oeuf"] == "casse")
    assert casse_row["nombre_cartons"] == 0
    assert {Decimal(row["grammage"]) for row in rows} == {Decimal("63.25")}
    assert sum(row["mortalite"] or 0 for row in rows) == 2
    assert sum(Decimal(row["consommation_aliment_kg"] or 0) for row in rows) == 12
    stock = client.get("/api/v1/productions/stock/daily", headers=auth_headers).json()
    building = next(row for row in stock["batiments"] if row["id_batiment"] == payload["id_batiment"])
    assert building["produced_eggs"] == 160
    assert building["lost_eggs"] == 10
    assert building["available_eggs"] == 150
    assert building["mortalite"] == 2
    assert Decimal(building["consommation_aliment_kg"]) == 12
    categories = {row["type_oeuf"]: row for row in building["categories"]}
    assert {key: value["produced_eggs"] for key, value in categories.items()} == {
        "normal": 120, "double_jaune": 30, "casse": 0, "blanc": 10,
    }
    assert categories["casse"]["lost_eggs"] == 10
    assert categories["casse"]["available_eggs"] == 0
    stats = client.get("/api/v1/productions/stats/daily", headers=auth_headers).json()[0]
    assert stats["total_oeufs"] == 160
    assert {row["type"]: row["count"] for row in stats["par_type"]} == {
        "normal": 120, "double_jaune": 30, "casse": 10, "blanc": 10,
    }


def test_daily_update_removes_zero_types_and_preserves_audit(client, db_session, auth_headers):
    payload = daily_payload(db_session)
    created = client.post("/api/v1/productions/daily", json=payload, headers=auth_headers).json()
    normal_id = next(row["id_production"] for row in created["records"] if row["type_oeuf"] == "normal")
    daily = client.get("/api/v1/productions/daily", params={
        "id_batiment": payload["id_batiment"], "date_production": payload["date_production"],
    }, headers=auth_headers)
    assert daily.status_code == 200
    response = client.put("/api/v1/productions/daily", json={
        **payload, "versions": daily.json()["versions"],
        "quantites": {"normal": 0, "double_jaune": 20, "blanc": 50, "perdu": 2},
        "grammage": "58", "mortalite": 3,
    }, headers=auth_headers)
    assert response.status_code == 200, response.text
    rows = response.json()["records"]
    assert len(rows) == 3
    assert {row["type_oeuf"]: row["nombre_oeufs"] for row in rows} == {
        "double_jaune": 20, "blanc": 50, "casse": 2,
    }
    assert all(Decimal(row["grammage"]) == 58 for row in rows)
    assert sum(row["mortalite"] or 0 for row in rows) == 3
    removed = db_session.get(Production, normal_id)
    db_session.refresh(removed)
    assert removed.est_actif is False
    assert removed.date_annulation is not None
    assert removed.nombre_oeufs == 120
    stale = client.put("/api/v1/productions/daily", json={
        **payload, "versions": created["versions"],
    }, headers=auth_headers)
    assert stale.status_code == 409
    duplicate = client.post("/api/v1/productions/daily", json=payload, headers=auth_headers)
    assert duplicate.status_code == 409


@pytest.mark.parametrize("counts", [
    {}, {"normal": -1}, {"normal": 1.5}, {"normal": 0}, {"unknown": 10},
])
def test_invalid_daily_quantities_do_not_write(client, db_session, auth_headers, counts):
    payload = daily_payload(db_session)
    response = client.post("/api/v1/productions/daily", json={
        **payload, "quantites": counts,
    }, headers=auth_headers)
    assert response.status_code == 422
    assert db_session.query(Production).count() == 0


def test_daily_batch_rolls_back_all_types(db_session, auth_headers, monkeypatch):
    payload = daily_payload(db_session)

    def fail_commit():
        db_session.flush()
        raise IntegrityError("simulated failure", {}, RuntimeError("test"))

    monkeypatch.setattr(db_session, "commit", fail_commit)
    response = TestClient(app, raise_server_exceptions=False).post(
        "/api/v1/productions/daily", json=payload, headers=auth_headers,
    )
    assert response.status_code == 500
    assert db_session.query(Production).count() == 0


def test_daily_cancel_is_atomic_and_checks_versions(client, db_session, auth_headers):
    payload = daily_payload(db_session)
    daily = client.post("/api/v1/productions/daily", json=payload, headers=auth_headers).json()
    cancel_payload = {
        "id_batiment": payload["id_batiment"],
        "date_production": payload["date_production"],
        "versions": {},
    }
    conflict = client.request("DELETE", "/api/v1/productions/daily", json=cancel_payload, headers=auth_headers)
    assert conflict.status_code == 409
    assert db_session.query(Production).filter(Production.est_actif.is_(True)).count() == 5
    response = client.request("DELETE", "/api/v1/productions/daily", json={
        **cancel_payload, "versions": daily["versions"],
    }, headers=auth_headers)
    assert response.status_code == 204, response.text
    assert db_session.query(Production).filter(Production.est_actif.is_(True)).count() == 0
    assert db_session.query(Production).count() == 5
    assert all(row.date_annulation for row in db_session.query(Production).all())
