"""
Tests for syncing production categories into sellable products.
"""

from datetime import date, timedelta

from fastapi import status

from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.produit import Produit
from app.utils.egg_product_sync import build_sellable_egg_product_name


def create_test_batiment(db_session) -> Batiment:
    batiment = Batiment(
        nom="Batiment Sync Test",
        description="Batiment de test pour la production",
        est_actif=True,
    )
    db_session.add(batiment)
    db_session.commit()
    db_session.refresh(batiment)
    cycle = CycleProduction(
        id_batiment=batiment.id_batiment,
        nom_cycle=f"Lot {batiment.nom}",
        date_debut=date.today(),
        age_depart_semaines=40,
        effectif_initial=1000,
        duree_semaines=80,
        date_fin_prevue=date.today() + timedelta(weeks=80),
        statut="actif",
    )
    db_session.add(cycle)
    db_session.commit()
    return batiment


class TestProductionProductSync:
    def test_create_normal_production_creates_client_product(
        self,
        client,
        db_session,
        auth_headers,
    ):
        batiment = create_test_batiment(db_session)

        response = client.post(
            "/api/v1/productions",
            headers=auth_headers,
            json={
                "date_production": str(date.today()),
                "id_batiment": batiment.id_batiment,
                "type_oeuf": "normal",
                "calibre": "moyen",
                "nombre_oeufs": 180,
                "grammage": "62.5",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED

        product_name = build_sellable_egg_product_name("normal", "gros")
        produit = db_session.query(Produit).filter(
            Produit.nom_produit == product_name
        ).first()

        assert produit is not None
        assert produit.est_actif is True
        assert produit.pour_clients is True
        assert produit.pour_fournisseurs is False

    def test_create_production_reuses_existing_product(
        self,
        client,
        db_session,
        auth_headers,
    ):
        batiment = create_test_batiment(db_session)
        payload = {
            "date_production": str(date.today()),
            "id_batiment": batiment.id_batiment,
            "type_oeuf": "double_jaune",
            "calibre": None,
            "nombre_oeufs": 60,
            "grammage": "68.0",
        }

        first_response = client.post(
            "/api/v1/productions",
            headers=auth_headers,
            json=payload,
        )
        assert first_response.status_code == status.HTTP_201_CREATED

        second_payload = {
            **payload,
            "date_production": str(date.today() + timedelta(days=1)),
            "nombre_oeufs": 90,
        }
        second_response = client.post(
            "/api/v1/productions",
            headers=auth_headers,
            json=second_payload,
        )
        assert second_response.status_code == status.HTTP_201_CREATED

        product_name = build_sellable_egg_product_name("double_jaune", None)
        count = db_session.query(Produit).filter(
            Produit.nom_produit == product_name
        ).count()

        assert count == 1

    def test_create_lost_eggs_production_does_not_create_product(
        self,
        client,
        db_session,
        auth_headers,
    ):
        batiment = create_test_batiment(db_session)
        products_before = db_session.query(Produit).count()

        response = client.post(
            "/api/v1/productions",
            headers=auth_headers,
            json={
                "date_production": str(date.today()),
                "id_batiment": batiment.id_batiment,
                "type_oeuf": "perdu",
                "calibre": None,
                "nombre_oeufs": 15,
                "grammage": "0.0",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert db_session.query(Produit).count() == products_before

    def test_update_production_creates_product_for_new_category(
        self,
        client,
        db_session,
        auth_headers,
    ):
        batiment = create_test_batiment(db_session)

        create_response = client.post(
            "/api/v1/productions",
            headers=auth_headers,
            json={
                "date_production": str(date.today()),
                "id_batiment": batiment.id_batiment,
                "type_oeuf": "perdu",
                "calibre": None,
                "nombre_oeufs": 20,
                "grammage": "0.0",
            },
        )
        assert create_response.status_code == status.HTTP_201_CREATED

        production_id = create_response.json()["id_production"]
        update_response = client.put(
            f"/api/v1/productions/{production_id}",
            headers=auth_headers,
            json={
                "type_oeuf": "blanc",
                "grammage": "58.0",
            },
        )

        assert update_response.status_code == status.HTTP_200_OK

        product_name = build_sellable_egg_product_name("blanc", None)
        produit = db_session.query(Produit).filter(
            Produit.nom_produit == product_name
        ).first()

        assert produit is not None
        assert produit.pour_clients is True
