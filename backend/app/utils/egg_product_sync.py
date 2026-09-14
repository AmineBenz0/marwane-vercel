"""
Helpers to bridge egg production records with sellable products.

Production entries currently track egg output separately from the products
catalog used by transactions. These helpers create or reactivate the matching
product rows so egg categories become selectable in sales transactions.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.production import Production
from app.models.produit import Produit


SELLABLE_TYPE_LABELS = {
    "double_jaune": "Oeufs - Double jaune",
    "double_jaune_demarrage": "Oeufs - Double jaune demarrage",
    "casse": "Oeufs - Casses",
    "blanc": "Oeufs - Blancs",
}

CALIBRE_LABELS = {
    "demarrage": "Demarrage",
    "moyen": "Moyen",
    "gros": "Gros",
}

PRODUCT_NAME_TO_CATEGORY = {
    "oeufs - demarrage": ("normal", "demarrage"),
    "oeufs - moyen": ("normal", "moyen"),
    "oeufs - gros": ("normal", "gros"),
    "oeufs - double jaune": ("double_jaune", None),
    "oeufs - double jaune demarrage": ("double_jaune_demarrage", None),
    "oeufs - casses": ("casse", None),
    "oeufs - blancs": ("blanc", None),
}


def build_sellable_egg_product_name(
    type_oeuf: str,
    calibre: Optional[str] = None,
) -> Optional[str]:
    """
    Build the product name that should represent a production category.

    Returns None for categories that should not become sellable products.
    """
    type_key = (type_oeuf or "").strip().lower()
    calibre_key = (calibre or "").strip().lower() or None

    # Lost eggs should stay in production analytics only.
    if type_key == "perdu":
        return None

    if type_key == "normal":
        if not calibre_key:
            return None
        calibre_label = CALIBRE_LABELS.get(calibre_key, calibre_key.title())
        return f"Oeufs - {calibre_label}"

    return SELLABLE_TYPE_LABELS.get(
        type_key,
        f"Oeufs - {type_key.replace('_', ' ').title()}",
    )


def parse_sellable_egg_product_name(product_name: str) -> Optional[tuple[str, Optional[str]]]:
    """
    Return the production category represented by a sellable egg product.

    The transaction table stores products, while production stock is tracked by
    egg category. This small mapper lets stock reports count egg sales without
    needing extra category columns on products.
    """
    normalized = " ".join((product_name or "").strip().lower().split())
    return PRODUCT_NAME_TO_CATEGORY.get(normalized)


def ensure_sellable_egg_product(
    db: Session,
    type_oeuf: str,
    calibre: Optional[str] = None,
) -> Optional[Produit]:
    """
    Ensure a sellable product exists for a production category.

    The created product is enabled for client transactions only because these
    rows represent farm output, not supplier purchases.
    """
    product_name = build_sellable_egg_product_name(type_oeuf, calibre)
    if not product_name:
        return None

    produit = db.query(Produit).filter(Produit.nom_produit == product_name).first()
    if produit:
        produit.est_actif = True
        produit.pour_clients = True
        produit.type_produit = "produit_fini"
        return produit

    produit = Produit(
        nom_produit=product_name,
        type_produit="produit_fini",
        est_actif=True,
        pour_clients=True,
        pour_fournisseurs=False,
    )
    db.add(produit)
    db.flush()
    return produit


def sync_sellable_egg_products_from_productions(db: Session) -> list[Produit]:
    """
    Backfill products for every existing production category in the database.
    """
    synced_products: list[Produit] = []
    seen_names: set[str] = set()

    categories = db.query(
        Production.type_oeuf,
        Production.calibre,
    ).filter(Production.est_actif.is_(True)).distinct().all()

    for type_oeuf, calibre in categories:
        product_name = build_sellable_egg_product_name(type_oeuf, calibre)
        if not product_name or product_name in seen_names:
            continue

        synced_products.append(
            ensure_sellable_egg_product(db, type_oeuf, calibre)
        )
        seen_names.add(product_name)

    return [product for product in synced_products if product is not None]
