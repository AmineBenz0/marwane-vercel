from datetime import date, timedelta

from fastapi import status

from app.models.batiment import Batiment
from app.models.client import Client
from app.models.cycle_production import CycleProduction
from app.models.produit import Produit
from app.utils.egg_product_sync import build_sellable_egg_product_name


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
