"""Read-only stock plans and append-only application of validated corrections."""
from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import HTTPException

from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.lot_production import LotProduction
from app.models.production import Production
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.egg_allocation import EggAllocation
from app.models.inventory import MouvementStock
from app.models.audit import TransactionAudit
from app.services.inventory import is_inventory_tracked, get_average_unit_cost, record_movement
from app.services.egg_sales import source_balances, _stock_state
from app.utils.business_date import business_date
from app.utils.egg_product_sync import parse_sellable_egg_product_name


STOCK_FIELDS = {'quantite', 'id_produit', 'id_batiment', 'id_production', 'date_transaction', 'prix_unitaire'}


def lock_stock_scope(db):
    """Small owner app: serialize stock plans in the existing global lock order.

    All buildings/products are included because unassigned legacy egg sales
    reserve production globally. No transaction lock may precede this scope.
    """
    for model, key in ((Batiment, Batiment.id_batiment), (Produit, Produit.id_produit),
                       (Transaction, Transaction.id_transaction)):
        rows = db.query(model).order_by(key).populate_existing().with_for_update().all()
        if model is Transaction:
            for row in rows:
                db.expire(row, ['allocations', 'produit'])


def stock_dependencies(db):
    # Include historical rows too: new sources, stock adjustments, source-date
    # edits and changes to another customer's reservation invalidate previews.
    def snapshot(row):
        def value(item):
            if isinstance(item, Decimal):
                return str(item)
            if isinstance(item, datetime):
                return _utc(item).isoformat()
            if isinstance(item, date):
                return item.isoformat()
            return item
        return {col.name: value(getattr(row, col.name)) for col in row.__table__.columns}
    return {model.__tablename__: [snapshot(row) for row in db.query(model).order_by(
        *model.__table__.primary_key.columns).populate_existing().all()]
        for model in (Produit, Production, EggAllocation, Transaction, MouvementStock,
                      Batiment, CycleProduction, LotProduction, TransactionAudit)}


def _day(value):
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def plan_stock_correction(db, record, changes, allocations=None):
    final = {name: changes.get(name, getattr(record, name)) for name in
             ('quantite', 'prix_unitaire', 'date_transaction', 'id_produit', 'id_batiment', 'id_production')}
    final['date_transaction'] = date.fromisoformat(final['date_transaction']) if isinstance(final['date_transaction'], str) else final['date_transaction']
    for name in ('quantite', 'prix_unitaire', 'date_transaction', 'id_produit'):
        if final[name] is None:
            raise HTTPException(422, 'La quantité, le prix, la date et le produit doivent être renseignés.')
    if not record.est_actif:
        raise HTTPException(409, 'Réactivez la transaction avant de corriger son stock.')
    old_product = db.get(Produit, record.id_produit)
    product = db.get(Produit, final['id_produit'])
    if not product or not product.est_actif:
        raise HTTPException(422, 'Le produit sélectionné est introuvable ou inactif.')
    if product.id_produit != record.id_produit and product.usage != ('vendu' if record.id_client is not None else 'achete'):
        raise HTTPException(422, 'Le produit ne correspond pas au type de transaction.')
    old_egg = parse_sellable_egg_product_name(old_product.nom_produit)
    egg = parse_sellable_egg_product_name(product.nom_produit)
    if bool(old_egg) != bool(egg):
        raise HTTPException(409, 'Une correction conserve la séparation entre œufs et stock général.')
    if egg:
        return _egg_plan(db, record, final, egg, allocations)
    if allocations is not None or final['id_production'] is not None:
        raise HTTPException(422, 'Les origines de production concernent uniquement les ventes d’œufs.')
    if final['id_batiment'] != record.id_batiment:
        raise HTTPException(409, 'Le bâtiment du stock général ne se modifie pas dans cette correction.')
    return _inventory_plan(db, record, final, old_product, product)


