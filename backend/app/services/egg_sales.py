"""Trace egg sales to a daily production row without duplicating stock ledgers."""
from collections import defaultdict
from datetime import datetime, timezone
from hashlib import sha256
import json

from fastapi import HTTPException

from app.models.egg_allocation import EggAllocation
from sqlalchemy.orm import joinedload, selectinload
from app.models.batiment import Batiment
from app.models.production import Production
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.audit import TransactionAudit
from app.utils.business_date import business_date
from app.utils.egg_product_sync import (
    ensure_sellable_egg_product, parse_sellable_egg_product_name,
)


def _stock_state(db, *, exclude_transaction_id=None, through_date=None,
                 reserve_open_promises=True):
    """Reserve historical unlinked sales FIFO; never invent their provenance.

    Legacy building sales consume that building's oldest remaining category.
    Unassigned sales reserve remaining eggs globally. Linked sales take priority.
    """
    query = db.query(Production).filter(Production.est_actif.is_(True))
    if through_date:
        query = query.filter(Production.date_production <= through_date)
    rows = query.order_by(Production.date_production, Production.id_production).all()
    remaining = {p.id_production: int(p.nombre_oeufs) for p in rows}
    by_category = defaultdict(list)
    for p in rows:
        by_category[(p.type_oeuf, p.calibre if p.type_oeuf == 'normal' else None)].append(p)
    sales = db.query(Transaction, Produit.nom_produit).join(Produit).filter(
        Transaction.est_actif.is_(True), Transaction.id_client.isnot(None),
    )
    if exclude_transaction_id:
        sales = sales.filter(Transaction.id_transaction != exclude_transaction_id)
    sales = sales.options(selectinload(Transaction.allocations)).all()
    for tx, _ in sales:
        if tx.allocations:
            for allocation in tx.allocations:
                if allocation.id_production in remaining:
                    remaining[allocation.id_production] -= allocation.quantite
        elif tx.id_production in remaining:
            remaining[tx.id_production] -= tx.quantite
    # Building-specific reservations must precede global reservations.
    legacy = sorted((item for item in sales if item[0].id_production is None and not item[0].allocations and not item[0].est_promesse),
                    key=lambda item: (item[0].id_batiment is None, item[0].date_transaction, item[0].id_transaction))
    for tx, name in legacy:
        category = parse_sellable_egg_product_name(name)
        if not category:
            continue
        quantity = tx.quantite
        for p in by_category[category]:
            if tx.id_batiment is not None and tx.id_batiment != p.id_batiment:
                continue
            used = min(quantity, max(0, remaining[p.id_production]))
            remaining[p.id_production] -= used
            quantity -= used
            if not quantity:
                break
    # Open promises reserve newly produced eggs oldest-commitment first after
    # confirmed sales have been accounted for. No promise can reserve stock twice.
    reservations = defaultdict(dict)
    if reserve_open_promises:
        promises = db.query(Transaction).join(Produit).filter(
            Transaction.est_actif.is_(True), Transaction.est_promesse.is_(True),
            Transaction.id_client.isnot(None), Transaction.id_batiment.isnot(None),
        ).options(selectinload(Transaction.allocations), joinedload(Transaction.produit)).order_by(
            Transaction.date_creation, Transaction.id_transaction
        ).all()
        for tx in promises:
            if tx.id_transaction == exclude_transaction_id:
                continue
            category = parse_sellable_egg_product_name(tx.produit.nom_produit)
            if not category:
                continue
            covered = sum(a.quantite for a in tx.allocations)
            pending = max(0, tx.quantite - covered - (tx.quantite_annulee or 0))
            for p in by_category.get(category, []):
                if p.id_batiment != tx.id_batiment:
                    continue
                used = min(pending, max(0, remaining[p.id_production]))
                if used:
                    reservations[tx.id_transaction][p.id_production] = used
                remaining[p.id_production] -= used
                pending -= used
                if not pending:
                    break
    return rows, remaining, reservations


def source_balances(db, *, exclude_transaction_id=None, through_date=None,
                    reserve_open_promises=True):
    rows, remaining, _ = _stock_state(db, exclude_transaction_id=exclude_transaction_id,
                                      through_date=through_date,
                                      reserve_open_promises=reserve_open_promises)
    return rows, remaining


