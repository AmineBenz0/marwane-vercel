"""
Backfill sellable egg products from existing production records.

Usage:
    python sync_egg_products.py
"""

import sys

from app.database import SessionLocal
from app.utils.egg_product_sync import sync_sellable_egg_products_from_productions


def main() -> int:
    db = SessionLocal()
    try:
        products = sync_sellable_egg_products_from_productions(db)
        db.commit()

        if not products:
            print("No sellable egg products needed to be synced.")
            return 0

        print(f"Synced {len(products)} sellable egg product(s):")
        for product in products:
            print(f"- {product.nom_produit}")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"Error while syncing egg products: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
