"""Phase 6E-B: atomic, linked sale ↔ purchase conversion.

Keep the original transaction and payment identities immutable in history.
Convert by retiring the original and creating a new, unpaid opposite-side
transaction, under a frozen preview and one PostgreSQL transaction.
"""
from datetime import datetime, time, timezone
from decimal import Decimal
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.client import Client
from app.models.correction_operation import CorrectionOperation
from app.models.financial_correction import CorrectionFinanciere
from app.models.fournisseur import Fournisseur
from app.models.inventory import MouvementStock
from app.models.paiement import Paiement
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.services.correction_contract import replay_result
from app.services.financial_ledger import void_payment
from app.services.inventory import is_inventory_tracked, record_movement, record_transaction_movement
from app.services.ledger import record_correction
from app.services.settlement_state import json_value, row_snapshot, settlement_state
from app.services.stock_corrections import lock_stock_scope, stock_dependencies
from app.utils.egg_product_sync import parse_sellable_egg_product_name


def _utc(value):
    return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None
            else value.astimezone(timezone.utc))


def conversion_link(db, transaction_id):
    """Return the durable immutable history link, if the record was converted."""
    item = db.query(CorrectionFinanciere).filter(
        CorrectionFinanciere.type_entite == "transaction",
        CorrectionFinanciere.id_entite == transaction_id,
        CorrectionFinanciere.action.in_(("conversion_origine", "conversion_cible")),
    ).order_by(CorrectionFinanciere.id_correction.desc()).first()
    if item is None or item.details is None:
        return {}
    try:
        data = json.loads(item.details)
    except (TypeError, ValueError):
        raise HTTPException(409, "L'historique de conversion doit être réconcilié.")
    if item.action == "conversion_origine":
        return {"id_transaction_remplacement": data.get("id_transaction_remplacement")}
    return {"id_transaction_origine": data.get("id_transaction_origine")}


def _stock_plan(db, original, source_product, target_product, command):
    """Simulate removing the original business-date effect and adding its replacement."""
    old_tracked = is_inventory_tracked(source_product)
    target_tracked = is_inventory_tracked(target_product)
    old_rows = db.query(MouvementStock).filter(
        MouvementStock.source_type == "transaction",
        MouvementStock.source_id == original.id_transaction,
        MouvementStock.id_mouvement_inverse.is_(None),
    ).all()
    old = old_rows[0] if len(old_rows) == 1 else None
    if old_tracked:
        sign = -1 if original.id_client is not None else 1
        expected_date = datetime.combine(original.date_transaction, time.min, tzinfo=timezone.utc)
        if (len(old_rows) != 1 or old is None or old.id_produit != original.id_produit
                or Decimal(str(old.quantite_delta)) != sign * original.quantite
                or old.type_mouvement != ("vente" if sign < 0 else "achat")
                or _utc(old.date_mouvement) != expected_date):
            raise HTTPException(409, "Réconciliez le mouvement de stock original avant la conversion.")
    elif old_rows:
        raise HTTPException(409, "Le stock original comporte un mouvement inattendu.")

    new_delta = Decimal(command.quantite) * (-1 if original.id_fournisseur is not None else 1)
    changes = {}
    day = datetime.combine(original.date_transaction, time.min, tzinfo=timezone.utc)
    if old is not None:
        changes[(old.id_produit, _utc(old.date_mouvement))] = -Decimal(str(old.quantite_delta))
    if target_tracked:
        key = (target_product.id_produit, day)
        changes[key] = changes.get(key, Decimal(0)) + new_delta

    resulting = {}
    for product_id in sorted({key[0] for key in changes}):
        ledger = db.query(MouvementStock).filter(MouvementStock.id_produit == product_id).all()
        if target_tracked and product_id == target_product.id_produit and new_delta < 0 and not ledger:
            raise HTTPException(409, "Le stock de la vente cible n'est pas traçable.")
        timeline = {}
        for movement in ledger:
            when = _utc(movement.date_mouvement)
            timeline[when] = timeline.get(when, Decimal(0)) + Decimal(str(movement.quantite_delta))
        for (pid, when), delta in changes.items():
            if pid == product_id:
                timeline[when] = timeline.get(when, Decimal(0)) + delta
        running = Decimal(0)
        for when, delta in sorted(timeline.items()):
            running += delta
            if running < 0:
                raise HTTPException(409, (
                    f"La conversion rendrait le stock négatif le {when.date().isoformat()}. "
                    "Corrigez les opérations dépendantes avant de continuer."
                ))
        resulting[str(product_id)] = format(running, "f")
    return old, {
        "origine": "aucun" if not old_tracked else "annulation_achat" if original.id_fournisseur else "annulation_vente",
        "cible": "aucun" if not target_tracked else "entree" if new_delta > 0 else "sortie",
        "quantite_cible": command.quantite if target_tracked else 0,
        "soldes_finaux": resulting,
    }