def assign_pending_promises(db, *, building_id=None, building_ids=None,
                            current_user=None, skip_audit_transaction_id=None):
    """Persist newly available production against the oldest open promises.

    Existing allocations remain attached to their sale. Only unassigned units
    are distributed, so repeated production saves are safe and canceled sales
    naturally release their allocations to the next promise.
    """
    query = db.query(Transaction).join(Produit).filter(
        Transaction.est_actif.is_(True), Transaction.est_promesse.is_(True),
        Transaction.id_client.isnot(None), Transaction.id_batiment.isnot(None),
    ).options(selectinload(Transaction.allocations), joinedload(Transaction.produit))
    scoped_buildings = {building for building in (building_ids or ()) if building is not None}
    if building_id is not None:
        scoped_buildings.add(building_id)
    if scoped_buildings:
        query = query.filter(Transaction.id_batiment.in_(sorted(scoped_buildings)))
    promises = query.order_by(Transaction.date_creation, Transaction.id_transaction).all()
    grouped = defaultdict(list)
    for tx in promises:
        category = parse_sellable_egg_product_name(tx.produit.nom_produit)
        if category:
            grouped[(tx.id_batiment, category)].append(tx)
    if not grouped:
        return []

    # Match the established stock-write lock order: buildings, then products.
    building_ids = sorted({building for building, _ in grouped})
    db.query(Batiment).filter(Batiment.id_batiment.in_(building_ids)).order_by(
        Batiment.id_batiment
    ).with_for_update().all()
    product_ids = sorted({tx.id_produit for items in grouped.values() for tx in items})
    db.query(Produit).filter(Produit.id_produit.in_(product_ids)).order_by(
        Produit.id_produit
    ).with_for_update().all()

    for tx in promises:
        # A single production pointer cannot describe a multi-row reservation.
        if tx.id_production is not None or tx.id_cycle is not None:
            tx.id_production = None
            tx.production = None
            tx.id_cycle = None
            tx.cycle = None
    db.flush()

    rows, balances = source_balances(
        db, through_date=business_date(), reserve_open_promises=False,
    )
    assignments = []
    for (scope_building, category), items in sorted(
        grouped.items(), key=lambda item: (item[0][0], item[0][1][0], item[0][1][1] or "")
    ):
        eligible = [
            row for row in rows
            if row.id_batiment == scope_building
            and (row.type_oeuf, row.calibre if row.type_oeuf == "normal" else None) == category
            and row.type_oeuf not in {"casse", "perdu"}
        ]
        for tx in items:
            before = sum(a.quantite for a in tx.allocations)
            pending = max(0, tx.quantite - before - (tx.quantite_annulee or 0))
            allocated = 0
            used_sources = []
            existing = {allocation.id_production: allocation for allocation in tx.allocations}
            for production in eligible:
                quantity = min(pending, max(0, balances[production.id_production]))
                if quantity:
                    allocation = existing.get(production.id_production)
                    if allocation:
                        allocation.quantite += quantity
                    else:
                        allocation = EggAllocation(
                            id_production=production.id_production,
                            quantite=quantity,
                        )
                        tx.allocations.append(allocation)
                        existing[production.id_production] = allocation
                    balances[production.id_production] -= quantity
                    pending -= quantity
                    allocated += quantity
                    used_sources.append(dict(
                        id_production=production.id_production,
                        date_production=production.date_production.isoformat(),
                        quantite=quantity,
                        id_cycle=production.id_cycle,
                    ))
                if not pending:
                    break
            if allocated:
                assignments.append(dict(id_transaction=tx.id_transaction, quantite=allocated))
            if allocated and current_user and tx.id_transaction != skip_audit_transaction_id:
                tx.id_utilisateur_modification = current_user.id_utilisateur
                tx.date_modification = datetime.now(timezone.utc)
                db.add(TransactionAudit(
                    id_transaction=tx.id_transaction,
                    id_utilisateur=current_user.id_utilisateur,
                    champ_modifie='reservation_automatique_stock',
                    ancienne_valeur=str(before),
                    nouvelle_valeur=json.dumps(dict(
                        quantite_couverte=before + allocated,
                        quantite_attribuee=allocated,
                        quantite_totale=tx.quantite,
                        date=business_date().isoformat(),
                        repartition_stock=used_sources,
                    )),
                ))
    db.flush()
    return assignments


