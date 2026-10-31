"""Owner-readable correction history and revalidated reuse proposals."""
from sqlalchemy import and_, or_, select

from app.models.correction_operation import CorrectionOperation, EntityRevision
from app.models.paiement import Paiement
from app.models.user import Utilisateur
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.produit import Produit
from app.models.batiment import Batiment
from app.models.production import Production
from app.models.compte_bancaire import CompteBancaire
from app.schemas.correction import CorrectionChanges


def transaction_correction_history(db, transaction_id, *, offset=0, limit=20):
    payment_ids = select(Paiement.id_paiement).where(Paiement.id_transaction == transaction_id)
    operation_ids = select(EntityRevision.operation_id).where(or_(
        and_(EntityRevision.entity_type == 'transaction', EntityRevision.entity_id == transaction_id),
        and_(EntityRevision.entity_type == 'paiement', EntityRevision.entity_id.in_(payment_ids)),
    ))
    rows = db.query(CorrectionOperation, Utilisateur.nom_utilisateur).join(
        Utilisateur, CorrectionOperation.id_utilisateur == Utilisateur.id_utilisateur).filter(
        CorrectionOperation.operation_id.in_(operation_ids)).order_by(
        CorrectionOperation.recorded_at.desc(), CorrectionOperation.operation_id.desc()).offset(offset).limit(limit + 1).all()
    revisions = db.query(EntityRevision).filter(EntityRevision.operation_id.in_(
        [operation.operation_id for operation, _ in rows[:limit]])).order_by(EntityRevision.revision).all() if rows else []
    revision_map = {}
    for revision in revisions:
        revision_map.setdefault((revision.operation_id, revision.entity_type, revision.entity_id), revision)
    items = []
    for operation, actor_name in rows[:limit]:
        target = operation.request_payload['target']
        revision = revision_map.get((operation.operation_id, target['entity_type'], target['entity_id']))
        before = revision.before_snapshot if revision and revision.before_snapshot else {}
        after = operation.result_payload.get('record', {})
        allowed = ({'date_transaction', 'date_echeance', 'prix_unitaire', 'quantite',
                    'id_client', 'id_fournisseur', 'id_produit', 'id_batiment', 'id_production'}
                   if target['entity_type'] == 'transaction' else
                   {'date_paiement', 'montant', 'type_paiement', 'id_compte', 'source_reglement', 'notes'})
        changes = operation.request_payload.get('changes', {})
        reuse = {key: before[key] for key in changes.keys() & allowed & CorrectionChanges.model_fields.keys()
                 if key in before and before[key] != after.get(key)}
        stock = operation.result_payload.get('impact', {}).get('stock')
        if isinstance(stock, dict) and stock.get('kind') == 'eggs':
            allocations = stock['before'].get(str(target['entity_id']), [])
            if not allocations and before.get('id_production'):
                quantity = before['quantite'] - (before.get('quantite_annulee') or 0)
                if quantity > 0:
                    allocations = [dict(id_production=before['id_production'], quantite=quantity)]
            if allocations:
                reuse['stock_allocations'] = [{'id_production': a['id_production'], 'quantite': a['quantite']}
                                             for a in allocations]
            else:
                # Unknown historical provenance cannot be recreated by clearing
                # the current pointer; keep only independently reusable values.
                reuse.pop('id_production', None)
        items.append(dict(operation_id=str(operation.operation_id), reason=operation.reason,
            recorded_at=operation.recorded_at, actor_name=actor_name, target=target,
            before=before, after=after, changes=changes,
            impact=operation.result_payload.get('impact', {}), reuse_changes=reuse))
    names = {}
    for key, model, label in [('id_client', Client, 'nom_client'), ('id_fournisseur', Fournisseur, 'nom_fournisseur'),
                              ('id_produit', Produit, 'nom_produit'), ('id_batiment', Batiment, 'nom'),
                              ('id_compte', CompteBancaire, 'nom_banque')]:
        ids = {snapshot[key] for item in items for snapshot in (item['before'], item['after']) if snapshot.get(key)}
        names[key] = {row[0]: row[1] for row in db.query(getattr(model, key), getattr(model, label)).filter(
            getattr(model, key).in_(ids)).all()} if ids else {}
    production_ids = set()
    for item in items:
        stock = item['impact'].get('stock')
        if isinstance(stock, dict) and stock.get('kind') == 'eggs':
            production_ids.update(row['id_production'] for state in ('before', 'after')
                                  for allocations in stock[state].values() for row in allocations)
    names['id_production'] = {row.id_production: f"Production du {row.date_production.strftime('%d/%m/%y')}"
                              for row in db.query(Production).filter(Production.id_production.in_(production_ids)).all()} if production_ids else {}
    return dict(items=items, names=names, has_more=len(rows) > limit, next_offset=offset + len(items))
