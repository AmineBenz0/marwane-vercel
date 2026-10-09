"""Sold/bought behavior through the real product and transaction APIs."""

from datetime import date

import pytest

from app.models.produit import Produit


@pytest.mark.parametrize("usage,party,opposite", [
    ("vendu", "client", "fournisseur"),
    ("achete", "fournisseur", "client"),
])
def test_usage_controls_products_and_transactions(client, usage, party, opposite):
    product = client.post("/api/v1/produits", json={
        "nom_produit": f"Produit {usage}",
        "usage": usage,
    })
    assert product.status_code == 201, product.text
    data = product.json()
    assert data["usage"] == usage
    assert data["pour_clients"] is (usage == "vendu")
    assert data["pour_fournisseurs"] is (usage == "achete")

    allowed = client.get(f"/api/v1/produits/par-type/{party}").json()
    denied = client.get(f"/api/v1/produits/par-type/{opposite}").json()
    assert data["id_produit"] in [item["id_produit"] for item in allowed]
    assert data["id_produit"] not in [item["id_produit"] for item in denied]

    parties = {}
    for kind in ("client", "fournisseur"):
        response = client.post(f"/api/v1/{kind}s", json={f"nom_{kind}": f"Test {kind}"})
        assert response.status_code == 201, response.text
        parties[kind] = response.json()[f"id_{kind}"]

    payload = {
        "date_transaction": str(date.today()),
        "id_produit": data["id_produit"],
        "quantite": 2,
        "prix_unitaire": "10.00",
    }
    valid = client.post("/api/v1/transactions", json={
        **payload, f"id_{party}": parties[party],
    })
    assert valid.status_code == 201, valid.text
    invalid = client.post("/api/v1/transactions", json={
        **payload, f"id_{opposite}": parties[opposite],
    })
    assert invalid.status_code == 400, invalid.text

    bulk = client.post("/api/v1/transactions/bulk", json=[
        {**payload, f"id_{opposite}": parties[opposite]},
    ])
    assert bulk.status_code == 400, bulk.text

    updated = client.put(
        f"/api/v1/transactions/{valid.json()['id_transaction']}",
        json={f"id_{party}": None, f"id_{opposite}": parties[opposite]},
    )
    assert updated.status_code == 400, updated.text


@pytest.mark.parametrize("product_type,usage", [
    ("matiere_premiere", "achete"),
    ("produit_fini", "vendu"),
    ("service", "achete"),
])
def test_legacy_dual_flags_resolve_to_one_usage(client, db_session, product_type, usage):
    product = Produit(
        nom_produit="Produit historique",
        type_produit=product_type,
        pour_clients=True,
        pour_fournisseurs=True,
    )
    db_session.add(product)
    db_session.commit()
    response = client.get(f"/api/v1/produits/{product.id_produit}")
    assert response.status_code == 200
    data = response.json()
    assert data["usage"] == usage
    assert data["pour_clients"] != data["pour_fournisseurs"]
    sold = client.get("/api/v1/produits/par-type/client").json()
    bought = client.get("/api/v1/produits/par-type/fournisseur").json()
    assert bool(sold) is (usage == "vendu")
    assert bool(bought) is (usage == "achete")


def test_usage_change_updates_filtered_choices(client):
    response = client.post("/api/v1/produits", json={"nom_produit": "Produit", "usage": "achete"})
    product_id = response.json()["id_produit"]
    updated = client.put(f"/api/v1/produits/{product_id}", json={"usage": "vendu"})
    assert updated.status_code == 200
    assert updated.json()["usage"] == "vendu"
    assert updated.json()["pour_fournisseurs"] is False
    assert client.get("/api/v1/produits/par-type/fournisseur").json() == []


@pytest.mark.parametrize("payload", [
    {"usage": "both"},
    {"usage": "vendu", "pour_fournisseurs": True},
    {"pour_clients": True, "pour_fournisseurs": True},
    {"pour_clients": False, "pour_fournisseurs": False},
])
def test_invalid_usage_is_rejected(client, payload):
    response = client.post("/api/v1/produits", json={"nom_produit": "Invalide", **payload})
    assert response.status_code == 422
