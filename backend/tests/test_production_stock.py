from datetime import date, timedelta

from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
import pytest

from app.models.batiment import Batiment
from app.models.client import Client
from app.models.cycle_production import CycleProduction
from app.models.produit import Produit
from app.models.production import Production
from app.models.transaction import Transaction
from app.utils.dependencies import get_current_active_user
from app.utils.egg_product_sync import build_sellable_egg_product_name
from app.main import app


def test_daily_stock_counts_production_sales_and_losses(client, db_session, auth_headers, test_user):
    batiment = Batiment(nom="Batiment Stock Test", est_actif=True)
    client_row = Client(
        nom_client="Client Stock Test",
        est_actif=True,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add_all([batiment, client_row])
    db_session.commit()
    db_session.refresh(batiment)
    db_session.refresh(client_row)
    cycle = CycleProduction(
        id_batiment=batiment.id_batiment,
        nom_cycle="Lot Stock Test",
        date_debut=date.today(),
        age_depart_semaines=40,
        effectif_initial=1000,
        duree_semaines=80,
        date_fin_prevue=date.today() + timedelta(weeks=80),
        statut="actif",
    )
    db_session.add(cycle)
    db_session.commit()

    production_payload = {
        "date_production": str(date.today()),
        "id_batiment": batiment.id_batiment,
        "type_oeuf": "normal",
        "calibre": "moyen",
        "nombre_oeufs": 100,
        "grammage": "62.0",
        "oeufs_perdus": 5,
    }
    response = client.post("/api/v1/productions", json=production_payload, headers=auth_headers)
    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["type_oeuf"] == "normal"
    daily_entries = db_session.query(Production).filter(
        Production.id_batiment == batiment.id_batiment,
        Production.date_production == date.today(),
    ).all()
    assert {(entry.type_oeuf, entry.nombre_oeufs) for entry in daily_entries} == {
        ("normal", 100),
        ("perdu", 5),
    }

    product_name = build_sellable_egg_product_name("normal", "gros")
    produit = db_session.query(Produit).filter(Produit.nom_produit == product_name).first()
    assert produit is not None

    sale_payload = {
        "date_transaction": str(date.today()),
        "id_client": client_row.id_client,
        "id_produit": produit.id_produit,
        "id_batiment": batiment.id_batiment,
        "quantite": 40,
        "prix_unitaire": "1.50",
    }
    response = client.post("/api/v1/transactions", json=sale_payload, headers=auth_headers)
    assert response.status_code == status.HTTP_201_CREATED

    response = client.get("/api/v1/productions/stock/daily", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    stock_row = next(item for item in data["batiments"] if item["id_batiment"] == batiment.id_batiment)
    assert stock_row["produced_eggs"] == 100
    assert stock_row["sold_eggs"] == 40
    assert stock_row["lost_eggs"] == 5
    assert stock_row["available_eggs"] == 60


def test_daily_production_and_losses_roll_back_together_on_database_failure(
    client,
    db_session,
    auth_headers,
    monkeypatch,
):
    batiment = Batiment(nom="Batiment Atomic Test", est_actif=True)
    db_session.add(batiment)
    db_session.commit()
    db_session.refresh(batiment)
    cycle = CycleProduction(
        id_batiment=batiment.id_batiment,
        nom_cycle="Lot Atomic Test",
        date_debut=date.today(),
        age_depart_semaines=40,
        effectif_initial=1000,
        duree_semaines=80,
        date_fin_prevue=date.today() + timedelta(weeks=80),
        statut="actif",
    )
    db_session.add(cycle)
    db_session.commit()

    def fail_after_flush():
        db_session.flush()
        raise IntegrityError("simulated commit failure", {}, RuntimeError("test failure"))

    monkeypatch.setattr(db_session, "commit", fail_after_flush)
    payload = {
        "date_production": str(date.today()),
        "id_batiment": batiment.id_batiment,
        "type_oeuf": "normal",
        "nombre_oeufs": 100,
        "grammage": "62.0",
        "oeufs_perdus": 5,
    }
    test_client = TestClient(app, raise_server_exceptions=False)
    response = test_client.post(
        "/api/v1/productions",
        json=payload,
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.json()["detail"] == "La production et les pertes n'ont pas été enregistrées."
    assert db_session.query(Production).filter(
        Production.id_batiment == batiment.id_batiment,
        Production.date_production == date.today(),
    ).count() == 0
    assert db_session.query(Produit).filter(
        Produit.nom_produit == build_sellable_egg_product_name("normal", "gros"),
    ).count() == 0


@pytest.mark.parametrize(
    ("egg_type", "loss_count"),
    [("normal", -1), ("perdu", 2)],
)
def test_invalid_daily_loss_payload_is_rejected_without_writes(
    client,
    db_session,
    auth_headers,
    egg_type,
    loss_count,
):
    response = client.post(
        "/api/v1/productions",
        json={
            "date_production": str(date.today()),
            "id_batiment": 1,
            "type_oeuf": egg_type,
            "nombre_oeufs": 10,
            "grammage": "55.0",
            "oeufs_perdus": loss_count,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert db_session.query(Production).count() == 0


def test_daily_stock_and_egg_sales_work_without_a_lot(
    client,
    db_session,
    auth_headers,
    test_user,
):
    batiment = Batiment(nom="Batiment Sans Lot", est_actif=True)
    client_row = Client(
        nom_client="Client Sans Lot",
        est_actif=True,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add_all([batiment, client_row])
    db_session.commit()
    db_session.refresh(batiment)
    db_session.refresh(client_row)

    production_payload = {
        "date_production": str(date.today()),
        "id_batiment": batiment.id_batiment,
        "type_oeuf": "normal",
        "nombre_oeufs": 100,
        "grammage": "62.0",
    }
    production_response = client.post(
        "/api/v1/productions",
        json=production_payload,
        headers=auth_headers,
    )
    assert production_response.status_code == status.HTTP_201_CREATED, production_response.text
    assert production_response.json()["id_cycle"] is None

    loss_response = client.post(
        "/api/v1/productions",
        json={
            **production_payload,
            "type_oeuf": "perdu",
            "nombre_oeufs": 5,
            "grammage": "0",
        },
        headers=auth_headers,
    )
    assert loss_response.status_code == status.HTTP_201_CREATED, loss_response.text
    assert loss_response.json()["id_cycle"] is None

    product_name = build_sellable_egg_product_name("normal", "gros")
    produit = db_session.query(Produit).filter(Produit.nom_produit == product_name).first()
    assert produit is not None

    sale_response = client.post(
        "/api/v1/transactions",
        json={
            "date_transaction": str(date.today()),
            "id_client": client_row.id_client,
            "id_produit": produit.id_produit,
            "id_batiment": batiment.id_batiment,
            "quantite": 40,
            "prix_unitaire": "1.50",
        },
        headers=auth_headers,
    )
    assert sale_response.status_code == status.HTTP_201_CREATED, sale_response.text
    assert sale_response.json()["id_cycle"] is None

    stock_response = client.get("/api/v1/productions/stock/daily", headers=auth_headers)
    assert stock_response.status_code == status.HTTP_200_OK, stock_response.text
    stock_row = next(
        item for item in stock_response.json()["batiments"]
        if item["id_batiment"] == batiment.id_batiment
    )
    assert stock_row["produced_eggs"] == 100
    assert stock_row["sold_eggs"] == 40
    assert stock_row["lost_eggs"] == 5
    assert stock_row["available_eggs"] == 60


def test_lotless_production_can_be_updated_without_being_attached(
    client,
    db_session,
    auth_headers,
):
    batiment = Batiment(nom="Batiment Modification Sans Lot", est_actif=True)
    db_session.add(batiment)
    db_session.commit()
    db_session.refresh(batiment)

    create_response = client.post(
        "/api/v1/productions",
        json={
            "date_production": str(date.today()),
            "id_batiment": batiment.id_batiment,
            "type_oeuf": "normal",
            "nombre_oeufs": 60,
            "grammage": "55",
        },
        headers=auth_headers,
    )
    assert create_response.status_code == status.HTTP_201_CREATED, create_response.text
    production_id = create_response.json()["id_production"]

    update_response = client.put(
        f"/api/v1/productions/{production_id}",
        json={"nombre_oeufs": 90, "grammage": "62"},
        headers=auth_headers,
    )
    assert update_response.status_code == status.HTTP_200_OK, update_response.text
    assert update_response.json()["nombre_oeufs"] == 90
    assert update_response.json()["id_cycle"] is None


def test_production_delete_is_audited_and_removed_from_active_stock(
    client,
    db_session,
    auth_headers,
    test_user,
):
    batiment = Batiment(nom="Batiment Production Archive", est_actif=True)
    db_session.add(batiment)
    db_session.commit()
    db_session.refresh(batiment)
    cycle = CycleProduction(
        id_batiment=batiment.id_batiment,
        nom_cycle="Lot Production Archive",
        date_debut=date.today(),
        age_depart_semaines=40,
        effectif_initial=1000,
        duree_semaines=80,
        date_fin_prevue=date.today() + timedelta(weeks=80),
        statut="actif",
    )
    db_session.add(cycle)
    db_session.commit()

    response = client.post(
        "/api/v1/productions",
        json={
            "date_production": str(date.today()),
            "id_batiment": batiment.id_batiment,
            "type_oeuf": "normal",
            "calibre": "moyen",
            "nombre_oeufs": 100,
            "grammage": "55.0",
        },
        headers=auth_headers,
    )
    assert response.status_code == status.HTTP_201_CREATED
    production_id = response.json()["id_production"]

    app.dependency_overrides[get_current_active_user] = lambda: test_user

    response = client.delete(
        f"/api/v1/productions/{production_id}",
        params={"raison": "Saisie en double"},
        headers=auth_headers,
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT

    archived = db_session.query(Production).filter(
        Production.id_production == production_id,
    ).one()
    assert archived.est_actif is False
    assert archived.motif_annulation == "Saisie en double"
    assert archived.id_utilisateur_annulation == test_user.id_utilisateur

    response = client.get(
        "/api/v1/productions/stock/daily",
        headers=auth_headers,
    )
    assert response.status_code == status.HTTP_200_OK
    stock_row = next(
        item for item in response.json()["batiments"]
        if item["id_batiment"] == batiment.id_batiment
    )
    assert stock_row["produced_eggs"] == 0

    response = client.get(
        f"/api/v1/productions/{production_id}",
        headers=auth_headers,
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_cumulative_stock_carries_history_and_deducts_only_sellable_sales(
    client, db_session, auth_headers,
):
    today = date.today()
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)
    first = Batiment(nom="Stock A", est_actif=True)
    second = Batiment(nom="Stock B", est_actif=True)
    archived = Batiment(nom="Stock archive", est_actif=False)
    buyer = Client(nom_client="Stock buyer", est_actif=True)
    normal = Produit(nom_produit="Oeufs - Gros", est_actif=True)
    double = Produit(nom_produit="Oeufs - Double Jaune", est_actif=True)
    broken = Produit(nom_produit="Oeufs - Casses", est_actif=True)
    db_session.add_all([first, second, archived, buyer, normal, double, broken])
    db_session.flush()

    def production(building, day, quantity, egg_type="normal", active=True):
        return Production(
            id_batiment=building.id_batiment, date_production=day,
            type_oeuf=egg_type, calibre="gros" if egg_type == "normal" else None,
            nombre_oeufs=quantity, grammage=62,
            nombre_cartons=Production.calculer_cartons(quantity, egg_type),
            est_actif=active,
        )

    def sale(building, day, quantity, product=normal, active=True):
        return Transaction(
            id_batiment=building.id_batiment if building else None,
            date_transaction=day, id_produit=product.id_produit,
            id_client=buyer.id_client, quantite=quantity,
            prix_unitaire=1, montant_total=quantity, est_actif=active,
        )

    db_session.add_all([
        production(first, yesterday, 100),
        production(first, today, 50),
        production(first, yesterday, 20, "double_jaune"),
        production(first, today, 5, "casse"),
        production(first, yesterday, 3, "perdu"),
        production(second, yesterday, 80),
        production(archived, yesterday, 10),
        production(first, tomorrow, 999),
        production(first, yesterday, 999, active=False),
        sale(first, yesterday, 30),
        sale(first, today, 10),
        sale(first, yesterday, 5, double),
        sale(second, today, 20),
        sale(None, today, 7),
        sale(first, tomorrow, 999),
        sale(first, yesterday, 999, active=False),
        sale(first, today, 2, broken),
    ])
    db_session.commit()

    response = client.get("/api/v1/productions/stock", headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["date"] == str(today)
    assert data["totals"]["produced_eggs"] == 260
    assert data["totals"]["sold_eggs"] == 72
    assert data["totals"]["lost_eggs"] == 8
    assert data["totals"]["available_eggs"] == 188
    assert data["totals"]["unassigned_sold_eggs"] == 7
    buildings = {row["id_batiment"]: row for row in data["batiments"]}
    assert buildings[first.id_batiment]["available_eggs"] == 125
    assert buildings[second.id_batiment]["available_eggs"] == 60
    assert buildings[archived.id_batiment]["available_eggs"] == 10
    assert buildings[archived.id_batiment]["est_actif"] is False
    categories = {row["type_oeuf"]: row for row in data["categories"]}
    assert categories["normal"]["available_eggs"] == 173
    assert categories["double_jaune"]["available_eggs"] == 15
    assert categories["casse"]["lost_eggs"] == 8
    assert categories["casse"]["available_eggs"] == 0
    assert sum(row["available_eggs"] for row in data["categories"]) == 188

    historical = client.get(
        "/api/v1/productions/stock", params={"date_stock": str(yesterday)},
        headers=auth_headers,
    ).json()
    assert historical["totals"]["available_eggs"] == 175
    assert historical["totals"]["lost_eggs"] == 3

    daily = client.get("/api/v1/productions/stock/daily", headers=auth_headers).json()
    assert daily["totals"]["produced_eggs"] == 50
    assert daily["totals"]["available_eggs"] == 13
    assert daily["totals"]["lost_eggs"] == 5
    second_daily = next(row for row in daily["batiments"] if row["id_batiment"] == second.id_batiment)
    assert second_daily["entries_count"] == 0
    assert second_daily["available_eggs"] == -20