def _plan(db, original, command, *, lock=False):
    if original is None:
        raise HTTPException(404, "Transaction introuvable.")
    if not original.est_actif:
        raise HTTPException(409, "Seule une transaction active peut être convertie.")
    if conversion_link(db, original.id_transaction).get("id_transaction_remplacement"):
        raise HTTPException(409, "Cette transaction a déjà été convertie.")
    source_product = db.get(Produit, original.id_produit)
    if source_product is None:
        raise HTTPException(409, "Le produit original est introuvable.")
    if (original.est_promesse or original.allocations or original.id_production is not None
            or parse_sellable_egg_product_name(source_product.nom_produit)):
        raise HTTPException(409, (
            "Les ventes d'œufs et livraisons différées exigent une correction d'origine "
            "et de réservation spécifique. Cette conversion ne les modifie pas."
        ))

    target_side = "achat" if original.id_client is not None else "vente"
    target_contact_model = Fournisseur if target_side == "achat" else Client
    contact_key = "id_fournisseur" if target_side == "achat" else "id_client"
    target_contact = db.get(target_contact_model, command.id_contact_cible)
    if target_contact is None or not target_contact.est_actif:
        raise HTTPException(409, "Choisissez un contact actif pour la nouvelle transaction.")
    target_product = db.get(Produit, command.id_produit_cible)
    if (target_product is None or not target_product.est_actif
            or target_product.usage != ("achete" if target_side == "achat" else "vendu")
            or parse_sellable_egg_product_name(target_product.nom_produit)):
        raise HTTPException(409, "Choisissez un produit actif compatible, hors œufs et livraisons différées.")

    payments = db.query(Paiement).filter(
        Paiement.id_transaction == original.id_transaction,
    ).order_by(Paiement.id_paiement).populate_existing()
    payments = (payments.with_for_update() if lock else payments).all()
    for payment in payments:
        if (payment.type_paiement not in {"cash", "virement"}
                or payment.nature not in (None, "paiement")
                or payment.id_lc is not None or payment.role_lc is not None
                or payment.statut not in {"valide", "annule"}):
            raise HTTPException(409, (
                "Cette transaction contient un chèque, une LC, une affectation ou un autre "
                "règlement lié. Traitez ce règlement avant toute conversion."
            ))
    finances = settlement_state(db, [original], lock=lock)
    # Read-only reconciliation includes the active cash/bank links.
    active = [p for p in payments if p.statut == "valide"]
    old_movement, stock = _stock_plan(db, original, source_product, target_product, command)
    total = (Decimal(command.quantite) * command.prix_unitaire).quantize(Decimal("0.01"))

    state = {
        "stock": stock_dependencies(db),
        "financial": finances,
        "contact": row_snapshot(target_contact),
        "produit_cible": row_snapshot(target_product),
        "produit_origine": row_snapshot(source_product),
    }
    expected = command.model_dump(mode="json", exclude={"operation_id", "dependency_fingerprint",
        "annuler_paiements_existants"})
    digest = sha256(json.dumps({"target": expected, "state": state}, sort_keys=True,
        ensure_ascii=False, separators=(",", ":"), default=json_value).encode("utf-8")).hexdigest()
    public = {
        "id_transaction_origine": original.id_transaction,
        "expected_version": original.row_version,
        "dependency_fingerprint": digest,
        "type_origine": "vente" if original.id_client is not None else "achat",
        "type_cible": target_side,
        "id_contact_cible": command.id_contact_cible,
        "id_produit_cible": command.id_produit_cible,
        "nom_produit_cible": target_product.nom_produit,
        "quantite": command.quantite,
        "prix_unitaire": format(command.prix_unitaire, "f"),
        "montant_total_cible": format(total, "f"),
        "stock": stock,
        "paiements_a_annuler": [
            {"id_paiement": p.id_paiement, "montant": format(Decimal(str(p.montant)), "f"),
             "type_paiement": p.type_paiement}
            for p in active
        ],
        "paiements_historiques_conserves": len(payments),
        "nouveau_paiement_automatique": False,
    }
    return public, old_movement, active, target_contact, target_product, contact_key


def preview_conversion(db, transaction_id, command):
    tx = db.get(Transaction, transaction_id)
    if tx is None:
        raise HTTPException(404, "Transaction introuvable.")
    if tx.row_version != command.expected_version:
        raise HTTPException(409, "La transaction a changé. Rechargez-la avant la conversion.")
    plan, *_ = _plan(db, tx, command)
    return plan


def _hash_apply(transaction_id, command):
    payload = {"kind": "transaction_conversion", "source_transaction_id": transaction_id,
               **command.model_dump(mode="json")}
    payload["prix_unitaire"] = format(command.prix_unitaire, "f")
    return payload, sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
        separators=(",", ":")).encode("utf-8")).hexdigest()


