"""Plan and optionally apply the historical general-stock backfill.

The command is intentionally dry-run first. It refuses to write when a
product's historical sales cannot be explained by its historical purchases,
because silently inventing an opening balance would compromise costing.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, time, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy.exc import SQLAlchemyError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.database import SessionLocal
from app.models.inventory import MouvementStock
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.services.inventory import is_inventory_tracked, record_movement


def _decimal(value) -> Decimal:
    return Decimal(str(value or 0))


def _transaction_timestamp(transaction: Transaction) -> datetime:
    return datetime.combine(
        transaction.date_transaction,
        time.min,
        tzinfo=timezone.utc,
    )


def build_backfill_plan(db) -> dict:
    """Build a deterministic, write-free plan from active legacy data."""
    products = db.query(Produit).order_by(Produit.id_produit.asc()).all()
    plan_items = []

    for product in products:
        if not is_inventory_tracked(product):
            continue

        existing_count = db.query(MouvementStock.id_mouvement_stock).filter(
            MouvementStock.id_produit == product.id_produit,
        ).count()
        transactions = db.query(Transaction).filter(
            Transaction.id_produit == product.id_produit,
            Transaction.est_actif.is_(True),
        ).order_by(
            Transaction.date_transaction.asc(),
            Transaction.id_transaction.asc(),
        ).all()

        item = {
            "id_produit": product.id_produit,
            "nom_produit": product.nom_produit,
            "statut": "existing_ledger" if existing_count else "no_transactions",
            "transactions": len(transactions),
            "mouvements": [],
            "issues": [],
            "quantite_finale": Decimal("0"),
            "cout_unitaire_moyen": Decimal("0"),
        }
        if existing_count or not transactions:
            plan_items.append(item)
            continue

        available = Decimal("0")
        total_cost = Decimal("0")
        movements = []

        for transaction in transactions:
            quantity = _decimal(transaction.quantite)
            unit_price = _decimal(transaction.prix_unitaire)
            if transaction.id_fournisseur is not None:
                available += quantity
                total_cost += quantity * unit_price
                movements.append({
                    "transaction_id": transaction.id_transaction,
                    "delta": quantity,
                    "cost": unit_price,
                    "date": _transaction_timestamp(transaction),
                    "type": "backfill_achat",
                })
                continue

            if transaction.id_client is not None:
                if available < quantity:
                    item["issues"].append({
                        "code": "INSUFFICIENT_HISTORICAL_STOCK",
                        "transaction_id": transaction.id_transaction,
                        "message": (
                            f"Vente historique de {quantity} avec seulement "
                            f"{available} unité(s) expliquée(s) par les achats précédents."
                        ),
                    })
                    continue

                average_cost = total_cost / available if available else Decimal("0")
                movements.append({
                    "transaction_id": transaction.id_transaction,
                    "delta": -quantity,
                    "cost": average_cost,
                    "date": _transaction_timestamp(transaction),
                    "type": "backfill_vente",
                })
                available -= quantity
                total_cost -= quantity * average_cost
                continue

            item["issues"].append({
                "code": "INVALID_TRANSACTION_SOURCE",
                "transaction_id": transaction.id_transaction,
                "message": "La transaction historique n'a ni client ni fournisseur.",
            })

        if item["issues"]:
            item["statut"] = "bloque"
        else:
            item["statut"] = "pret"
            item["mouvements"] = movements
        item["quantite_finale"] = available
        item["cout_unitaire_moyen"] = total_cost / available if available else Decimal("0")
        plan_items.append(item)

    return {"items": plan_items}


def _json_default(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Unsupported value: {type(value).__name__}")


def _summary(plan: dict) -> dict:
    items = plan["items"]
    ready = [item for item in items if item["statut"] == "pret"]
    blocked = [item for item in items if item["statut"] == "bloque"]
    return {
        "products_considered": len(items),
        "products_ready": len(ready),
        "products_blocked": len(blocked),
        "movements_to_create": sum(len(item["mouvements"]) for item in ready),
        "blocking_issues": sum(len(item["issues"]) for item in blocked),
        "items": items,
    }


def apply_backfill(db, plan: dict) -> int:
    """Apply a clean plan atomically and return the number of inserted rows."""
    summary = _summary(plan)
    if summary["products_blocked"]:
        raise ValueError("Backfill refusé: le plan contient des déficits historiques.")

    inserted = 0
    for item in plan["items"]:
        if item["statut"] != "pret":
            continue
        for movement in item["mouvements"]:
            before = db.query(MouvementStock.id_mouvement_stock).filter(
                MouvementStock.cle_idempotence == f"legacy-backfill-{movement['transaction_id']}",
            ).first()
            if before:
                continue
            record_movement(
                db,
                id_produit=item["id_produit"],
                quantite_delta=movement["delta"],
                cout_unitaire=movement["cost"],
                type_mouvement=movement["type"],
                source_type="legacy_backfill",
                source_id=movement["transaction_id"],
                cle_idempotence=f"legacy-backfill-{movement['transaction_id']}",
                notes="Backfill historique validé par le plan de migration.",
                date_mouvement=movement["date"],
            )
            inserted += 1
    db.commit()
    return inserted


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Appliquer le plan après validation")
    parser.add_argument("--confirm", action="store_true", help="Confirmation explicite requise avec --apply")
    parser.add_argument("--allow-production", action="store_true", help="Autoriser une exécution en production contrôlée")
    args = parser.parse_args(argv)

    if args.apply and not args.confirm:
        print(json.dumps({"ok": False, "error": "--apply requires --confirm"}, ensure_ascii=False))
        return 2
    if args.apply and settings.ENVIRONMENT.lower() == "production" and not args.allow_production:
        print(json.dumps({"ok": False, "error": "Production requires --allow-production"}, ensure_ascii=False))
        return 2

    db = SessionLocal()
    try:
        plan = build_backfill_plan(db)
        report = _summary(plan)
        report["ok"] = report["products_blocked"] == 0
        report["mode"] = "apply" if args.apply else "dry_run"
        if args.apply:
            if not report["ok"]:
                print(json.dumps(report, ensure_ascii=False, default=_json_default))
                return 2
            report["inserted"] = apply_backfill(db, plan)
        print(json.dumps(report, ensure_ascii=False, default=_json_default))
        return 0
    except (SQLAlchemyError, ValueError) as exc:
        db.rollback()
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 3
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
