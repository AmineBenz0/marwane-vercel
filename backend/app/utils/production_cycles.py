from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cycle_production import CycleProduction
from app.models.production import Production


ACTIVE_CYCLE_STATUSES = ("actif", "a_cloturer")
DEFAULT_LOT_DURATION_WEEKS = 100
PULLET_PHASE_END_WEEK = 17


def calculate_cycle_end_date(start_date: date, duration_weeks: int) -> date:
    return start_date + timedelta(weeks=duration_weeks) - timedelta(days=1)


def get_cycle_phase(age_weeks: int, duration_weeks: int = DEFAULT_LOT_DURATION_WEEKS) -> tuple[str, str]:
    if age_weeks > duration_weeks:
        return "a_cloturer", "A cloturer"
    if age_weeks <= PULLET_PHASE_END_WEEK:
        return "elevage", "Phase elevage"
    return "ponte", "Phase ponte"


def refresh_cycle_status(db: Session, cycle: Optional[CycleProduction], today: Optional[date] = None) -> Optional[CycleProduction]:
    if not cycle:
        return None

    current_day = today or date.today()
    if cycle.statut == "actif" and cycle.date_fin_prevue < current_day:
        cycle.statut = "a_cloturer"
        db.flush()
    return cycle


def find_active_cycle(
    db: Session,
    id_batiment: int,
    target_date: Optional[date] = None,
) -> Optional[CycleProduction]:
    query = db.query(CycleProduction).filter(
        CycleProduction.id_batiment == id_batiment,
        CycleProduction.statut.in_(ACTIVE_CYCLE_STATUSES),
    )

    if target_date:
        query = query.filter(CycleProduction.date_debut <= target_date)

    cycle = query.order_by(CycleProduction.date_debut.desc()).first()
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
            detail="Aucun lot actif pour ce batiment. Commencez un lot avant de saisir la production.",
        )

    if target_date < cycle.date_debut:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date choisie est avant le debut du lot actif.",
        )

    if target_date > cycle.date_fin_prevue:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le lot a atteint sa date de fin prevue. Prolongez ou terminez le lot avant {action_label}.",
        )

    return cycle


def calculate_cycle_effectif(db: Session, cycle: CycleProduction, through_date: Optional[date] = None) -> Optional[int]:
    if cycle.effectif_initial is None:
        return None

    query = db.query(
        func.coalesce(func.sum(func.coalesce(Production.mortalite, 0)), 0)
    ).filter(Production.id_cycle == cycle.id_cycle)

    if through_date:
        query = query.filter(Production.date_production <= through_date)

    total_out = int(query.scalar() or 0)
    return max(int(cycle.effectif_initial) - total_out, 0)


def cycle_to_dict(db: Session, cycle: CycleProduction, today: Optional[date] = None) -> dict:
    current_day = today or date.today()
    refresh_cycle_status(db, cycle, current_day)
    days_since_start = max((current_day - cycle.date_debut).days, 0)
    age_semaines = cycle.age_depart_semaines + (days_since_start // 7)
    semaine_cycle = min((days_since_start // 7) + 1, cycle.duree_semaines)
    jours_restants = (cycle.date_fin_prevue - current_day).days
    phase_code, phase_label = get_cycle_phase(age_semaines, cycle.duree_semaines)

    return {
        "id_cycle": cycle.id_cycle,
        "id_batiment": cycle.id_batiment,
        "nom_batiment": cycle.batiment.nom if cycle.batiment else None,
        "nom_cycle": cycle.nom_cycle,
        "souche": cycle.souche,
        "date_debut": cycle.date_debut,
        "age_depart_semaines": cycle.age_depart_semaines,
        "effectif_initial": cycle.effectif_initial,
        "duree_semaines": cycle.duree_semaines,
        "date_fin_prevue": cycle.date_fin_prevue,
        "date_fin_reelle": cycle.date_fin_reelle,
        "statut": cycle.statut,
        "notes": cycle.notes,
        "effectif_actuel": calculate_cycle_effectif(db, cycle, current_day),
        "age_semaines": age_semaines,
        "semaine_cycle": semaine_cycle,
        "phase_code": phase_code,
        "phase_label": phase_label,
        "jours_restants": jours_restants,
        "date_creation": cycle.date_creation,
        "date_modification": cycle.date_modification,
        "id_utilisateur_creation": cycle.id_utilisateur_creation,
        "id_utilisateur_modification": cycle.id_utilisateur_modification,
    }
