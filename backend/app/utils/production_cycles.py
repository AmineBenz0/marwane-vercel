from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.models.cycle_production import CycleProduction
from app.models.lot_production import LotProduction
from app.models.production import Production


ACTIVE_CYCLE_STATUSES = ("actif", "a_cloturer")
DEFAULT_LOT_DURATION_WEEKS = 100
PULLET_PHASE_END_WEEK = 17


def calculate_cycle_end_date(start_date: date, duration_weeks: int) -> date:
    return start_date + timedelta(weeks=duration_weeks) - timedelta(days=1)


def get_cycle_phase(age_weeks: int, duration_weeks: int = DEFAULT_LOT_DURATION_WEEKS) -> tuple[str, str]:
    if age_weeks >= 86:
        return "reforme", "Réforme"
    if age_weeks <= PULLET_PHASE_END_WEEK:
        return "elevage", "Phase elevage"
    return "ponte", "Phase ponte"


FORMULA_RANGES = [
    (0, 17, "17-1% Sem vita"),
    (18, 25, "25-1% Sem vita"),
    (26, 35, "26-35 Sem"),
    (36, 45, "36-45 Sem"),
    (46, 55, "46-55 Sem"),
    (56, 65, "56-65 Sem"),
    (66, 75, "66-75 Sem"),
    (76, 85, "76-85 Sem"),
    (86, None, "86-Réforme"),
]


def suggested_formula(age_weeks: int) -> str:
    return next(label for first, last, label in FORMULA_RANGES
                if age_weeks >= first and (last is None or age_weeks <= last))


def carried_formula(formula: Optional[str], source_age: int, target_age: int) -> str:
    """Resume the schedule once it has met a saved exception, even across gaps."""
    normal = suggested_formula(target_age)
    bounds = next(((first, last) for first, last, label in FORMULA_RANGES
                   if label == formula), None)
    if not bounds or target_age < source_age:
        return normal
    first, last = bounds
    if first <= target_age and (last is None or source_age <= last):
        return normal
    return formula


def formula_for_cycle(db: Session, cycle: CycleProduction, target_date: date) -> str:
    """Daily facts are the dated formula history; never borrow from another lot."""
    schedule = cycle_schedule(cycle)
    target_age = schedule.age_depart_semaines + max((target_date - schedule.date_debut).days, 0) // 7
    previous = db.query(Production).filter(
        Production.id_cycle == cycle.id_cycle,
        Production.est_actif.is_(True),
        Production.date_production >= schedule.date_debut,
        Production.date_production <= target_date,
    ).order_by(
        Production.date_production.desc(),
        # The shared formula is stored on just one of the day's egg-type rows.
        Production.formule.isnot(None).desc(),
        Production.id_production.asc(),
    ).first()
    if previous is None:
        return suggested_formula(target_age)
    source_age = schedule.age_depart_semaines + (previous.date_production - schedule.date_debut).days // 7
    return carried_formula(previous.formule, source_age, target_age)


def refresh_cycle_status(db: Session, cycle: Optional[CycleProduction], today: Optional[date] = None) -> Optional[CycleProduction]:
    # Only an explicit user action closes a flock, including legacy overdue lots.
    if cycle and cycle.statut == "a_cloturer":
        # The parent lot owns lifecycle state and syncs the compatibility snapshot.
        target = getattr(cycle, "lot", None) or cycle
        target.statut = "actif"
        db.flush()
    return cycle


def find_cycle_for_date(db: Session, id_batiment: int, target_date: date) -> Optional[CycleProduction]:
    start_date = func.coalesce(LotProduction.date_debut, CycleProduction.date_debut)
    end_date = case((LotProduction.id_lot.isnot(None), LotProduction.date_fin_reelle), else_=CycleProduction.date_fin_reelle)
    status_value = func.coalesce(LotProduction.statut, CycleProduction.statut)
    return db.query(CycleProduction).outerjoin(LotProduction, LotProduction.id_lot == CycleProduction.id_lot).filter(
        CycleProduction.id_batiment == id_batiment, start_date <= target_date,
        or_(status_value.in_(ACTIVE_CYCLE_STATUSES), end_date >= target_date),
    ).order_by(start_date.desc(), CycleProduction.id_cycle.desc()).first()

def cycle_schedule(cycle: CycleProduction):
    """The parent owns arrival, age and lifecycle; old unlinked rows still work."""
    return cycle.lot or cycle


def validate_cycle_date(cycle: CycleProduction, target_date: date) -> None:
    cycle = cycle_schedule(cycle)
    if target_date < cycle.date_debut or (
        cycle.date_fin_reelle is not None and target_date > cycle.date_fin_reelle
    ):
        raise HTTPException(status_code=400, detail="La date choisie est en dehors du cycle.")


