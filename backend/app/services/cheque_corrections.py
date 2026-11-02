"""Validate the complete cheque settlement before replacing its ledger effect."""
from datetime import datetime, time, timezone
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import case, func
from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.paiement import Paiement
from app.utils.business_date import business_date

CHEQUE_FIELDS = {'date_paiement', 'date_encaissement_effective', 'statut_cheque'}


def validate_cheque_correction(db, payment, transaction, requested):
    if set(requested) - (CHEQUE_FIELDS | {'notes'}):
        raise HTTPException(422, 'Cette correction conserve le montant et la source du chèque.')
    if not CHEQUE_FIELDS.intersection(requested):
        return requested
    if payment.statut == 'annule' or not transaction or not transaction.est_actif:
        raise HTTPException(409, 'Un enregistrement annulé nécessite le parcours de restauration.')
    if db.query(Paiement.id_paiement).filter(Paiement.id_transaction == payment.id_transaction,
            Paiement.statut != 'annule', Paiement.nature.in_(['remboursement', 'credit_recu', 'credit_transfere'])).first():
        raise HTTPException(409, 'Traitez les remboursements ou affectations liés avant de corriger ce chèque.')
    issue = requested.get('date_paiement', payment.date_paiement)
    state = requested.get('statut_cheque', payment.statut_cheque)
    cleared = requested.get('date_encaissement_effective', payment.date_encaissement_effective)
    if state not in {'emis', 'a_encaisser', 'encaisse', 'rejete', 'annule'} or issue is None:
        raise HTTPException(422, 'Renseignez la date et le statut du chèque.')
    if issue < transaction.date_transaction or issue > business_date():
        raise HTTPException(422, 'La date du chèque doit être comprise entre la transaction et aujourd’hui.')
    if state == 'encaisse':
        if cleared is None or not issue <= cleared <= business_date():
            raise HTTPException(422, 'Renseignez une date d’encaissement comprise entre le chèque et aujourd’hui.')
    else:
        if 'date_encaissement_effective' in requested and cleared is not None:
            raise HTTPException(422, 'Un chèque non encaissé ne conserve pas de date d’encaissement.')
        requested['date_encaissement_effective'] = None
    requested['statut'] = 'valide' if state == 'encaisse' else 'rejete' if state in {'rejete', 'annule'} else 'en_attente'
    cash = db.query(Caisse).filter(Caisse.id_paiement == payment.id_paiement, Caisse.statut == 'active').all()
    bank = db.query(MouvementBancaire).filter(MouvementBancaire.id_paiement == payment.id_paiement, MouvementBancaire.statut == 'active').all()
    bank_funded = transaction.id_fournisseur is not None and payment.source_reglement == 'banque'
    movements = bank if bank_funded else cash
    if len(movements) != int(payment.est_effectif) or (cash if bank_funded else bank):
        raise HTTPException(409, 'Réconciliez les mouvements du chèque avant cette correction.')
    for movement in movements:
        day = payment.date_encaissement_effective or payment.date_paiement
        actual_day = movement.date_mouvement.replace(tzinfo=timezone.utc) if movement.date_mouvement.tzinfo is None else movement.date_mouvement
        if (movement.montant != payment.montant or movement.type_mouvement != payment.ledger_direction(transaction)
            or actual_day != datetime.combine(day, time.min, tzinfo=timezone.utc)
            or movement.id_charge is not None or movement.id_avance is not None
            or bank_funded and (movement.id_compte != payment.id_compte or movement.source != 'cheque'
                or movement.reference != (payment.reference_virement or payment.numero_cheque))
            or not bank_funded and (movement.id_transaction != payment.id_transaction or movement.id_cession is not None)):
            raise HTTPException(409, 'Le mouvement enregistré ne correspond pas au chèque.')
    if bank_funded:
        account = db.get(CompteBancaire, payment.id_compte)
        total = db.query(func.coalesce(func.sum(case((MouvementBancaire.type_mouvement == 'ENTREE', MouvementBancaire.montant),
            else_=-MouvementBancaire.montant)), 0)).filter(MouvementBancaire.id_compte == payment.id_compte,
            MouvementBancaire.statut == 'active').scalar()
        if not account or Decimal(str(account.solde_actuel)) != Decimal(str(total)):
            raise HTTPException(409, 'Réconciliez le solde bancaire avant cette correction.')
    return requested
