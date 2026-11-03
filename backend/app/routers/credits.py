"""Contact-level advances and preserved historical credit operations."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import date
from app.database import get_db
from app.models.credit import Avance, AffectationCredit
from app.models.correction_operation import CorrectionOperation
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.schemas.credit import CreditCommand, CreditApply
from app.services.credits import available_sources, party_credit_history, preview_credit, apply_credit
from app.services.financial import query_financial_transactions
from app.services.settlement_state import row_snapshot
from app.utils.dependencies import get_current_active_user
from app.schemas.advance_settlement import AdvanceSettlementCommand, AdvanceSettlementApply
from app.services.advance_settlements import apply_settlement

router = APIRouter(prefix='/credits', tags=['Avances et crédits'])


def _allocation_retired():
    raise HTTPException(410, 'Les avances sont comptabilisées dans le solde global du contact. Les nouvelles affectations aux transactions ne sont plus proposées.')


@router.get('/settlements/options')
def settlement_options(id_transaction: int | None = Query(None, gt=0), id_client: int | None = Query(None, gt=0),
                       id_fournisseur: int | None = Query(None, gt=0), date_effet: date | None = None, id_avance: UUID | None = None,
                       db: Session = Depends(get_db), actor: Utilisateur = Depends(get_current_active_user)):
    _allocation_retired()


@router.post('/settlements/preview')
def settlement_preview(command: AdvanceSettlementCommand, db: Session = Depends(get_db),
                       actor: Utilisateur = Depends(get_current_active_user)):
    _allocation_retired()


@router.post('/settlements/apply')
def settlement_apply(body: AdvanceSettlementApply, db: Session = Depends(get_db),
                     actor: Utilisateur = Depends(get_current_active_user)):
    if db.get(CorrectionOperation, body.command.operation_id) is None:
        _allocation_retired()
    return apply_settlement(db, body.command, body.dependency_fingerprint, actor)


@router.get('/sources')
def sources(transaction_id: int = Query(gt=0), db: Session = Depends(get_db),
            actor: Utilisateur = Depends(get_current_active_user)):
    return available_sources(db, transaction_id)


@router.get('/party')
def party(id_client: int | None = Query(None, gt=0), id_fournisseur: int | None = Query(None, gt=0),
          db: Session = Depends(get_db), actor: Utilisateur = Depends(get_current_active_user)):
    return party_credit_history(db, id_client=id_client, id_fournisseur=id_fournisseur)


@router.get('/targets')
def targets(id_avance: UUID, db: Session = Depends(get_db), actor: Utilisateur = Depends(get_current_active_user)):
    advance = db.get(Avance, id_avance)
    if advance is None or advance.nature != 'avance' or advance.statut != 'active':
        raise HTTPException(404, 'Avance disponible introuvable.')
    rows = query_financial_transactions(db, direction='receivable' if advance.id_client is not None else 'payable',
        id_tiers=advance.id_client or advance.id_fournisseur)
    return [{'id_transaction': t.id_transaction, 'date_transaction': t.date_transaction.isoformat(),
             'montant_restant': str(t.montant_restant), 'produit_nom': t.produit.nom_produit}
            for t in rows if t.montant_restant > 0]


@router.get('/allocations')
def allocations(transaction_id: int = Query(gt=0), db: Session = Depends(get_db),
                actor: Utilisateur = Depends(get_current_active_user)):
    if db.get(Transaction, transaction_id) is None:
        raise HTTPException(404, 'Transaction introuvable.')
    return [row_snapshot(a) for a in db.query(AffectationCredit).filter(or_(
        AffectationCredit.id_transaction_cible == transaction_id,
        AffectationCredit.id_transaction_source == transaction_id)).order_by(AffectationCredit.date_effet.desc(), AffectationCredit.id_affectation).all()]


@router.post('/preview')
def preview(command: CreditCommand, db: Session = Depends(get_db), actor: Utilisateur = Depends(get_current_active_user)):
    if command.action == 'allocate':
        _allocation_retired()
    return preview_credit(db, command)


@router.post('/apply')
def apply(body: CreditApply, db: Session = Depends(get_db), actor: Utilisateur = Depends(get_current_active_user)):
    if body.command.action == 'allocate' and db.get(CorrectionOperation, body.command.operation_id) is None:
        _allocation_retired()
    return apply_credit(db, body.command, body.dependency_fingerprint, actor)
