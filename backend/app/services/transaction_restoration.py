"""Phase 6E-A: read-only review of a withdrawn transaction before restoration.

Canceled payments and historical movements are never reinstated here.
The legacy stock writer remains the sole append-only stock writer on apply.
"""
from datetime import datetime, time, timezone
from decimal import Decimal
from hashlib import sha256
import json

from fastapi import HTTPException

from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.inventory import MouvementStock
from app.models.paiement import Paiement
from app.models.produit import Produit
from app.services.egg_sales import source_balances
from app.services.inventory import get_stock_quantity, is_inventory_tracked
from app.services.stock_corrections import stock_dependencies
from app.utils.business_date import business_date
from app.utils.egg_product_sync import parse_sellable_egg_product_name


def _utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _check_general_stock(db, tx, product):
    if tx.id_fournisseur is not None:
        # Restoring a purchase adds stock. The ledger writer will repeat the
        # checks while holding the product lock.
        return
    quantity = Decimal(str(tx.quantite))
    movements = db.query(MouvementStock).filter(
        MouvementStock.id_produit == product.id_produit,
    ).all()
    if not movements:
        # Legacy no-ledger sales had no attributable stock effect. Do not
        # invent that provenance during restoration.
        raise HTTPException(409, "Le stock de cette ancienne vente n'est pas traçable. Créez une vente corrigée.")
    if get_stock_quantity(db, product.id_produit) < quantity:
        raise HTTPException(409, "Le stock disponible ne suffit plus pour réactiver cette vente.")
    timeline = {}
    for row in movements:
        when = _utc(row.date_mouvement)
        timeline[when] = timeline.get(when, Decimal(0)) + Decimal(str(row.quantite_delta))
    when = datetime.combine(tx.date_transaction, time.min, tzinfo=timezone.utc)
    timeline[when] = timeline.get(when, Decimal(0)) - quantity
    running = Decimal(0)
    for movement_date, delta in sorted(timeline.items()):
        running += delta
        if running < 0:
            raise HTTPException(409, (
                f"La réactivation rendrait le stock négatif le {movement_date.date().isoformat()}. "
                "Corrigez les mouvements dépendants ou créez une nouvelle vente."
            ))


def _check_egg_sources(db, tx, product):
    category = parse_sellable_egg_product_name(product.nom_produit)
    if tx.est_promesse and not tx.allocation_automatique:
        raise HTTPException(409, "Cette livraison différée ne dispose pas d'une réservation valide.")
    cutoff = business_date()
    rows, remaining = source_balances(db, through_date=cutoff)
    available_sources = {p.id_production: p for p in rows}
    if not tx.allocations and not tx.est_promesse and tx.id_production is None:
        raise HTTPException(409, "L'origine de cette ancienne vente est inconnue. Créez une vente corrigée.")
    allocations = ([(a.id_production, a.quantite) for a in tx.allocations] if tx.allocations
                   else [(tx.id_production, tx.quantite)] if tx.id_production else [])
    for source_id, count in allocations:
        source = available_sources.get(source_id)
        if (not source or not source.est_actif or source.type_oeuf in {"casse", "perdu"}
                or (source.type_oeuf, source.calibre) != category
                or source.id_batiment != tx.id_batiment
                or (not tx.est_promesse and source.date_production > tx.date_transaction)):
            raise HTTPException(409, "Une origine d'œufs n'est plus valide. Créez une vente corrigée.")
        if remaining.get(source_id, 0) < count:
            raise HTTPException(409, "Les œufs de cette vente sont déjà réservés ou vendus. Créez une nouvelle vente.")
    # Deferred-sale reservation priority is also enforced by the existing
    # transaction reactivation and allocation writers at commit time.


def build_reactivation_preview(db, tx):
    """Build a read-only dependency-bound plan; no financial effects are restored."""
    if tx is None:
        raise HTTPException(404, "Transaction introuvable.")
    if tx.est_actif:
        raise HTTPException(409, "Cette transaction est déjà active.")
    product = db.get(Produit, tx.id_produit)
    if product is None or not product.est_actif:
        raise HTTPException(409, "Le produit n'est plus actif. Créez une transaction corrigée.")
    if tx.id_client is not None:
        contact = db.get(Client, tx.id_client)
    else:
        contact = db.get(Fournisseur, tx.id_fournisseur)
    if contact is None or not contact.est_actif:
        raise HTTPException(409, "Le contact n'est plus actif. Corrigez la transaction avant restauration.")
    payments = db.query(Paiement).filter(Paiement.id_transaction == tx.id_transaction).order_by(
        Paiement.id_paiement,
    ).all()
    if any(p.statut != "annule" for p in payments):
        raise HTTPException(409, "Des règlements sont encore actifs. Réconciliez-les avant la réactivation.")

    egg_category = parse_sellable_egg_product_name(product.nom_produit) if tx.id_client else None
    stock_kind = "oeufs" if egg_category else "general" if is_inventory_tracked(product) else "aucun"
    stock_effect = "aucun" if stock_kind == "aucun" else "entree" if tx.id_fournisseur else "sortie"
    if stock_kind == "oeufs":
        _check_egg_sources(db, tx, product)
    elif stock_kind == "general":
        _check_general_stock(db, tx, product)

    # Include every stock writer's dependency, not just the withdrawn row:
    # another sale, reserve, transformation or stock adjustment invalidates
    # a preview even when the target row version has not changed.
    fingerprint_input = {
        "stock": stock_dependencies(db),
        "payments": [(p.id_paiement, p.row_version, p.statut, p.nature, p.id_lc)
                     for p in payments],
    }
    fingerprint = sha256(json.dumps(
        fingerprint_input, sort_keys=True, separators=(",", ":"),
        ensure_ascii=False, default=str,
    ).encode("utf-8")).hexdigest()
    return {
        "id_transaction": tx.id_transaction,
        "expected_version": tx.row_version,
        "dependency_fingerprint": fingerprint,
        "nature": "vente" if tx.id_client is not None else "achat",
        "product_name": product.nom_produit,
        "stock_kind": stock_kind,
        "stock_effect": stock_effect,
        "stock_quantity": tx.quantite if stock_kind != "aucun" else 0,
        "cancelled_payments_count": len(payments),
        "restore_cancelled_payments": False,
    }