def apply_conversion(db, transaction_id, command, actor):
    if actor is None:
        raise HTTPException(401, "Un utilisateur connecté est nécessaire.")
    payload, request_hash = _hash_apply(transaction_id, command)
    existing = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
    if existing is not None:
        return {**existing, "replayed": True}
    try:
        lock_stock_scope(db)
        original = db.query(Transaction).filter(
            Transaction.id_transaction == transaction_id,
        ).populate_existing().with_for_update().one_or_none()
        if original is None:
            raise HTTPException(404, "Transaction introuvable.")
        if original.row_version != command.expected_version:
            raise HTTPException(409, "La transaction a changé. Rechargez l'aperçu.")
        preview, old_movement, active, _, target_product, contact_key = _plan(
            db, original, command, lock=True)
        if preview["dependency_fingerprint"] != command.dependency_fingerprint:
            raise HTTPException(409, "Le stock ou les règlements ont changé. Actualisez l'aperçu.")
        if active and not command.annuler_paiements_existants:
            raise HTTPException(422, "Confirmez explicitement l'annulation des paiements existants.")
        if not active and command.annuler_paiements_existants:
            raise HTTPException(422, "Aucun paiement actif n'est à annuler.")

        montant_total = Decimal(preview["montant_total_cible"])
        replacement = Transaction(
            date_transaction=original.date_transaction,
            date_echeance=original.date_echeance,
            id_produit=target_product.id_produit,
            quantite=command.quantite,
            prix_unitaire=command.prix_unitaire,
            montant_total=montant_total,
            est_actif=True,
            id_client=command.id_contact_cible if contact_key == "id_client" else None,
            id_fournisseur=command.id_contact_cible if contact_key == "id_fournisseur" else None,
            id_utilisateur_creation=actor.id_utilisateur,
        )
        db.add(replacement)
        db.flush()
        original_id, replacement_id = original.id_transaction, replacement.id_transaction
        cancelled_ids = [p.id_paiement for p in active]
        result = {
            "id_transaction_origine": original_id,
            "id_transaction_remplacement": replacement_id,
            "paiements_annules": cancelled_ids,
            "paiements_repris": [],
            "montant_total_cible": preview["montant_total_cible"],
            "stock": preview["stock"],
            "operation_id": str(command.operation_id),
            "replayed": False,
        }
        db.add(CorrectionOperation(
            operation_id=command.operation_id,
            request_hash=request_hash,
            id_utilisateur=actor.id_utilisateur,
            reason="Conversion vente vers achat" if original.id_client is not None else "Conversion achat vers vente",
            request_payload={
                "kind": "transaction_conversion",
                "target": {"entity_type": "transaction", "entity_id": original_id,
                           "expected_version": command.expected_version},
                "changes": {},
                "conversion": payload,
            },
            result_payload={**result, "record": {"est_actif": False}, "impact": {
                "stock": preview["stock"], "transaction_remplacement": replacement_id}},
        ))
        db.flush()
        if db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT set_config('app.correction_operation_id', :operation_id, true)"),
                       {"operation_id": str(command.operation_id)})

        reason = f"Conversion vers transaction n° {replacement_id}"
        for payment in active:
            void_payment(db, payment, current_user=actor, reason=reason)
        if old_movement:
            inverse = record_movement(
                db, id_produit=old_movement.id_produit,
                quantite_delta=-Decimal(str(old_movement.quantite_delta)),
                cout_unitaire=Decimal(str(old_movement.cout_unitaire)),
                type_mouvement="reversal", source_type="transaction_reversal",
                source_id=original_id, id_mouvement_inverse=old_movement.id_mouvement_stock,
                id_utilisateur=actor.id_utilisateur, date_mouvement=old_movement.date_mouvement,
                notes=reason,
                cle_idempotence=f"stock-conversion:{command.operation_id}",
            )
            old_movement.id_mouvement_inverse = inverse.id_mouvement_stock
        original.est_actif = False
        original.motif_annulation = reason
        original.date_annulation = datetime.now(timezone.utc)
        original.id_utilisateur_annulation = actor.id_utilisateur
        original.id_utilisateur_modification = actor.id_utilisateur
        db.flush()

        record_transaction_movement(db, replacement, actor, is_new_transaction=True)
        db.flush()
        record_correction(db, type_entite="transaction", id_entite=original_id,
            action="conversion_origine", raison=reason, current_user=actor,
            details={"id_transaction_remplacement": replacement_id,
                     "paiements_annules": cancelled_ids}, operation_id=command.operation_id)
        record_correction(db, type_entite="transaction", id_entite=replacement_id,
            action="conversion_cible", raison="Transaction créée par conversion",
            current_user=actor, details={"id_transaction_origine": original_id},
            operation_id=command.operation_id)

        # Avoid claiming success until every stock/payment effect has survived
        # the database's constraints, including append-only history triggers.
        db.flush()
        db.commit()
        return result
    except (HTTPException, IntegrityError):
        db.rollback()
        replay = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if replay is not None:
            return {**replay, "replayed": True}
        raise
    except Exception:
        db.rollback()
        replay = replay_result(db, command.operation_id, request_hash, actor.id_utilisateur)
        if replay is not None:
            return {**replay, "replayed": True}
        raise