def validate_cycle_mortality(db: Session, cycle: CycleProduction, mortality: int, excluding_ids=(), *, limit=None) -> None:
    schedule = cycle_schedule(cycle)
    query = db.query(func.coalesce(func.sum(Production.mortalite), 0)).filter(
        Production.id_cycle == cycle.id_cycle, Production.est_actif.is_(True),
        Production.date_production >= schedule.date_debut,
    )
    if excluding_ids:
        query = query.filter(Production.id_production.notin_(excluding_ids))
    initial = schedule.effectif_initial if limit is None else limit
    if initial is not None and int(query.scalar() or 0) + mortality > initial:
        raise HTTPException(status_code=400, detail="La mortalité dépasse l'effectif du cycle.")

def find_active_cycle(
    db: Session, id_batiment: int, target_date: Optional[date] = None,
) -> Optional[CycleProduction]:
    query = db.query(CycleProduction).outerjoin(
        LotProduction, LotProduction.id_lot == CycleProduction.id_lot,
    ).filter(
        CycleProduction.id_batiment == id_batiment,
        func.coalesce(LotProduction.statut, CycleProduction.statut).in_(ACTIVE_CYCLE_STATUSES),
    )
    start_date = func.coalesce(LotProduction.date_debut, CycleProduction.date_debut)
    if target_date:
        query = query.filter(start_date <= target_date)
    cycle = query.order_by(start_date.desc()).first()
    if not cycle:
        return None
    refresh_cycle_status(db, cycle)
    return cycle

def require_active_cycle_for_date(
    db: Session,
    id_batiment: int,
    target_date: date,
    *,
    action_label: str = "cette operation",
) -> CycleProduction:
    cycle = find_active_cycle(db, id_batiment, target_date)
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun lot actif n'est affecté à ce bâtiment. Vérifiez la date dans Gestion des lots.",
        )

    if target_date < cycle_schedule(cycle).date_debut:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date choisie est avant le debut du lot actif.",
        )

    return cycle


def calculate_cycle_effectif(db: Session, cycle: CycleProduction, through_date: Optional[date] = None) -> Optional[int]:
    schedule = cycle_schedule(cycle)
    initial = schedule.effectif_initial
    if initial is None:
        return None
    current_day = min(through_date or date.today(), date.today())
    query = db.query(func.coalesce(func.sum(func.coalesce(Production.mortalite, 0)), 0)).filter(
        Production.id_cycle == cycle.id_cycle, Production.est_actif.is_(True),
        Production.date_production >= schedule.date_debut, Production.date_production <= current_day,
    )
    total_out = int(query.scalar() or 0)
    return max(int(initial) - total_out, 0)

def cycle_to_dict(db: Session, cycle: CycleProduction, today: Optional[date] = None) -> dict:
    allocation = cycle
    cycle = cycle_schedule(allocation)
    current_day = today or date.today()
    refresh_cycle_status(db, cycle, current_day)
    if cycle.date_fin_reelle:
        current_day = min(current_day, cycle.date_fin_reelle)
    days_since_start = max((current_day - cycle.date_debut).days, 0)
    age_semaines = cycle.age_depart_semaines + (days_since_start // 7)
    semaine_cycle = (days_since_start // 7) + 1
    jours_restants = (cycle.date_fin_prevue - current_day).days
    phase_code, phase_label = get_cycle_phase(age_semaines, cycle.duree_semaines)

    return {
        "id_cycle": allocation.id_cycle,
        "id_lot": allocation.id_lot,
        "id_batiment": allocation.id_batiment,
        "nom_batiment": allocation.batiment.nom if allocation.batiment else None,
        "nom_cycle": cycle.nom_lot if allocation.lot else cycle.nom_cycle,
        "souche": cycle.souche,
        "date_debut": cycle.date_debut,
        "age_depart_semaines": cycle.age_depart_semaines,
        "effectif_initial": cycle.effectif_initial,
        "duree_semaines": cycle.duree_semaines,
        "date_fin_prevue": cycle.date_fin_prevue,
        "date_fin_reelle": cycle.date_fin_reelle,
        "statut": cycle.statut,
        "notes": cycle.notes,
        "effectif_actuel": calculate_cycle_effectif(db, allocation, current_day),
        "age_semaines": age_semaines,
        "semaine_cycle": semaine_cycle,
        "phase_code": phase_code,
        "phase_label": phase_label,
        "jours_restants": jours_restants,
        "formule_suggeree": formula_for_cycle(db, allocation, current_day),
        "date_creation": cycle.date_creation,
        "date_modification": cycle.date_modification,
        "id_utilisateur_creation": cycle.id_utilisateur_creation,
        "id_utilisateur_modification": cycle.id_utilisateur_modification,
    }