def _inventory_plan(db, record, final, old_product, product):
    rows = db.query(MouvementStock).filter(MouvementStock.source_type == 'transaction',
        MouvementStock.source_id == record.id_transaction,
        MouvementStock.id_mouvement_inverse.is_(None)).all()
    old = rows[0] if len(rows) == 1 else None
    if is_inventory_tracked(old_product):
        direction = 1 if record.id_fournisseur is not None else -1
        if (old is None or len(rows) != 1 or old.id_produit != record.id_produit
                or old.quantite_delta != direction * record.quantite
                or _utc(old.date_mouvement) != _day(record.date_transaction)
                or old.type_mouvement != ('achat' if direction == 1 else 'vente')
                or direction == 1 and old.cout_unitaire != record.prix_unitaire):
            raise HTTPException(409, 'Le mouvement de stock doit être réconcilié avant cette correction.')
    elif rows:
        raise HTTPException(409, 'Un service possède un mouvement de stock inattendu.')
    replacement = None
    if is_inventory_tracked(product):
        purchase = record.id_fournisseur is not None
        cost = Decimal(str(final['prix_unitaire'])) if purchase else (
            old.cout_unitaire if old and old.id_produit == product.id_produit else get_average_unit_cost(db, product.id_produit))
        replacement = {'id_produit': product.id_produit,
            'quantite_delta': str(Decimal(final['quantite']) * (1 if purchase else -1)),
            'cout_unitaire': str(cost), 'type_mouvement': 'achat' if purchase else 'vente',
            'date_mouvement': _day(final['date_transaction']).isoformat()}
    affected = {record.id_produit, product.id_produit}
    balances = {}
    downstream = []
    for product_id in sorted(affected):
        timeline = {}
        for movement in db.query(MouvementStock).filter(MouvementStock.id_produit == product_id).all():
            if old and movement.id_mouvement_stock == old.id_mouvement_stock:
                continue
            key = _utc(movement.date_mouvement)
            timeline[key] = timeline.get(key, Decimal('0')) + movement.quantite_delta
            if movement.source_type == 'transformation':
                downstream.append(movement.id_mouvement_stock)
        if replacement and product_id == replacement['id_produit']:
            key = datetime.fromisoformat(replacement['date_mouvement'])
            timeline[key] = timeline.get(key, Decimal('0')) + Decimal(replacement['quantite_delta'])
        balance = Decimal('0')
        for day, delta in sorted(timeline.items()):
            balance += delta
            if balance < 0:
                raise HTTPException(409, f'La correction rendrait le stock négatif le {day.date().isoformat()}. Corrigez les opérations dépendantes.')
        balances[str(product_id)] = str(balance)
    def snap(m):
        return {'id': m.id_mouvement_stock, 'id_produit': m.id_produit,
                'quantite_delta': str(m.quantite_delta), 'cout_unitaire': str(m.cout_unitaire),
                'date_mouvement': _utc(m.date_mouvement).isoformat()} if m else None
    return {'kind': 'inventory', 'before': snap(old), 'after': replacement,
            'final_quantities': balances, 'preserved_transformation_movements': sorted(downstream)}


