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
