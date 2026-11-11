"""Phase 4 atomic deferred-delivery remainder cancellation.

The route is explicitly gated OFF by default. This service writes an audited
commercial avoir and the stock closure into ONE caller-controlled transaction;
it never creates a payment, refund, advance, bank or cash movement.
"""
from datetime import datetime, timezone
from decimal import Decimal
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.audit import TransactionAudit
from app.models.batiment import Batiment
from app.models.correction_operation import CorrectionOperation
from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.services.deferred_cancellation_contract import (
    CancellationContractError,
    quote_unfulfilled_cancellation,
)
from app.utils.business_date import business_date
from app.utils.egg_product_sync import parse_sellable_egg_product_name


def _request_identity(transaction_id: int, payload) -> tuple[str, dict]:
    """Stable identity independent of execution date and DB state."""
    body = {
        "transaction_id": transaction_id,
        "expected_version": payload.expected_version,
        "expected_pending": payload.quantite_en_attente_attendue,
        "action": "cancel_unallocated",
        "kind": "deferred_avoir",
    }
    digest = sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return digest, body


def cancel_deferred_sale_remainder(
    db: Session,
    *,
    transaction_id: int,
    payload,
    actor,
) -> dict:
    """Stage one all-or-nothing stock+avoir operation; caller must commit.

    The lock order is the existing production flow: building, product, sale.
    PostgreSQL's deferred ledger parity check runs at COMMIT; the API caller
    must roll back on any error and must not send a success response earlier.
    """
    if actor is None or not actor.est_actif:
        raise HTTPException(403, "Un utilisateur actif et authentifié est requis.")
    request_hash, request_identity = _request_identity(transaction_id, payload)
    snapshot = db.query(
        Transaction.id_batiment, Transaction.id_produit,
    ).filter(Transaction.id_transaction == transaction_id).one_or_none()
    if snapshot is None:
        raise HTTPException(404, "Transaction introuvable.")
    if snapshot.id_batiment is None or snapshot.id_produit is None:
        raise HTTPException(409, "Origine du stock introuvable. Rechargez la vente.")

    # Same lock sequence as the production stock-allocation writer.
    db.query(Batiment).filter(Batiment.id_batiment == snapshot.id_batiment).with_for_update().one()
    product = db.query(Produit).filter(
        Produit.id_produit == snapshot.id_produit,
    ).with_for_update().one()
    tx = db.query(Transaction).filter(
        Transaction.id_transaction == transaction_id,
    ).populate_existing().with_for_update().one()
    if tx.id_batiment != snapshot.id_batiment or tx.id_produit != snapshot.id_produit:
        raise HTTPException(409, "L'origine du stock a changé. Rechargez la vente.")

    existing = db.get(CorrectionOperation, payload.operation_id)
    if existing is not None:
        if (existing.request_hash != request_hash
                or existing.id_utilisateur != actor.id_utilisateur
                or existing.request_payload.get("kind") != "deferred_avoir"
                or existing.request_payload.get("transaction_id") != transaction_id):
            raise HTTPException(409, "Cet identifiant d'opération a déjà été utilisé pour une autre demande.")
        if not isinstance(existing.result_payload, dict) or not existing.result_payload.get("id_avoir"):
            raise HTTPException(409, "Opération existante incomplète. Contactez le support.")
        # Returning the recorded immutable result is a real idempotent replay,
        # even when the transaction's revision and stock have changed.
        return {**existing.result_payload, "rejoue": True}

    if (not tx.est_actif or not tx.est_promesse or not tx.allocation_automatique
            or tx.id_client is None or tx.id_fournisseur is not None
            or parse_sellable_egg_product_name(product.nom_produit) is None):
        raise HTTPException(409, "Seule une livraison différée active d'œufs clients peut être clôturée.")

    # A fresh view after the locked sale row is critical: allocation changes
    # that raced with the request must not be read from a stale identity map.
    db.expire(tx, ["allocations", "paiements", "avoirs_livraison_differee"])
    pending = tx.quantite_en_attente
    if pending <= 0:
        raise HTTPException(409, "Cette livraison n'a plus d'œufs à produire.")
    effective_date = business_date()
    try:
        quote = quote_unfulfilled_cancellation(
            original_quantity=tx.quantite,
            covered_quantity=tx.quantite_couverte,
            delivered_quantity=tx.quantite_completee,
            previously_canceled=tx.quantite_annulee or 0,
            cancel_quantity=pending,
            original_amount=Decimal(str(tx.montant_total)),
            effective_payments=tx.montant_paye,
            transaction_date=tx.date_transaction,
            effective_date=effective_date,
            row_version=tx.row_version,
            expected_version=payload.expected_version,
            expected_pending=payload.quantite_en_attente_attendue,
        )
    except CancellationContractError as exc:
        raise HTTPException(409, str(exc)) from exc

    # A duplicate operation ID on another transaction is finally protected by
    # correction_operations' unique primary key. The route converts that
    # integrity exception into 409 and rolls back the *whole* transaction.
    # A single business date is used for quoting, posting and the audit.
    amount = f"{quote.adjustment_now:.2f}"
    result = {
        "id_avoir": str(payload.operation_id),
        "id_transaction": transaction_id,
        "date_effet": effective_date.isoformat(),
        "quantite_annulee": quote.canceled_now,
        "quantite_annulee_cumulee": quote.canceled_total,
        "quantite_en_attente": quote.pending_after,
        "montant_initial": f"{quote.original_amount:.2f}",
        "montant_avoir": amount,
        "montant_avoirs_cumule": f"{quote.adjustments_total:.2f}",
        "montant_net": f"{quote.net_amount:.2f}",
        "montant_paye": f"{quote.effective_payments:.2f}",
        "montant_restant": f"{quote.remaining_balance:.2f}",
        "credit_client": f"{quote.customer_credit:.2f}",
        "rejoue": False,
        "adjustment_amount": amount,
        "cumulative_canceled": quote.canceled_total,
    }
    operation = CorrectionOperation(
        operation_id=payload.operation_id,
        request_hash=request_hash,
        id_utilisateur=actor.id_utilisateur,
        reason="Annulation du reliquat de livraison différée",
        request_payload={
            **request_identity,
            "cancel_quantity": quote.canceled_now,
            "effective_date": effective_date.isoformat(),
        },
        result_payload=result,
    )
    db.add(operation)
    db.flush()
    if db.bind.dialect.name == "postgresql":
        # Associate the existing database-enforced entity revision with the
        # immutable operation. Must be transaction-local: no pooled-connection
        # session variable may leak into a subsequent request.
        db.execute(
            text("SELECT set_config('app.correction_operation_id', :id, true)"),
            {"id": str(payload.operation_id)},
        )

    before = tx.quantite_annulee or 0
    tx.quantite_annulee = quote.canceled_total
    tx.id_utilisateur_modification = actor.id_utilisateur
    tx.date_modification = datetime.now(timezone.utc)
    db.flush()
    db.add(DeferredSaleAdjustment(
        id_avoir=payload.operation_id,
        id_transaction=transaction_id,
        id_client=tx.id_client,
        id_utilisateur_creation=actor.id_utilisateur,
        date_effet=effective_date,
        quantite_initiale=tx.quantite,
        montant_initial=quote.original_amount,
        quantite_annulee_avant=before,
        quantite_annulee=quote.canceled_now,
        quantite_annulee_cumulee=quote.canceled_total,
        avoir_cumule_avant=quote.adjustments_total - quote.adjustment_now,
        montant_avoir=quote.adjustment_now,
        avoir_cumule=quote.adjustments_total,
    ))
    db.add(TransactionAudit(
        id_transaction=transaction_id,
        id_utilisateur=actor.id_utilisateur,
        champ_modifie="annulation_reste_livraison_differee",
        ancienne_valeur=str(before),
        nouvelle_valeur=json.dumps({
            "date": effective_date.isoformat(),
            "quantite_annulee": quote.canceled_now,
            "quantite_couverte": tx.quantite_couverte,
            "quantite_totale": tx.quantite,
            "id_avoir": str(payload.operation_id),
            "montant_avoir": amount,
        }),
    ))
    db.flush()
    return result
