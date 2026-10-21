from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.database import get_db
from app.main import app

from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.lot_production import LotProduction


def make_building(db_session, name):
    building = Batiment(nom=name, est_actif=True)
    db_session.add(building)
    db_session.commit()
    return building


def create_lot(client, headers, building_id, *, name="Independent lot", count=100, start=None):
    payload = {
        "nom_lot": name,
        "date_debut": str(start or date.today()),
        "age_depart_semaines": 0,
        "effectif_initial": count,
        "repartitions": [{"id_batiment": building_id, "effectif_initial": count}],
    }
    response = client.post("/api/v1/lots-production", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_two_buildings_can_have_independent_active_lots(client, db_session, auth_headers):
    building_a = make_building(db_session, "Independent A")
    building_b = make_building(db_session, "Independent B")

    lot_a = create_lot(client, auth_headers, building_a.id_batiment, name="Lot A", count=100)
    lot_b = create_lot(client, auth_headers, building_b.id_batiment, name="Lot B", count=250)

    assert lot_a["id_lot"] != lot_b["id_lot"]
    assert len(lot_a["repartitions"]) == len(lot_b["repartitions"]) == 1
    cycle_a = lot_a["repartitions"][0]
    cycle_b = lot_b["repartitions"][0]
    assert cycle_a["id_lot"] == lot_a["id_lot"]
    assert cycle_b["id_lot"] == lot_b["id_lot"]
    assert cycle_a["id_batiment"] == building_a.id_batiment
    assert cycle_b["id_batiment"] == building_b.id_batiment
    assert cycle_a["effectif_initial"] == lot_a["effectif_initial"] == 100
    assert cycle_b["effectif_initial"] == lot_b["effectif_initial"] == 250
    assert cycle_a["statut"] == cycle_b["statut"] == "actif"


def test_second_active_lot_is_rejected_only_for_the_same_building(client, db_session, auth_headers):
    building_a = make_building(db_session, "Occupied A")
    building_b = make_building(db_session, "Available B")
    create_lot(client, auth_headers, building_a.id_batiment)

    duplicate = client.post("/api/v1/lots-production", json={
        "nom_lot": "Duplicate A", "date_debut": str(date.today()),
        "age_depart_semaines": 0, "effectif_initial": 50,
        "repartitions": [{"id_batiment": building_a.id_batiment, "effectif_initial": 50}],
    }, headers=auth_headers)
    assert duplicate.status_code == 400
    assert "déjà un lot actif" in duplicate.json()["detail"]

    independent = create_lot(client, auth_headers, building_b.id_batiment, name="Lot B", count=50)
    assert independent["repartitions"][0]["id_batiment"] == building_b.id_batiment
    assert db_session.query(LotProduction).count() == 2


@pytest.mark.parametrize("allocations,total", [
    ([{"id_batiment": 1, "effectif_initial": 40},
      {"id_batiment": 2, "effectif_initial": 60}], 100),
    ([{"id_batiment": 1, "effectif_initial": 99}], 100),
])
def test_api_rejects_shared_or_unequal_lot_flock(client, db_session, auth_headers, allocations, total):
    result = client.post("/api/v1/lots-production", json={
        "nom_lot": "Invalid lot", "date_debut": str(date.today()),
        "age_depart_semaines": 0, "effectif_initial": total,
        "repartitions": allocations,
    }, headers=auth_headers)
    assert result.status_code == 422
    assert db_session.query(LotProduction).count() == 0
    assert db_session.query(CycleProduction).count() == 0


def test_cycle_update_changes_parent_and_snapshot_together(client, db_session, auth_headers):
    building = make_building(db_session, "Snapshot building")
    lot = create_lot(client, auth_headers, building.id_batiment)
    cycle_id = lot["repartitions"][0]["id_cycle"]

    response = client.put(f"/api/v1/cycles-production/{cycle_id}", json={
        "age_depart_semaines": 6, "souche": "Souche A",
    }, headers=auth_headers)
    assert response.status_code == 200, response.text

    db_session.expire_all()
    parent = db_session.query(LotProduction).filter_by(id_lot=lot["id_lot"]).one()
    cycle = db_session.query(CycleProduction).filter_by(id_cycle=cycle_id).one()
    assert parent.age_depart_semaines == cycle.age_depart_semaines == 6
    assert parent.souche == cycle.souche == "Souche A"
    assert parent.effectif_initial == cycle.effectif_initial == 100


def test_closing_one_lot_leaves_other_building_active_and_turnover_keeps_cycle_ids(client, db_session, auth_headers):
    building_a = make_building(db_session, "Turnover A")
    building_b = make_building(db_session, "Turnover B")
    lot_a = create_lot(client, auth_headers, building_a.id_batiment, name="A old", count=100)
    lot_b = create_lot(client, auth_headers, building_b.id_batiment, name="B active", count=200)
    cycle_a = lot_a["repartitions"][0]
    cycle_b = lot_b["repartitions"][0]

    closed = client.post(f"/api/v1/lots-production/{lot_a['id_lot']}/terminer", json={
        "date_fin_reelle": str(date.today()),
    }, headers=auth_headers)
    assert closed.status_code == 200, closed.text
    assert closed.json()["statut"] == "termine"
    assert client.get(f"/api/v1/cycles-production/active/{building_b.id_batiment}",
                      headers=auth_headers).json()["id_cycle"] == cycle_b["id_cycle"]

    successor = create_lot(client, auth_headers, building_a.id_batiment, name="A successor", count=90)
    successor_cycle = successor["repartitions"][0]
    context = client.get(f"/api/v1/cycles-production/context/{building_a.id_batiment}",
                         params={"date_saisie": str(date.today())}, headers=auth_headers).json()
    assert context["cycle"]["id_cycle"] == successor_cycle["id_cycle"]
    assert successor_cycle["id_cycle"] != cycle_a["id_cycle"]
    assert db_session.query(CycleProduction).filter_by(id_cycle=cycle_a["id_cycle"]).one().id_lot == lot_a["id_lot"]


def test_simultaneous_lot_requests_for_one_building_create_only_one_active_lot(
    client, db_session, auth_headers
):
    if db_session.get_bind().dialect.name != "postgresql":
        pytest.skip("The concurrent row-lock test requires PostgreSQL.")

    building = make_building(db_session, "Concurrent arrivals")
    session_factory = sessionmaker(
        bind=db_session.get_bind(),
        autocommit=False,
        autoflush=False,
    )

    def independent_db_session():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    original_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = independent_db_session
    start = str(date.today())
    payloads = [
        {
            "nom_lot": f"Concurrent lot {index}",
            "date_debut": start,
            "age_depart_semaines": 0,
            "effectif_initial": 100 + index,
            "repartitions": [{
                "id_batiment": building.id_batiment,
                "effectif_initial": 100 + index,
            }],
        }
        for index in (1, 2)
    ]
    barrier = Barrier(3)

    def submit(payload):
        barrier.wait(timeout=10)
        return client.post("/api/v1/lots-production", json=payload, headers=auth_headers)

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            requests = [executor.submit(submit, payload) for payload in payloads]
            barrier.wait(timeout=10)
            responses = [request.result(timeout=30) for request in requests]
    finally:
        if original_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = original_override

    assert sorted(response.status_code for response in responses) == [201, 400], [
        response.text for response in responses
    ]
    db_session.expire_all()
    active_cycles = db_session.query(CycleProduction).filter(
        CycleProduction.id_batiment == building.id_batiment,
        CycleProduction.statut.in_(("actif", "a_cloturer")),
    ).all()
    assert len(active_cycles) == 1
    assert db_session.query(LotProduction).filter(
        LotProduction.id_lot == active_cycles[0].id_lot
    ).count() == 1


def test_database_partial_index_rejects_two_active_cycles_in_one_building(db_session):
    building = make_building(db_session, "Database guard")
    start = date.today()
    common = dict(
        nom_lot="Parent", souche=None, date_debut=start, age_depart_semaines=0,
        effectif_initial=10, duree_semaines=100, date_fin_prevue=start + timedelta(days=699),
        statut="actif",
    )
    lot_a = LotProduction(**common)
    db_session.add(lot_a)
    db_session.flush()
    db_session.add(CycleProduction(
        id_lot=lot_a.id_lot, id_batiment=building.id_batiment,
        nom_cycle="Parent", date_debut=start, age_depart_semaines=0,
        effectif_initial=10, duree_semaines=100, date_fin_prevue=start + timedelta(days=699),
        statut="actif",
    ))
    db_session.commit()

    lot_b = LotProduction(**{**common, "nom_lot": "Parent 2"})
    db_session.add(lot_b)
    db_session.flush()
    db_session.add(CycleProduction(
        id_lot=lot_b.id_lot, id_batiment=building.id_batiment,
        nom_cycle="Parent 2", date_debut=start, age_depart_semaines=0,
        effectif_initial=10, duree_semaines=100, date_fin_prevue=start + timedelta(days=699),
        statut="actif",
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_database_prevents_one_lot_from_linking_multiple_cycles(db_session):
    building_a = make_building(db_session, "One-to-one A")
    building_b = make_building(db_session, "One-to-one B")
    start = date.today()
    lot = LotProduction(
        nom_lot="Single parent", date_debut=start, age_depart_semaines=0,
        effectif_initial=10, duree_semaines=100,
        date_fin_prevue=start + timedelta(days=699), statut="actif",
    )
    db_session.add(lot)
    db_session.flush()
    db_session.add(CycleProduction(
        id_lot=lot.id_lot, id_batiment=building_a.id_batiment,
        nom_cycle="Single parent", date_debut=start, age_depart_semaines=0,
        effectif_initial=10, duree_semaines=100,
        date_fin_prevue=start + timedelta(days=699), statut="actif",
    ))
    db_session.commit()

    db_session.add(CycleProduction(
        id_lot=lot.id_lot, id_batiment=building_b.id_batiment,
        nom_cycle="Single parent", date_debut=start, age_depart_semaines=0,
        effectif_initial=10, duree_semaines=100,
        date_fin_prevue=start + timedelta(days=699), statut="termine",
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

