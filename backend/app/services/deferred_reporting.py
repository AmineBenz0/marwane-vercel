"""Read completion events without creating financial or stock ledger entries."""
import json
from collections import defaultdict
from datetime import date
from app.models.audit import TransactionAudit


def completion_events(db, transaction_ids):
    grouped = defaultdict(list)
    if not transaction_ids:
        return grouped
    rows = db.query(TransactionAudit).filter(
        TransactionAudit.id_transaction.in_(transaction_ids),
        TransactionAudit.champ_modifie == 'completion_livraison_differee',
    ).order_by(TransactionAudit.date_changement, TransactionAudit.id_audit).all()
    for row in rows:
        data = json.loads(row.nouvelle_valeur)
        grouped[row.id_transaction].append(dict(
            id=row.id_audit, date=data['date'], quantite=data['quantite_completee'],
            quantite_couverte=data['quantite_couverte'], avant=int(row.ancienne_valeur),
            repartition_stock=data.get('repartition_stock', []),
            quantite_totale=data.get('quantite_totale'),
            id_utilisateur=row.id_utilisateur,
        ))
    return grouped


def covered_quantity(transaction, events, target, cumulative):
    if not transaction.est_promesse:
        return transaction.quantite
    initial = events[0]['avant'] if events else transaction.quantite_couverte
    quantity = initial if (transaction.date_transaction <= target if cumulative else transaction.date_transaction == target) else 0
    quantity += sum(event['quantite'] for event in events
                    if (date.fromisoformat(event['date']) <= target if cumulative
                        else date.fromisoformat(event['date']) == target))
    return quantity


def initial_stock_event(transaction, events):
    """Show the audited baseline; only reconstruct sources when every delta is known."""
    initial = events[0]['avant'] if events else transaction.quantite_couverte
    remaining = {a.id_production: a.quantite for a in transaction.allocations}
    traceable = all(sum(s['quantite'] for s in e['repartition_stock']) == e['quantite'] for e in events)
    for event in events:
        for source in event['repartition_stock']:
            source_id = source['id_production']
            remaining[source_id] = remaining.get(source_id, 0) - source['quantite']
    traceable = traceable and all(q >= 0 for q in remaining.values()) and sum(remaining.values()) == initial
    sources = [dict(id_production=a.id_production, quantite=remaining[a.id_production],
                    date_production=a.production.date_production.isoformat(), id_cycle=a.production.id_cycle)
               for a in transaction.allocations if traceable and remaining[a.id_production] > 0]
    return dict(id='initial', type='initial', date=transaction.date_transaction.isoformat(),
                quantite=initial, repartition_stock=sources,
                id_utilisateur=transaction.id_utilisateur_creation)