def _egg_plan(db, record, final, category, explicit):
    if record.id_client is None or final['id_batiment'] is None:
        raise HTTPException(422, 'Sélectionnez le bâtiment source pour cette vente d’œufs.')
    if not db.get(Batiment, final['id_batiment']):
        raise HTTPException(422, 'Bâtiment introuvable.')
    existing = {a.id_production: {'quantite': a.quantite, 'quantite_livree': a.quantite_livree or 0} for a in record.allocations}
    if not existing and record.id_production:
        existing[record.id_production] = {'quantite': record.quantite, 'quantite_livree': 0}
    if not existing and not record.est_promesse and explicit is None:
        raise HTTPException(409, 'Cette vente historique nécessite une répartition explicite des origines.')
    closed = record.quantite_annulee or 0
    supplied = sum(a['quantite_livree'] for a in existing.values()) if record.est_promesse else 0
    if final['quantite'] < supplied + closed:
        raise HTTPException(409, 'La quantité est inférieure aux œufs livrés et au reliquat clôturé. Enregistrez une correction de livraison explicite.')
    if supplied and final['date_transaction'] > record.date_transaction:
        raise HTTPException(409, 'Une date après une livraison enregistrée nécessite une correction de livraison explicite.')
    rows, balances = source_balances(db, exclude_transaction_id=record.id_transaction, reserve_open_promises=False)
    if any(value < 0 for value in balances.values()):
        raise HTTPException(409, 'Les origines de stock existantes doivent être réconciliées avant cette correction.')
    sources = {p.id_production: p for p in rows}
    existing = dict(sorted(existing.items(), key=lambda item: (
        sources[item[0]].date_production if item[0] in sources else date.min, item[0])))
    cutoff = business_date() if record.est_promesse else final['date_transaction']
    eligible = [p for p in rows if p.id_batiment == final['id_batiment'] and p.date_production <= cutoff
                and (p.type_oeuf, p.calibre if p.type_oeuf == 'normal' else None) == category]
    eligible_ids = {p.id_production for p in eligible}
    desired = {}
    if explicit is not None:
        if len({a['id_production'] for a in explicit}) != len(explicit):
            raise HTTPException(422, 'Chaque origine doit apparaître une seule fois.')
        desired = {a['id_production']: a['quantite'] for a in explicit}
        if final['id_production'] != record.id_production and final['id_production'] is not None and final['id_production'] not in desired:
            raise HTTPException(422, 'La production choisie doit faire partie de la répartition.')
    elif final['id_production'] != record.id_production and final['id_production'] is not None:
        desired = {final['id_production']: final['quantite'] - closed}
    else:
        remaining = final['quantite'] - closed
        # Preserve delivered evidence first, then retain existing reservations.
        for pid, old in existing.items():
            delivered = old['quantite_livree'] if record.est_promesse else 0
            if delivered:
                desired[pid] = delivered
                remaining -= delivered
        for pid, old in existing.items():
            if pid in eligible_ids and remaining:
                used = min(remaining, old['quantite'] - desired.get(pid, 0))
                if used:
                    desired[pid] = desired.get(pid, 0) + used
                    remaining -= used
    if sum(desired.values()) > final['quantite'] - closed:
        raise HTTPException(409, 'La répartition dépasse la quantité de vente.')
    if explicit is not None and record.est_promesse and sum(desired.values()) < min(final['quantite'] - closed, sum(a['quantite'] for a in existing.values())):
        raise HTTPException(409, 'Conservez les réservations de cette commande avant de les proposer aux commandes suivantes.')
    for pid, old in existing.items():
        if record.est_promesse and desired.get(pid, 0) < old['quantite_livree']:
            raise HTTPException(409, 'Une origine déjà livrée doit être conservée.')
    for pid, amount in desired.items():
        if pid not in eligible_ids or amount > balances.get(pid, 0):
            raise HTTPException(409, 'Une origine est indisponible, réservée, incompatible ou postérieure à la vente.')
        balances[pid] -= amount
        source = sources[pid]
        if source.id_cycle is not None:
            cycle = db.get(CycleProduction, source.id_cycle)
            from app.utils.production_cycles import cycle_schedule
            schedule = cycle_schedule(cycle) if cycle else None
            if (not cycle or cycle.id_batiment != source.id_batiment or source.date_production < schedule.date_debut
                    or schedule.date_fin_reelle and source.date_production > schedule.date_fin_reelle):
                raise HTTPException(409, 'Le lot de cette origine de production doit être réconcilié.')
    if explicit is not None or final['id_production'] != record.id_production:
        _, free, reservations = _stock_state(db)
        for pid, amount in desired.items():
            allowance = free.get(pid, 0) + existing.get(pid, {}).get('quantite', 0) + reservations.get(record.id_transaction, {}).get(pid, 0)
            if amount > allowance:
                raise HTTPException(409, 'Cette répartition utiliserait les œufs réservés à une autre commande.')
    # Existing reservations of other orders stay fixed. Newly available units
    # are offered in original creation order, including this deferred order.
    promises = db.query(Transaction).filter(Transaction.est_actif.is_(True), Transaction.est_promesse.is_(True),
        Transaction.id_client.isnot(None)).order_by(Transaction.date_creation, Transaction.id_transaction).all()
    targets = list(promises)
    if not record.est_promesse:
        targets.append(record)
    after = {record.id_transaction: desired}
    for tx in targets:
        target = tx.id_transaction == record.id_transaction
        if target and explicit is not None:
            continue
        alloc = desired if target else {a.id_production: a.quantite for a in tx.allocations}
        pending = (final['quantite'] - closed if target else tx.quantite - (tx.quantite_annulee or 0)) - sum(alloc.values())
        product = db.get(Produit, tx.id_produit) if not target else None
        cat = category if target else parse_sellable_egg_product_name(product.nom_produit)
        building = final['id_batiment'] if target else tx.id_batiment
        limit = cutoff if target else business_date()
        for p in rows:
            if pending <= 0:
                break
            if p.id_batiment != building or p.date_production > limit or (p.type_oeuf, p.calibre if p.type_oeuf == 'normal' else None) != cat:
                continue
            used = min(pending, max(0, balances[p.id_production]))
            if used:
                alloc[p.id_production] = alloc.get(p.id_production, 0) + used
                balances[p.id_production] -= used
                pending -= used
        if target and pending and not record.est_promesse:
            raise HTTPException(409, 'Stock insuffisant. Une livraison différée nécessite une opération explicite.')
        if target or alloc != {a.id_production: a.quantite for a in tx.allocations}:
            after[tx.id_transaction] = alloc
    if not record.est_promesse and sum(desired.values()) != final['quantite']:
        raise HTTPException(409, 'La répartition doit couvrir la totalité de cette vente.')
    before = {}
    changes = {}
    for tid, alloc in after.items():
        tx = record if tid == record.id_transaction else db.get(Transaction, tid)
        before[str(tid)] = [{'id_production': a.id_production, 'quantite': a.quantite, 'quantite_livree': a.quantite_livree or 0} for a in sorted(tx.allocations, key=lambda a:a.id_production)]
        delivered = {a.id_production: a.quantite_livree or 0 for a in tx.allocations}
        changes[str(tid)] = [{'id_production': pid, 'quantite': amount, 'quantite_livree': delivered.get(pid, 0)} for pid, amount in sorted(alloc.items())]
    first = min((sources[pid] for pid in desired), key=lambda p: (p.date_production,p.id_production)) if desired else None
    if final['id_production'] in desired:
        first = sources[final['id_production']]
    pointer = (record.id_production if record.id_production in desired else None) if record.est_promesse else (first.id_production if first else None)
    cycle = sources[pointer].id_cycle if pointer is not None else None
    return {'kind': 'eggs', 'before': before, 'after': changes,
            'source': pointer, 'cycle': cycle,
            'reservation_priority': 'date_creation,id_transaction'}


