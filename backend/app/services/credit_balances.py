"""Set-based unallocated advances, shared by contacts and financial position."""
from decimal import Decimal
from sqlalchemy import func
from sqlalchemy.orm import aliased
from app.models.credit import Avance, AffectationCredit


def advance_balances(db, *, direction, contact_ids=None, as_of=None):
    column = Avance.id_client if direction == 'receivable' else Avance.id_fournisseur
    allocations = db.query(AffectationCredit.id_avance.label('id_avance'),
        func.sum(AffectationCredit.montant).label('used')).filter(AffectationCredit.statut == 'active')
    returned = aliased(Avance)
    returns = db.query(returned.id_origine.label('id_avance'), func.sum(returned.montant).label('returned')).filter(
        returned.nature == 'retour_avance', returned.statut == 'active')
    if as_of:
        allocations = allocations.filter(AffectationCredit.date_effet <= as_of)
        returns = returns.filter(returned.date_effet <= as_of)
    allocations = allocations.group_by(AffectationCredit.id_avance).subquery()
    returns = returns.group_by(returned.id_origine).subquery()
    query = db.query(column.label('contact'), func.sum(Avance.montant - func.coalesce(allocations.c.used, 0)
        - func.coalesce(returns.c.returned, 0)).label('available')).outerjoin(
        allocations, allocations.c.id_avance == Avance.id_avance).outerjoin(
        returns, returns.c.id_avance == Avance.id_avance).filter(
        Avance.nature == 'avance', Avance.statut == 'active', column.isnot(None))
    if contact_ids is not None:
        if not contact_ids:
            return {}
        query = query.filter(column.in_(contact_ids))
    if as_of:
        query = query.filter(Avance.date_effet <= as_of)
    return {r.contact: Decimal(str(r.available)) for r in query.group_by(column).all()}
