"""Inventory ledger services.

The ledger is append-only. Current quantity and average cost are derived from
movements, which makes corrections auditable and safe to retry.
"""

from decimal import Decimal
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.inventory import MouvementStock
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.utils.egg_product_sync import parse_sellable_egg_product_name


ZERO = Decimal("0.000")


def validate_stock_idempotency(existing: MouvementStock, requested: dict) -> None:
    """Reject reuse of a stock key for a different ledger movement."""
    same_identity = (
        existing.id_produit == requested["id_produit"]
        and Decimal(str(existing.quantite_delta)) == Decimal(str(requested["quantite_delta"]))
        and Decimal(str(existing.cout_unitaire)) == Decimal(str(requested["cout_unitaire"]))
        and existing.type_mouvement == requested["type_mouvement"]
        and existing.source_type == requested["source_type"]
        and (
            existing.source_id == requested["source_id"]
            or (
                requested["source_id"] is None
                and existing.source_type == "manual"
                and existing.source_id == existing.id_mouvement_stock
            )
        )
    )
    if not same_identity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La clé d'idempotence est déjà utilisée pour un autre mouvement de stock",
        )


def is_inventory_tracked(produit: Produit) -> bool:
    """Return whether a product belongs to the general stock ledger."""
    return (
        produit.type_produit != "service"
        and not parse_sellable_egg_product_name(produit.nom_produit)
    )


def get_stock_quantity(db: Session, id_produit: int) -> Decimal:
    """Calculate the current quantity for one product."""
    value = db.query(func.coalesce(func.sum(MouvementStock.quantite_delta), 0)).filter(
        MouvementStock.id_produit == id_produit
    ).scalar()
    return Decimal(str(value or 0))


def get_average_unit_cost(db: Session, id_produit: int) -> Decimal:
    """Calculate weighted average cost from positive stock receipts."""
    rows = db.query(
        MouvementStock.quantite_delta,
        MouvementStock.cout_unitaire,
    ).filter(
        MouvementStock.id_produit == id_produit,
        MouvementStock.id_mouvement_inverse.is_(None),
        MouvementStock.type_mouvement != "reversal",
    ).all()
    total_quantity = Decimal("0")
    total_value = Decimal("0")
    for quantity, cost in rows:
        quantity = Decimal(str(quantity or 0))
        if quantity > 0:
            total_quantity += quantity
            total_value += quantity * Decimal(str(cost or 0))
    return total_value / total_quantity if total_quantity else Decimal("0")


def record_movement(
    db: Session,
    *,
    id_produit: int,
    quantite_delta: Decimal,
    cout_unitaire: Decimal = Decimal("0"),
    type_mouvement: str,
    source_type: str,
    source_id: Optional[int] = None,
    cle_idempotence: Optional[str] = None,
    id_utilisateur: Optional[int] = None,
    notes: Optional[str] = None,
    date_mouvement: Optional[datetime] = None,
) -> MouvementStock:
    """Append a movement, returning the existing movement for retries."""
    delta = Decimal(str(quantite_delta))
    cost = Decimal(str(cout_unitaire))
    if delta == 0:
        raise HTTPException(status_code=400, detail="La variation de stock ne peut pas être nulle")
    if cost < 0:
        raise HTTPException(status_code=400, detail="Le coût unitaire ne peut pas être négatif")

    if cle_idempotence:
        existing = db.query(MouvementStock).filter(
            MouvementStock.cle_idempotence == cle_idempotence
        ).first()
        if existing:
            validate_stock_idempotency(existing, {
                "id_produit": id_produit,
                "quantite_delta": delta,
                "cout_unitaire": cost,
                "type_mouvement": type_mouvement,
                "source_type": source_type,
                "source_id": source_id,
            })
            return existing

    movement = MouvementStock(
        id_produit=id_produit,
        quantite_delta=delta,
        cout_unitaire=cost,
        type_mouvement=type_mouvement,
        source_type=source_type,
        source_id=source_id,
        cle_idempotence=cle_idempotence,
        id_utilisateur=id_utilisateur,
        notes=notes,
        date_mouvement=date_mouvement,
    )
    db.add(movement)
    db.flush()
    return movement