def apply_stock_plan(db, record, plan, actor, operation_id, reason):
    if plan['kind'] == 'inventory':
        old = db.get(MouvementStock, plan['before']['id']) if plan['before'] else None
        if old:
            inverse = record_movement(db, id_produit=old.id_produit, quantite_delta=-old.quantite_delta,
                cout_unitaire=old.cout_unitaire, type_mouvement='reversal', source_type=old.source_type,
                source_id=old.source_id, id_mouvement_inverse=old.id_mouvement_stock,
                date_mouvement=old.date_mouvement, id_utilisateur=actor.id_utilisateur,
                notes=f'Correction {operation_id}: {reason}')
            old.id_mouvement_inverse = inverse.id_mouvement_stock
            db.flush()
        new = plan['after']
        if new:
            record_movement(db, **{**new, 'quantite_delta': Decimal(new['quantite_delta']),
                'cout_unitaire': Decimal(new['cout_unitaire']), 'date_mouvement': datetime.fromisoformat(new['date_mouvement'])},
                source_type='transaction', source_id=record.id_transaction, id_utilisateur=actor.id_utilisateur,
                notes=f'Correction {operation_id}: {reason}')
    else:
        from app.models.audit import TransactionAudit
        import json
        for tid, allocations in plan['after'].items():
            tx = record if int(tid) == record.id_transaction else db.get(Transaction, int(tid))
            current = {a.id_production: a for a in tx.allocations}
            wanted = {a['id_production'] for a in allocations}
            for pid, allocation in current.items():
                if pid not in wanted:
                    tx.allocations.remove(allocation)
            for allocation in allocations:
                pid = allocation['id_production']
                if pid in current:
                    current[pid].quantite = allocation['quantite']
                else:
                    tx.allocations.append(EggAllocation(**allocation))
            if plan['before'][tid] != allocations:
                db.add(TransactionAudit(id_transaction=tx.id_transaction, id_utilisateur=actor.id_utilisateur,
                    champ_modifie='correction_stock', ancienne_valeur=json.dumps(plan['before'][tid]),
                    nouvelle_valeur=json.dumps({'operation_id': str(operation_id), 'allocations': allocations})))
                if tx is not record:
                    tx.stock_revision += 1
                    tx.id_utilisateur_modification = actor.id_utilisateur
                    tx.date_modification = datetime.now(timezone.utc)
