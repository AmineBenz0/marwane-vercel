from datetime import date

from fastapi import status

from app.models.batiment import Batiment


def create_batiment(db_session):
    batiment = Batiment(nom="Batiment Cycle Test", est_actif=True)
    db_session.add(batiment)
    db_session.commit()
    db_session.refresh(batiment)
    return batiment


def test_cycle_prevents_duplicate_active_lot(client, db_session, auth_headers):
    batiment = create_batiment(db_session)
    payload = {
        "id_batiment": batiment.id_batiment,
        "nom_cycle": "Lot A",
        "souche": "Hisex",
        "date_debut": str(date.today()),
        "age_depart_semaines": 40,
        "effectif_initial": 1000,
        "duree_semaines": 80,
    }

    response = client.post("/api/v1/cycles-production", json=payload, headers=auth_headers)
    assert response.status_code == status.HTTP_201_CREATED

    duplicate = client.post("/api/v1/cycles-production", json={**payload, "nom_cycle": "Lot B"}, headers=auth_headers)
    assert duplicate.status_code == status.HTTP_400_BAD_REQUEST


def test_production_auto_attaches_active_cycle_and_performance_updates(client, db_session, auth_headers):
    batiment = create_batiment(db_session)
    cycle_response = client.post(
        "/api/v1/cycles-production",
        json={
            "id_batiment": batiment.id_batiment,
            "nom_cycle": "Lot Performance",
            "date_debut": str(date.today()),
            "age_depart_semaines": 40,
            "effectif_initial": 1000,
            "duree_semaines": 80,
        },
        headers=auth_headers,
    )
    assert cycle_response.status_code == status.HTTP_201_CREATED
    cycle_id = cycle_response.json()["id_cycle"]

    production_response = client.post(
        "/api/v1/productions",
        json={
            "date_production": str(date.today()),
            "id_batiment": batiment.id_batiment,
            "type_oeuf": "normal",
            "nombre_oeufs": 900,
            "grammage": "61",
            "mortalite": 2,
            "consommation_aliment_kg": "120",
            "formule": "ponte",
        },
        headers=auth_headers,
    )
    assert production_response.status_code == status.HTTP_201_CREATED
    assert production_response.json()["id_cycle"] == cycle_id

    performance_response = client.get(
        f"/api/v1/productions/performance?id_cycle={cycle_id}",
        headers=auth_headers,
    )
    assert performance_response.status_code == status.HTTP_200_OK
    rows = performance_response.json()["rows"]
    day_row = next(row for row in rows if row["rowType"] == "day")
    assert day_row["effectif_debut"] == 1000
    assert day_row["effectif_fin"] == 998
    assert day_row["mort"] == 2
    assert day_row["ponte_pct"] == "90.00"