def record_transaction_movement(
    db: Session,
    transaction: Transaction,
    current_user: Optional[Utilisateur],
) -> Optional[MouvementStock]:
    """Record inventory impact for a purchase or sale transaction."""
    # Lock the product row while checking and writing its ledger impact. This
    # serializes concurrent sales of the same product on PostgreSQL and
    # prevents two requests from consuming the same available stock.
    produit = db.query(Produit).filter(Produit.id_produit == transaction.id_produit).with_for_update().first()
    if not produit or not is_inventory_tracked(produit):
        return None

    user_id = current_user.id_utilisateur if current_user else None
    if transaction.id_fournisseur is not None:
        return record_movement(
            db,
            id_produit=produit.id_produit,
            quantite_delta=Decimal(str(transaction.quantite)),
            cout_unitaire=Decimal(str(transaction.prix_unitaire)),
            type_mouvement="achat",
            source_type="transaction",
            source_id=transaction.id_transaction,
            id_utilisateur=user_id,
            notes="Entrée de stock liée à un achat",
        )

    available = get_stock_quantity(db, produit.id_produit)
    quantity = Decimal(str(transaction.quantite))
    # Backward-compatible migration boundary: legacy products with no ledger
    # history can still be sold while their historical stock is backfilled.
    # Once a product has a ledger movement, all future sales are stock-checked.
    ledger_entries = db.query(func.count(MouvementStock.id_mouvement_stock)).filter(
        MouvementStock.id_produit == produit.id_produit
    ).scalar() or 0
    if ledger_entries == 0:
        return None
    if available < quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Stock insuffisant pour '{produit.nom_produit}': "
                f"{available} disponible(s), {quantity} demandé(s)"
            ),
        )

    return record_movement(
        db,
        id_produit=produit.id_produit,
        quantite_delta=-quantity,
        cout_unitaire=get_average_unit_cost(db, produit.id_produit),
        type_mouvement="vente",
        source_type="transaction",
        source_id=transaction.id_transaction,
        id_utilisateur=user_id,
        notes="Sortie de stock liée à une vente",
    )


def reverse_source_movements(
    db: Session,
    *,
    source_type: str,
    source_id: int,
    current_user: Optional[Utilisateur],
    reason: str,
) -> list[MouvementStock]:
    """Append inverse movements for all active movements from a source."""
    originals = db.query(MouvementStock).filter(
        MouvementStock.source_type == source_type,
        MouvementStock.source_id == source_id,
        MouvementStock.id_mouvement_inverse.is_(None),
    ).with_for_update().all()
    if not originals:
        return []

    # A reversal must preserve the non-negative inventory invariant. Validate
    # the complete source before appending any inverse movement so a rejected
    # correction remains atomic for all products in the source.
    for original in originals:
        current_quantity = get_stock_quantity(db, original.id_produit)
        resulting_quantity = current_quantity - Decimal(str(original.quantite_delta))
        if resulting_quantity < 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"La reversal du mouvement #{original.id_mouvement_stock} "
                    "ferait passer le stock sous zéro"
                ),
            )

    user_id = current_user.id_utilisateur if current_user else None
    reversals = []
    for original in originals:
        reversal = record_movement(
            db,
            id_produit=original.id_produit,
            quantite_delta=-Decimal(str(original.quantite_delta)),
            cout_unitaire=Decimal(str(original.cout_unitaire or 0)),
            type_mouvement="reversal",
            source_type=f"{source_type}_reversal",
            source_id=source_id,
            id_utilisateur=user_id,
            notes=reason,
        )
        original.id_mouvement_inverse = reversal.id_mouvement_stock
        reversals.append(reversal)
    return reversals


def get_stock_snapshot(db: Session, *, id_produit: Optional[int] = None):
    """Return product balances with weighted average cost."""
    query = db.query(Produit).filter(
        Produit.est_actif.is_(True),
        Produit.type_produit != "service",
    )
    if id_produit is not None:
        query = query.filter(Produit.id_produit == id_produit)

    result = []
    for produit in query.order_by(Produit.nom_produit.asc()).all():
        quantity = get_stock_quantity(db, produit.id_produit)
        cost = get_average_unit_cost(db, produit.id_produit)
        result.append({
            "id_produit": produit.id_produit,
            "nom_produit": produit.nom_produit,
            "type_produit": produit.type_produit,
            "quantite_disponible": quantity,
            "cout_unitaire_moyen": cost,
            "valeur_stock": quantity * cost,
        })
    return result


def record_adjustment(
    db: Session,
    *,
    id_produit: int,
    quantite_delta: Decimal,
    cout_unitaire: Decimal,
    current_user: Optional[Utilisateur],
    notes: str,
    cle_idempotence: Optional[str] = None,
) -> MouvementStock:
    """Record an explicit, auditable stock adjustment."""
    produit = db.query(Produit).filter(Produit.id_produit == id_produit).first()
    if not produit:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    if not is_inventory_tracked(produit):
        raise HTTPException(status_code=400, detail="Ce produit n'est pas suivi en stock général")
    if Decimal(str(quantite_delta)) < 0 and get_stock_quantity(db, id_produit) < abs(Decimal(str(quantite_delta))):
        raise HTTPException(status_code=409, detail="L'ajustement ferait passer le stock sous zéro")
    movement = record_movement(
        db,
        id_produit=id_produit,
        quantite_delta=quantite_delta,
        cout_unitaire=cout_unitaire,
        type_mouvement="ajustement",
        source_type="manual",
        cle_idempotence=cle_idempotence,
        id_utilisateur=current_user.id_utilisateur if current_user else None,
        notes=notes,
    )
    # Bind the adjustment to its own source id so it can be reversed without
    # grouping unrelated manual corrections that happened in the same period.
    movement.source_id = movement.id_mouvement_stock
    db.flush()
    return movement
