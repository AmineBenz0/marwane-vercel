"""One reconciled dependency snapshot for refunds and credit allocations."""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy import or_
from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.paiement import Paiement
from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
from app.models.lettre_credit import LettreDeCredit
from app.models.lettre_credit_utilisation import LettreCreditUtilisation
from app.services.financial import payment_effective_date


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
    # Align locks with the LC correction path: transactions -> LCs -> payments.
    lc_ids = sorted({ref for (ref,) in db.query(Paiement.id_lc).filter(
        Paiement.id_transaction.in_(sorted(by_id)), Paiement.id_lc.isnot(None)
    ).all()})
    lcs = rows(LettreDeCredit, LettreDeCredit.id_lc.in_(lc_ids), LettreDeCredit.id_lc)
    lc_by_id = {lc.id_lc: lc for lc in lcs}
    if len(lcs) != len(lc_ids):
        raise HTTPException(409, 'Une lettre de crédit liée est introuvable.')
    payments = rows(Paiement, Paiement.id_transaction.in_(sorted(by_id)), Paiement.id_paiement)
    uses = rows(LettreCreditUtilisation, LettreCreditUtilisation.id_lc.in_(lc_ids),
                LettreCreditUtilisation.id_utilisation)
    active_uses = {u.id_lc: u for u in uses if u.statut == 'active'}
    if len(active_uses) != sum(u.statut == 'active' for u in uses):
        raise HTTPException(409, 'Une LC possède plusieurs utilisations actives.')
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
        if p.statut != 'annule' and p.type_paiement == 'cheque':
            if p.statut != 'valide' or p.statut_cheque != 'encaisse' or p.date_encaissement_effective is None:
                raise HTTPException(409, 'Un chèque non encaissé ne peut pas financer un remboursement ou un crédit.')
        if p.statut != 'annule' and (p.type_paiement == 'lc' or p.id_lc is not None):
            lc = lc_by_id.get(p.id_lc)
            if (p.type_paiement != 'lc' or lc is None or
                p.nature != 'paiement' or p.statut != 'valide' or
                p.id_compte is not None or p.source_reglement is not None or
                p.montant != lc.montant or p.role_lc not in ('reception', 'utilisation')):
                raise HTTPException(409, 'Le règlement LC doit être réconcilié avant toute opération de crédit.')
            if p.role_lc == 'reception':
                if lc.id_client_origine != transaction.id_client or transaction.id_fournisseur is not None:
                    raise HTTPException(409, 'La réception de LC ne correspond pas au client d’origine.')
            else:
                use = active_uses.get(lc.id_lc)
                if (transaction.id_fournisseur is None or transaction.id_client is not None
                    or lc.id_fournisseur != transaction.id_fournisseur
                    or lc.statut_cycle != 'transferee' or lc.statut != 'utilisee'
                    or use is None or use.id_paiement != p.id_paiement
                    or use.id_fournisseur != transaction.id_fournisseur):
                    raise HTTPException(409, 'L’utilisation fournisseur de LC doit être réconciliée.')
        movements = linked.get(p.id_paiement, [])
        expected_movements = 1 if p.est_effectif and not p.est_affectation and p.type_paiement != 'lc' else 0
        if len(movements) != expected_movements:
            raise HTTPException(409, 'Réconciliez les mouvements de cette transaction avant cette opération.')
        for m in movements:
            expected_bank = p.id_compte is not None and (p.source_reglement == 'banque'
                or p.source_reglement is None and p.type_paiement == 'virement')
            if (m.montant != p.montant or m.type_mouvement != p.ledger_direction(transaction)
                or m.date_mouvement.date() != payment_effective_date(p) or m.id_avance is not None
                or isinstance(m, MouvementBancaire) != expected_bank
                or expected_bank and (m.id_compte != p.id_compte or m.source != p.type_paiement
                    or m.reference != (p.reference_virement or p.numero_cheque) or m.id_charge is not None)
                or isinstance(m, Caisse) and (m.id_transaction != transaction.id_transaction or m.id_charge or m.id_cession)):
                raise HTTPException(409, 'Un mouvement ne correspond pas au règlement. Réconciliez-le avant cette opération.')
    # Phase 4 always changes quantite_annulee/row_version in the locked sale,
    # so an older refund preview has a changed fingerprint. Include the posted
    # commercial ledger for additional audit/replay transparency.
    # On the Release 3 baseline every quantite_annulee is zero and the Phase 2
    # table is not yet installed. Avoid querying it in those compatibility jobs.
    commercial_credits = []
    if any((t.quantite_annulee or 0) > 0 for t in transactions):
        commercial_credits = db.query(DeferredSaleAdjustment).filter(
            DeferredSaleAdjustment.id_transaction.in_(sorted(by_id)),
        ).order_by(
            DeferredSaleAdjustment.id_transaction,
            DeferredSaleAdjustment.date_effet,
            DeferredSaleAdjustment.id_avoir,
        ).all()
    for transaction in transactions:
        db.expire(transaction, ['paiements', 'avoirs_livraison_differee'])
    return {'transactions': [row_snapshot(t) for t in sorted(transactions, key=lambda t: t.id_transaction)],
            'commercial_credits': [row_snapshot(a) for a in commercial_credits],
            'letters_credit': [row_snapshot(lc) for lc in lcs],
            'lc_usage': [row_snapshot(u) for u in uses], 'payments': [row_snapshot(p) for p in payments], 'cash': [row_snapshot(m) for m in cash],
            'bank': [row_snapshot(m) for m in bank], 'accounts': [row_snapshot(a) for a in accounts]}