def resolve_sale_source(db, payload):
    """Derive product, building and lot from the selected saisie on the server."""
    if payload.id_production is None:
        if payload.id_produit is None:
            raise HTTPException(400, "Sélectionnez une production pour la vente ou un produit pour l'achat.")
        # Lock before inserting a transaction: acquiring FOR UPDATE after an
        # FK insert can deadlock against another request's FK key-share lock.
        if payload.id_batiment is not None:
            db.query(Batiment).filter(Batiment.id_batiment == payload.id_batiment).with_for_update().first()
        db.query(Produit).filter(Produit.id_produit == payload.id_produit).with_for_update().first()
        return
    source = db.get(Production, payload.id_production)
    if not source:
        raise HTTPException(404, "Saisie de production introuvable.")
    db.query(Batiment).filter(Batiment.id_batiment == source.id_batiment).with_for_update().one()
    db.refresh(source)
    if not source.est_actif or source.type_oeuf in {'casse', 'perdu'} or source.nombre_oeufs <= 0:
        raise HTTPException(400, "Cette production ne contient pas d'œufs vendables.")
    if not payload.id_client or payload.id_fournisseur:
        raise HTTPException(400, "La production source est réservée aux ventes clients.")
    if payload.date_transaction < source.date_production:
        raise HTTPException(400, "La vente ne peut pas précéder la date de production.")
    product = ensure_sellable_egg_product(db, source.type_oeuf, source.calibre)
    if not product:
        raise HTTPException(400, "Calibre de production indisponible.")
    db.query(Produit).filter(Produit.id_produit == product.id_produit).with_for_update().one()
    for field, expected in [('id_batiment', source.id_batiment), ('id_produit', product.id_produit), ('id_cycle', source.id_cycle)]:
        provided = getattr(payload, field)
        if provided is not None and provided != expected:
            raise HTTPException(400, "Le bâtiment, le lot ou le type ne correspond pas à la production choisie.")
        setattr(payload, field, expected)


def validate_sale_stock(db, transaction, current_user=None, *, preserve_allocations=False,
                        skip_promise_audit=False):
    product = transaction.produit or db.get(Produit, transaction.id_produit)
    category = parse_sellable_egg_product_name(product.nom_produit) if product else None
    if not category:
        if transaction.est_promesse:
            raise HTTPException(409, "Le produit sélectionné ne correspond pas à des œufs vendables.")
        return
    if transaction.id_client is None:
        return
    if transaction.est_promesse:
        if not transaction.allocation_automatique:
            raise HTTPException(400, "Une vente avec livraison différée doit utiliser l'allocation automatique.")
        if transaction.id_batiment is None:
            raise HTTPException(400, "Sélectionnez le bâtiment source pour cette livraison différée.")
        covered = sum(allocation.quantite for allocation in transaction.allocations)
        if covered > transaction.quantite:
            raise HTTPException(409, "La quantité ne peut pas être inférieure au stock déjà réservé.")
        if preserve_allocations:
            return
        # Keep existing sources stable. Newly produced stock fills only the
        # remaining quantity, while the helper preserves FIFO across promises.
        assign_pending_promises(
            db,
            building_id=transaction.id_batiment,
            current_user=current_user,
            skip_audit_transaction_id=(
                transaction.id_transaction if skip_promise_audit else None
            ),
        )
        return
    if transaction.id_production is None and not transaction.allocation_automatique:
        # Keep accepting historical API callers that create unlinked sales.
        # New sale entry sends allocation_automatique=true and is stock checked.
        return
    # Daily production corrections lock the same building first. The product
    # lock also serializes sales across buildings when legacy sales are unassigned.
    if transaction.id_batiment is None:
        raise HTTPException(400, "Sélectionnez le bâtiment source pour cette livraison différée.")
    db.query(Batiment).filter(Batiment.id_batiment == transaction.id_batiment).with_for_update().one()
    db.query(Produit).filter(Produit.id_produit == transaction.id_produit).with_for_update().one()
    if transaction.est_promesse and preserve_allocations:
        # Price-only edits cannot confirm more eggs or erase confirmed origins.
        return
    rows, balances = source_balances(db, exclude_transaction_id=transaction.id_transaction,
                                    through_date=transaction.date_transaction)
    source = next((p for p in rows if p.id_production == transaction.id_production), None)
    if category is None or category[0] in {'casse', 'perdu'}:
        raise HTTPException(409, "Le produit sélectionné ne correspond pas à des œufs vendables.")
    if source and source.type_oeuf in {'casse', 'perdu'}:
        raise HTTPException(409, "La production sélectionnée n'est plus disponible.")
    if transaction.allocation_automatique:
        eligible = [p for p in rows if p.id_batiment == transaction.id_batiment
                    and (p.type_oeuf, p.calibre) == category]
        # Preserve exact origins for price/payment-only edits.
        eligible_ids = {p.id_production for p in eligible}
        if (transaction.allocations and sum(a.quantite for a in transaction.allocations) == transaction.quantite
                and all(a.id_production in eligible_ids and a.quantite <= balances[a.id_production]
                        for a in transaction.allocations)):
            return
        quantity = transaction.quantite
        allocations = []
        for p in eligible:
            used = min(quantity, max(0, balances[p.id_production]))
            if used:
                allocations.append(EggAllocation(id_production=p.id_production, quantite=used))
                quantity -= used
            if quantity == 0:
                break
        if quantity and not transaction.est_promesse:
            covered = transaction.quantite - quantity
            raise HTTPException(409, f"Stock insuffisant : {covered} œuf(s) disponible(s), {transaction.quantite} demandé(s).")
        transaction.allocations.clear()
        db.flush()
        if allocations:
            transaction.allocations.extend(allocations)
            first = next(p for p in eligible if p.id_production == allocations[0].id_production)
            transaction.id_production = first.id_production
            transaction.production = first
            transaction.id_cycle = first.id_cycle
        else:
            transaction.id_production = None
            transaction.production = None
            transaction.id_cycle = None
        db.flush()
        return
    if not source:
        raise HTTPException(409, "La production sélectionnée n'est plus disponible.")
    if transaction.quantite > balances[source.id_production]:
        raise HTTPException(409, f"Stock insuffisant pour cette saisie : {max(0, balances[source.id_production])} œuf(s) disponible(s).")
    if transaction.allocations:
        transaction.allocations.clear()
        db.flush()
        transaction.allocations.append(EggAllocation(id_production=source.id_production, quantite=transaction.quantite))
        db.flush()



