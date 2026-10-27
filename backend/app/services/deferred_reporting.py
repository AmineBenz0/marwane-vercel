"""Read deferred-sale stock events without changing financial ledgers."""
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
        TransactionAudit.champ_modifie.in_([
            'completion_livraison_differee', 'reservation_automatique_stock',
            'replanification_livraison_differee', 'annulation_reste_livraison_differee',
            'annulation_transaction_differee', 'reactivation_transaction_differee',
        ]),
    ).order_by(TransactionAudit.date_changement, TransactionAudit.id_audit).all()
    for row in rows:
        data = json.loads(row.nouvelle_valeur)
        if row.champ_modifie == 'replanification_livraison_differee':
            grouped[row.id_transaction].append(dict(
                id=row.id_audit, type='reschedule', date=row.date_changement.date().isoformat(),
                date_avant=json.loads(row.ancienne_valeur)['date'],
                date_apres=data['date'], quantite=0, repartition_stock=[],
                id_utilisateur=row.id_utilisateur,
            ))
        elif row.champ_modifie in ('annulation_transaction_differee', 'reactivation_transaction_differee'):
            grouped[row.id_transaction].append(dict(
                id=row.id_audit,
                type='cancel_transaction' if row.champ_modifie == 'annulation_transaction_differee' else 'reactivate_transaction',
                date=data['date'], quantite=0, repartition_stock=[],
                raison=data.get('raison'), paiements_annules=data.get('paiements_annules', []),
                id_utilisateur=row.id_utilisateur,
            ))
        elif row.champ_modifie == 'annulation_reste_livraison_differee':
            grouped[row.id_transaction].append(dict(
                id=row.id_audit, type='cancel_remainder', date=data['date'],
                quantite=data['quantite_annulee'], quantite_couverte=data['quantite_couverte'],
                quantite_totale=data['quantite_totale'], repartition_stock=data.get('repartition_stock_libere', []),
                id_utilisateur=row.id_utilisateur,
            ))
        else:
            automatic = row.champ_modifie == 'reservation_automatique_stock'
            grouped[row.id_transaction].append(dict(
                id=row.id_audit, type='reservation' if automatic else 'completion',
                date=data['date'], quantite=data['quantite_attribuee'] if automatic else data['quantite_completee'],
                quantite_couverte=data['quantite_couverte'], avant=int(row.ancienne_valeur),
                repartition_stock=data.get('repartition_stock', []),
                quantite_totale=data.get('quantite_totale'),
                id_utilisateur=row.id_utilisateur,
            ))
    return grouped


def covered_quantity(transaction, events, target, cumulative):
    if not transaction.est_promesse:
        return transaction.quantite
    completion_events = [event for event in events if event['type'] == 'completion']
    initial = max(0, transaction.quantite_completee - sum(event['quantite'] for event in completion_events))
    quantity = initial if (transaction.date_transaction <= target if cumulative else transaction.date_transaction == target) else 0
    quantity += sum(event['quantite'] for event in completion_events
                    if (date.fromisoformat(event['date']) <= target if cumulative
                        else date.fromisoformat(event['date']) == target))
    return quantity


def canceled_quantity(transaction, events, target, cumulative):
    cancellations = [event for event in events if event['type'] == 'cancel_remainder']
    if not cancellations:
        return transaction.quantite_annulee or 0
    return sum(event['quantite'] for event in cancellations
               if (date.fromisoformat(event['date']) <= target if cumulative
                   else date.fromisoformat(event['date']) == target))


def initial_stock_event(transaction, events):
    """Show the audited baseline; only reconstruct sources when every delta is known."""
    completion_events = [event for event in events if event['type'] == 'completion']
    initial = max(0, transaction.quantite_completee - sum(event['quantite'] for event in completion_events))
    remaining = {a.id_production: (a.quantite_livree or 0) for a in transaction.allocations}
    traceable = all(sum(s['quantite'] for s in e['repartition_stock']) == e['quantite'] for e in completion_events)
    for event in completion_events:
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
