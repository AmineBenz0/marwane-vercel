"""Review the original stock and financial history before restoring a transaction."""

from collections import defaultdict
from datetime import datetime, time, timezone
from decimal import Decimal
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import or_

from app.models.caisse import Caisse
from app.models.client import Client
from app.models.compte_bancaire import MouvementBancaire
from app.models.credit import AffectationCredit
from app.models.fournisseur import Fournisseur
from app.models.inventory import MouvementStock
from app.models.produit import Produit
from app.services.egg_sales import source_balances
from app.services.inventory import is_inventory_tracked, record_movement
from app.utils.business_date import business_date
from app.utils.egg_product_sync import parse_sellable_egg_product_name


def _utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _inventory_plan(db, tx):
    originals = db.query(MouvementStock).filter_by(
        source_type="transaction", source_id=tx.id_transaction,
    ).filter(MouvementStock.type_mouvement.in_(("achat", "vente"))).order_by(
        MouvementStock.id_mouvement_stock.desc(),
    ).all()
    purchase = tx.id_fournisseur is not None
    movement_type = "achat" if purchase else "vente"
    delta = Decimal(tx.quantite if purchase else -tx.quantite)
    movement_date = datetime.combine(tx.date_transaction, time.min, tzinfo=timezone.utc)
    original = originals[0] if originals else None
    if (original is None or original.id_produit != tx.id_produit
            or original.type_mouvement != movement_type or original.quantite_delta != delta
            or _utc(original.date_mouvement) != movement_date
            or (purchase and original.cout_unitaire != tx.prix_unitaire)):
        raise HTTPException(409, "Le mouvement d’origine de cette transaction n’est pas traçable.")

    cancelled_ids = set()
    for row in originals:
        inverse = row.inverse
        if (inverse is None or inverse.id_mouvement_inverse != row.id_mouvement_stock
                or inverse.id_produit != row.id_produit or inverse.quantite_delta != -row.quantite_delta
                or inverse.source_id != tx.id_transaction or inverse.type_mouvement != "reversal"
                or inverse.source_type not in ("transaction", "transaction_reversal")):
            raise HTTPException(409, "Un mouvement de stock d’origine doit être réconcilié.")
        cancelled_ids.update((row.id_mouvement_stock, inverse.id_mouvement_stock))

    timeline = defaultdict(Decimal)
    if not purchase:
        # Closed movement pairs remain in the ledger but are no longer part
        # of the active stock timeline, including pairs for other transactions.
        rows = db.query(MouvementStock).filter_by(id_produit=tx.id_produit).all()
        by_id = {row.id_mouvement_stock: row for row in rows}
        for row in rows:
            pair = by_id.get(row.id_mouvement_inverse)
            if (pair and pair.id_mouvement_inverse == row.id_mouvement_stock
                    and pair.quantite_delta == -row.quantite_delta):
                continue
            timeline[_utc(row.date_mouvement)] += row.quantite_delta
        timeline[movement_date] += delta
        balance = Decimal(0)
        for when, change in sorted(timeline.items()):
            balance += change
            if balance < 0:
                raise HTTPException(409, f"La réactivation rendrait le stock négatif le {when.date().isoformat()}.")
    dependency = (original.id_mouvement_stock, sorted(cancelled_ids), sorted(timeline.items()))
    return original, dependency


def _egg_plan(db, tx, category):
    if tx.id_batiment is None or (tx.est_promesse and not tx.allocation_automatique):
        raise HTTPException(409, "La vente ne dispose pas d’un bâtiment source ou d’une réservation valide.")
    if tx.est_promesse and tx.id_production is not None:
        raise HTTPException(409, "Les réservations de cette ancienne vente doivent être réconciliées.")

    allocations = sorted((row.id_production, row.quantite, row.quantite_livree or 0) for row in tx.allocations)
    if not allocations and tx.id_production is not None:
        allocations = [(tx.id_production, tx.quantite, tx.quantite)]
    quantity = sum(amount for _, amount, _ in allocations)
    if quantity > tx.quantite or (not tx.est_promesse and quantity != tx.quantite):
        raise HTTPException(409, "La répartition d’origine de cette vente d’œufs est incomplète.")

    cutoff = business_date() if tx.est_promesse else tx.date_transaction
    rows, balances = source_balances(db, through_date=cutoff)
    sources = {row.id_production: row for row in rows}
    dependency = []
    for source_id, amount, delivered in allocations:
        source = sources.get(source_id)
        if (source is None or source.id_batiment != tx.id_batiment
                or (source.type_oeuf, source.calibre if source.type_oeuf == "normal" else None) != category):
            raise HTTPException(409, "Une origine d’œufs n’est plus valide pour cette vente.")
        if amount <= 0 or not 0 <= delivered <= amount or balances[source_id] < amount:
            raise HTTPException(409, "Les œufs d’origine ne sont plus disponibles pour cette vente.")
        dependency.append((source_id, amount, delivered, source.date_production, source.id_cycle, balances[source_id]))
    return quantity, dependency