def protect_production_source(db, source, *, quantity=0, category=None, production_date=None, building_id=None):
    """Do not remove or recategorize eggs already sold, including legacy reserves."""
    if source.type_oeuf in {'casse', 'perdu'}:
        return
    product = ensure_sellable_egg_product(db, source.type_oeuf, source.calibre)
    if product:
        db.query(Produit).filter(Produit.id_produit == product.id_produit).with_for_update().one()
    _, balances = source_balances(db)
    reserved = int(source.nombre_oeufs) - balances.get(source.id_production, int(source.nombre_oeufs))
    if reserved <= 0:
        return
    current_category = (source.type_oeuf, source.calibre)
    if (quantity < reserved or (category is not None and category != current_category)
            or (production_date is not None and production_date != source.date_production)
            or (building_id is not None and building_id != source.id_batiment)):
        raise HTTPException(409, "Des œufs de cette saisie sont déjà vendus. Annulez les ventes concernées avant de corriger leur origine ou de réduire la production.")


def sale_sources(db, id_batiment, production_date=None, exclude_transaction_id=None, *, through_date=None):
    # Exclusion is only for editing an existing sale from this building.
    tx = None
    if exclude_transaction_id:
        tx = db.get(Transaction, exclude_transaction_id)
        if not tx or tx.id_client is None:
            raise HTTPException(400, "Transaction incompatible avec ce bâtiment.")
    if tx and tx.est_actif and tx.est_promesse:
        # Keep every client's priority intact, then expose this sale's own
        # eggs for editing. Removing it first lets newer promises reserve its
        # allocations and makes an unchanged sale appear short of stock.
        rows, balances, reservations = _stock_state(db, through_date=through_date)
        for allocation in tx.allocations:
            if allocation.id_production in balances:
                balances[allocation.id_production] += allocation.quantite
        for source_id, quantity in reservations.get(tx.id_transaction, {}).items():
            balances[source_id] += quantity
    else:
        rows, balances = source_balances(db, exclude_transaction_id=exclude_transaction_id,
                                        through_date=through_date)
    return [{
        'id_production': p.id_production, 'date_production': p.date_production,
        'id_batiment': p.id_batiment, 'id_cycle': p.id_cycle, 'type_oeuf': p.type_oeuf, 'calibre': p.calibre,
        'grammage': p.grammage, 'nombre_oeufs': p.nombre_oeufs,
        'disponible': max(0, balances[p.id_production]) if p.type_oeuf not in {'casse', 'perdu'} else 0,
        'vendable': p.type_oeuf not in {'casse', 'perdu'} and p.nombre_oeufs > 0,
    } for p in rows if p.id_batiment == id_batiment
       and (production_date is None or p.date_production == production_date)
       and (through_date is None or (p.type_oeuf not in {'casse', 'perdu'}
                                    and balances[p.id_production] > 0))]


