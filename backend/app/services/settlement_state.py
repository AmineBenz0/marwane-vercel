"""One reconciled dependency snapshot for refunds and credit allocations."""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy import or_
from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.paiement import Paiement


def json_value(value):
    if isinstance(value, Decimal):
        return format(value, 'f')
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def row_snapshot(row):
    return {c.name: json_value(getattr(row, c.name)) for c in row.__table__.columns}


def settlement_state(db, transactions, *, account_id=None, lock=False, lock_accounts=True):
    """Lock payments, movements and accounts once, in deterministic order."""
    def rows(model, predicate, key):
        query = db.query(model).filter(predicate).order_by(key).populate_existing()
        return (query.with_for_update() if lock else query).all()

    by_id = {t.id_transaction: t for t in transactions}
    payments = rows(Paiement, Paiement.id_transaction.in_(sorted(by_id)), Paiement.id_paiement)
    by_payment = {p.id_paiement: p for p in payments}
    ids = sorted(by_payment)
    cash = rows(Caisse, or_(Caisse.id_paiement.in_(ids), Caisse.id_transaction.in_(sorted(by_id))), Caisse.id_mouvement)
    bank = rows(MouvementBancaire, MouvementBancaire.id_paiement.in_(ids), MouvementBancaire.id_mouvement)
    account_ids = {m.id_compte for m in bank}
    if account_id is not None:
        account_ids.add(account_id)
    query = db.query(CompteBancaire).filter(CompteBancaire.id_compte.in_(sorted(account_ids))).order_by(CompteBancaire.id_compte).populate_existing()
    accounts = (query.with_for_update() if lock and lock_accounts else query).all()
    if account_id and account_id not in {a.id_compte for a in accounts}:
        raise HTTPException(404, 'Compte bancaire introuvable.')
    linked = {}
    for movement in cash + bank:
        if movement.statut == 'active':
            if movement.id_paiement not in by_payment:
                raise HTTPException(409, 'Réconciliez les mouvements sans règlement associé avant cette opération.')
            linked.setdefault(movement.id_paiement, []).append(movement)
    for p in payments:
        transaction = by_id[p.id_transaction]
        if p.statut != 'annule' and (p.type_paiement in {'cheque', 'lc'} or p.id_lc):
            raise HTTPException(409, 'Cette opération nécessite le traitement dédié du chèque ou de la lettre de crédit.')
        movements = linked.get(p.id_paiement, [])
        if len(movements) != (1 if p.est_effectif and not p.est_affectation else 0):
            raise HTTPException(409, 'Réconciliez les mouvements de cette transaction avant cette opération.')
        for m in movements:
            expected_bank = p.id_compte is not None and (p.source_reglement == 'banque'
                or p.source_reglement is None and p.type_paiement == 'virement')
            if (m.montant != p.montant or m.type_mouvement != p.ledger_direction(transaction)
                or m.date_mouvement.date() != p.date_paiement or m.id_avance is not None
                or isinstance(m, MouvementBancaire) != expected_bank
                or expected_bank and (m.id_compte != p.id_compte or m.source != p.type_paiement
                    or m.reference != (p.reference_virement or p.numero_cheque) or m.id_charge is not None)
                or isinstance(m, Caisse) and (m.id_transaction != transaction.id_transaction or m.id_charge or m.id_cession)):
                raise HTTPException(409, 'Un mouvement ne correspond pas au règlement. Réconciliez-le avant cette opération.')
    for transaction in transactions:
        db.expire(transaction, ['paiements'])
    return {'transactions': [row_snapshot(t) for t in sorted(transactions, key=lambda t: t.id_transaction)],
            'payments': [row_snapshot(p) for p in payments], 'cash': [row_snapshot(m) for m in cash],
            'bank': [row_snapshot(m) for m in bank], 'accounts': [row_snapshot(a) for a in accounts]}
