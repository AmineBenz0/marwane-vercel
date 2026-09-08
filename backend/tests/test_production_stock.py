from datetime import date, timedelta

from fastapi import status

from app.models.batiment import Batiment
from app.models.client import Client
from app.models.cycle_production import CycleProduction
from app.models.produit import Produit
from app.models.production import Production
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
    }
    response = client.post("/api/v1/productions", json=production_payload, headers=auth_headers)
    assert response.status_code == status.HTTP_201_CREATED

    loss_payload = {
        **production_payload,
        "type_oeuf": "perdu",
        "calibre": None,
        "nombre_oeufs": 5,
        "grammage": "0",
    }
    response = client.post("/api/v1/productions", json=loss_payload, headers=auth_headers)
    assert response.status_code == status.HTTP_201_CREATED

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
    assert stock_row["available_eggs"] == 55


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