def reserved_stock_by_category(db, through_date):
    rows, _, reservations = _stock_state(db, through_date=through_date)
    totals = defaultdict(int)
    by_id = {p.id_production: p for p in rows}
    for sources in reservations.values():
        for source_id, quantity in sources.items():
            p = by_id[source_id]
            totals[(p.id_batiment, p.type_oeuf, p.calibre if p.type_oeuf == 'normal' else None)] += quantity
    return totals


def deferred_sale_reservations(db):
    """Stock reserved but not yet confirmed as completed, including virtual FIFO reservations."""
    _, _, reservations = _stock_state(db, through_date=business_date())
    result = {transaction_id: sum(sources.values())
              for transaction_id, sources in reservations.items()}
    promises = db.query(Transaction).filter(
        Transaction.est_actif.is_(True), Transaction.est_promesse.is_(True),
    ).options(selectinload(Transaction.allocations)).all()
    for tx in promises:
        allocated_but_not_completed = sum(max(0, a.quantite - (a.quantite_livree or 0)) for a in tx.allocations)
        result[tx.id_transaction] = min(
            max(0, tx.quantite_en_attente),
            result.get(tx.id_transaction, 0) + allocated_but_not_completed,
        )
    return result


def deferred_stock_quantities(transaction, reserved=0):
    """Return the shared per-sale stock breakdown used by every transaction view."""
    pending = max(0, int(transaction.quantite_en_attente or 0)) if transaction.est_promesse else 0
    reserved = min(pending, max(0, int(reserved or 0))) if transaction.est_actif else 0
    return {
        "quantite_completee": max(0, int(transaction.quantite_completee or 0)),
        "quantite_reservee": reserved,
        "quantite_a_produire": max(0, pending - reserved),
    }


def deferred_sales_overview(db):
    """Open sales across all dates; payment status never hides a stock shortage."""
    reservations = deferred_sale_reservations(db)
    sales = db.query(Transaction).filter(
        Transaction.est_actif.is_(True), Transaction.est_promesse.is_(True),
        Transaction.id_client.isnot(None),
    ).options(selectinload(Transaction.allocations), joinedload(Transaction.client),
              joinedload(Transaction.produit), joinedload(Transaction.batiment)).order_by(
                  Transaction.date_creation, Transaction.id_transaction).all()
    return [dict(id_transaction=tx.id_transaction, nom_client=tx.client.nom_client,
                 nom_produit=tx.produit.nom_produit,
                 nom_batiment=tx.batiment.nom if tx.batiment else None,
                 date_livraison_prevue=tx.date_livraison_prevue,
                 quantite=tx.quantite,
                 quantite_couverte=tx.quantite_couverte,
                 quantite_en_attente=tx.quantite_en_attente,
                 quantite_annulee=tx.quantite_annulee or 0,
                 **deferred_stock_quantities(tx, reservations.get(tx.id_transaction, 0)))
            for tx in sales if tx.quantite_en_attente > 0]