def build_reactivation_preview(db, tx, *, lock_contact=False):
    """Return the review and the original ledger movement, if stock is tracked."""
    if tx is None:
        raise HTTPException(404, "Transaction introuvable.")
    if tx.est_actif:
        raise HTTPException(409, "Cette transaction est déjà active.")
    if tx.quantite_annulee or tx.avoirs_livraison_differee:
        raise HTTPException(409, "Cette livraison a une annulation de quantité ou un avoir. Créez une nouvelle vente.")

    product = db.get(Produit, tx.id_produit)
    if product is None or not product.est_actif:
        raise HTTPException(409, "Le produit n’est plus actif.")
    contact_model = Client if tx.id_client is not None else Fournisseur
    contact_id = tx.id_client if tx.id_client is not None else tx.id_fournisseur
    contact = db.get(contact_model, contact_id, with_for_update=lock_contact)
    if contact is None or not contact.est_actif:
        raise HTTPException(409, "Le contact n’est plus actif.")

    payments = sorted(tx.paiements, key=lambda payment: payment.id_paiement)
    if any(payment.statut != "annule" for payment in payments):
        raise HTTPException(409, "Des règlements sont encore actifs. Réconciliez-les avant la réactivation.")
    payment_ids = [payment.id_paiement for payment in payments]
    cash = db.query(Caisse.id_mouvement).filter(Caisse.statut == "active", or_(
        Caisse.id_transaction == tx.id_transaction, Caisse.id_paiement.in_(payment_ids),
    )).first()
    bank = payment_ids and db.query(MouvementBancaire.id_mouvement).filter(
        MouvementBancaire.statut == "active", MouvementBancaire.id_paiement.in_(payment_ids),
    ).first()
    if cash or bank:
        raise HTTPException(409, "Des mouvements de caisse ou de banque sont encore actifs.")
    if db.query(AffectationCredit.id_affectation).filter(
        AffectationCredit.statut == "active", or_(
            AffectationCredit.id_transaction_source == tx.id_transaction,
            AffectationCredit.id_transaction_cible == tx.id_transaction,
        ),
    ).first():
        raise HTTPException(409, "Une affectation de crédit doit être réconciliée avant la réactivation.")

    preview = {
        "id_transaction": tx.id_transaction,
        "expected_version": tx.row_version,
        "product_name": product.nom_produit,
        "stock_kind": "aucun",
        "stock_effect": "aucun",
        "stock_quantity": 0,
        "pending_quantity": 0,
        "cancelled_payments_count": len(payments),
    }
    original = dependency = None
    category = parse_sellable_egg_product_name(product.nom_produit) if tx.id_client is not None else None
    if tx.est_promesse and not category:
        raise HTTPException(409, "Le produit de cette livraison différée n’est plus un œuf vendable.")
    if category:
        quantity, dependency = _egg_plan(db, tx, category)
        preview.update(stock_kind="oeufs", stock_quantity=quantity,
                       stock_effect="reservation" if tx.est_promesse else "sortie",
                       pending_quantity=tx.quantite - quantity if tx.est_promesse else 0)
    elif is_inventory_tracked(product):
        original, dependency = _inventory_plan(db, tx)
        preview.update(stock_kind="general", stock_quantity=tx.quantite,
                       stock_effect="entree" if tx.id_fournisseur is not None else "sortie")
    elif db.query(MouvementStock.id_mouvement_stock).filter_by(
        source_type="transaction", source_id=tx.id_transaction,
    ).first():
        raise HTTPException(409, "Le produit ne correspond plus au mouvement de stock d’origine.")

    inputs = (preview, tx.id_produit, contact_id, tx.date_transaction, tx.prix_unitaire, dependency,
              [(payment.id_paiement, payment.row_version) for payment in payments])
    preview["dependency_fingerprint"] = sha256(json.dumps(
        inputs, sort_keys=True, separators=(",", ":"), default=str,
    ).encode()).hexdigest()
    return preview, original


def restore_inventory_movement(db, original, actor):
    """Append an exact replacement while leaving both historical entries intact."""
    return record_movement(
        db, id_produit=original.id_produit, quantite_delta=original.quantite_delta,
        cout_unitaire=original.cout_unitaire, type_mouvement=original.type_mouvement,
        source_type=original.source_type, source_id=original.source_id,
        date_mouvement=original.date_mouvement, id_utilisateur=actor.id_utilisateur if actor else None,
        notes="Réactivation de la transaction",
    )