def completion_preview(db, transaction):
    """Expose only this sale's reserved eggs, in the existing reservation order."""
    if not transaction.est_actif or not transaction.est_promesse or not transaction.id_client:
        raise HTTPException(409, "Cette transaction n’est pas une livraison différée active.")
    if not transaction.id_batiment or not transaction.allocation_automatique:
        raise HTTPException(409, "L’origine du stock de cette vente doit être renseignée.")
    rows, _, reservations = _stock_state(db, through_date=business_date())
    owned = reservations.get(transaction.id_transaction, {})
    sources_by_id = {}
    for allocation in transaction.allocations:
        pending_quantity = max(0, allocation.quantite - (allocation.quantite_livree or 0))
        if pending_quantity:
            production = next((row for row in rows if row.id_production == allocation.id_production), None)
            if production:
                sources_by_id[production.id_production] = dict(
                    id_production=production.id_production, date_production=production.date_production,
                    quantite=pending_quantity, quantite_deja_reservee=pending_quantity,
                    id_cycle=production.id_cycle,
                )
    for production in rows:
        if owned.get(production.id_production, 0) > 0:
            source = sources_by_id.setdefault(production.id_production, dict(
                id_production=production.id_production, date_production=production.date_production,
                quantite=0, quantite_deja_reservee=0, id_cycle=production.id_cycle,
            ))
            source['quantite'] += owned[production.id_production]
    sources = sorted(sources_by_id.values(), key=lambda source: (source['date_production'], source['id_production']))
    # Never propose more than the undelivered, uncanceled part of the sale.
    capacity = transaction.quantite_en_attente
    trimmed = []
    for source in sources:
        quantity = min(capacity, source['quantite'])
        if quantity:
            trimmed.append({**source, 'quantite': quantity})
            capacity -= quantity
    fingerprint = sha256(json.dumps([
        transaction.id_transaction, transaction.quantite, transaction.quantite_couverte,
        transaction.quantite_completee, transaction.quantite_annulee,
        transaction.id_batiment, transaction.id_produit, trimmed,
    ], default=str, sort_keys=True).encode()).hexdigest()
    return dict(id_transaction=transaction.id_transaction,
                nom_client=transaction.client.nom_client if transaction.client else None,
                nom_produit=transaction.produit.nom_produit,
                nom_batiment=transaction.batiment.nom if transaction.batiment else None,
                quantite_couverte=transaction.quantite_couverte,
                quantite_en_attente=transaction.quantite_en_attente,
                quantite_proposee=sum(source['quantite'] for source in trimmed),
                repartition_stock=trimmed, empreinte_stock=fingerprint)


def complete_deferred_sale(db, transaction_id, payload, current_user):
    """Append stock allocations only; never create another sale or payment."""
    snapshot = db.get(Transaction, transaction_id)
    if not snapshot:
        raise HTTPException(404, "Transaction introuvable.")
    building_id, product_id = snapshot.id_batiment, snapshot.id_produit
    # Same lock order as production corrections and new linked sales.
    db.query(Batiment).filter(Batiment.id_batiment == building_id).with_for_update().first()
    db.query(Produit).filter(Produit.id_produit == product_id).with_for_update().one()
    transaction = db.query(Transaction).filter(Transaction.id_transaction == transaction_id).populate_existing().with_for_update().one()
    if transaction.id_batiment != building_id or transaction.id_produit != product_id:
        raise HTTPException(409, "La vente a changé. Rechargez la proposition de stock.")
    preview = completion_preview(db, transaction)
    if transaction.quantite_en_attente == 0:
        raise HTTPException(409, "Cette livraison différée est déjà complétée.")
    if (payload.quantite_couverte_attendue != transaction.quantite_couverte
            or payload.empreinte_stock != preview['empreinte_stock']):
        raise HTTPException(409, "Le stock ou la vente a changé. Rechargez la proposition avant de confirmer.")
    if payload.quantite > preview['quantite_proposee']:
        raise HTTPException(409, "La quantité dépasse le stock réservé disponible pour cette vente.")
    before = transaction.quantite_completee
    remaining = payload.quantite
    consumed = []
    existing = {allocation.id_production: allocation for allocation in transaction.allocations}
    for source in preview['repartition_stock']:
        used = min(remaining, source['quantite'])
        if not used:
            break
        allocation = existing.get(source['id_production'])
        already_reserved = min(used, source.get('quantite_deja_reservee', 0))
        newly_reserved = used - already_reserved
        if allocation:
            allocation.quantite += newly_reserved
            allocation.quantite_livree = (allocation.quantite_livree or 0) + used
        else:
            transaction.allocations.append(EggAllocation(
                id_production=source['id_production'], quantite=used, quantite_livree=used,
            ))
        if transaction.id_production is None:
            transaction.id_production = source['id_production']
            transaction.id_cycle = source['id_cycle']
        consumed.append(dict(id_production=source['id_production'], date_production=str(source['date_production']), quantite=used, id_cycle=source['id_cycle']))
        remaining -= used
    if current_user:
        transaction.id_utilisateur_modification = current_user.id_utilisateur
        db.add(TransactionAudit(id_transaction=transaction_id,
            id_utilisateur=current_user.id_utilisateur, champ_modifie='completion_livraison_differee',
            ancienne_valeur=str(before),
            nouvelle_valeur=json.dumps(dict(quantite_couverte=transaction.quantite_couverte,
                                           date=business_date().isoformat(),
                                           quantite_completee=payload.quantite,
                                           total_complete=before + payload.quantite,
                                           quantite_totale=transaction.quantite,
                                           repartition_stock=consumed))))
    transaction.date_modification = datetime.now(timezone.utc)
    db.flush()
    return transaction
