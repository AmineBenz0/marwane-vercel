from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.user import Utilisateur
from app.schemas.cycle_production import (
    CycleProductionCreate,
    CycleProductionRead,
    CycleProductionTerminate,
    CycleProductionUpdate,
)
from app.utils.dependencies import get_current_active_user
from app.utils.production_cycles import (
    ACTIVE_CYCLE_STATUSES,
    calculate_cycle_end_date,
    cycle_to_dict,
    find_active_cycle,
    refresh_cycle_status,
)

router = APIRouter(prefix="/cycles-production", tags=["Cycles production"])


def _ensure_batiment(db: Session, id_batiment: int) -> Batiment:
    batiment = db.query(Batiment).filter(Batiment.id_batiment == id_batiment).first()
    if not batiment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batiment avec l'ID {id_batiment} introuvable",
        )
    return batiment


def _ensure_no_active_cycle(db: Session, id_batiment: int, exclude_cycle_id: Optional[int] = None) -> None:
    query = db.query(CycleProduction).filter(
        CycleProduction.id_batiment == id_batiment,
        CycleProduction.statut.in_(ACTIVE_CYCLE_STATUSES),
    )
    if exclude_cycle_id:
        query = query.filter(CycleProduction.id_cycle != exclude_cycle_id)

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce batiment a deja un lot actif. Terminez-le avant d'en commencer un nouveau.",
        )


@router.get("", response_model=List[CycleProductionRead])
def list_cycles(
    id_batiment: Optional[int] = None,
    statut: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    query = db.query(CycleProduction).join(Batiment)
    if id_batiment is not None:
        query = query.filter(CycleProduction.id_batiment == id_batiment)
    if statut:
        query = query.filter(CycleProduction.statut == statut)

    cycles = query.order_by(CycleProduction.date_debut.desc()).all()
    for cycle in cycles:
        refresh_cycle_status(db, cycle)
    db.commit()
    return [cycle_to_dict(db, cycle) for cycle in cycles]


@router.get("/active/{id_batiment}", response_model=Optional[CycleProductionRead])
def get_active_cycle(
    id_batiment: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    _ensure_batiment(db, id_batiment)
    cycle = find_active_cycle(db, id_batiment)
    if not cycle:
        return None
    db.commit()
    return cycle_to_dict(db, cycle)


@router.post("", response_model=CycleProductionRead, status_code=status.HTTP_201_CREATED)
def create_cycle(
    cycle_in: CycleProductionCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    _ensure_batiment(db, cycle_in.id_batiment)
    _ensure_no_active_cycle(db, cycle_in.id_batiment)

    date_fin_prevue = cycle_in.date_fin_prevue or calculate_cycle_end_date(
        cycle_in.date_debut,
        cycle_in.duree_semaines,
    )

    cycle = CycleProduction(
        id_batiment=cycle_in.id_batiment,
        nom_cycle=cycle_in.nom_cycle,
        souche=cycle_in.souche,
        date_debut=cycle_in.date_debut,
        age_depart_semaines=cycle_in.age_depart_semaines,
        effectif_initial=cycle_in.effectif_initial,
        duree_semaines=cycle_in.duree_semaines,
        date_fin_prevue=date_fin_prevue,
        statut="actif",
        notes=cycle_in.notes,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
    )
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    return cycle_to_dict(db, cycle)


@router.get("/{id_cycle}", response_model=CycleProductionRead)
def get_cycle(
    id_cycle: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    cycle = db.query(CycleProduction).filter(CycleProduction.id_cycle == id_cycle).first()
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot introuvable")
    refresh_cycle_status(db, cycle)
    db.commit()
    return cycle_to_dict(db, cycle)


@router.put("/{id_cycle}", response_model=CycleProductionRead)
def update_cycle(
    id_cycle: int,
    cycle_in: CycleProductionUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    cycle = db.query(CycleProduction).filter(CycleProduction.id_cycle == id_cycle).first()
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot introuvable")

    update_data = cycle_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cycle, field, value)

    if "date_fin_prevue" not in update_data and ("date_debut" in update_data or "duree_semaines" in update_data):
        cycle.date_fin_prevue = calculate_cycle_end_date(cycle.date_debut, cycle.duree_semaines)

    if cycle.date_fin_prevue < cycle.date_debut:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date de fin prevue doit etre apres la date de debut",
        )

    if current_user:
        cycle.id_utilisateur_modification = current_user.id_utilisateur

    db.commit()
    db.refresh(cycle)
    return cycle_to_dict(db, cycle)


@router.post("/{id_cycle}/terminer", response_model=CycleProductionRead)
def terminate_cycle(
    id_cycle: int,
    payload: CycleProductionTerminate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    cycle = db.query(CycleProduction).filter(CycleProduction.id_cycle == id_cycle).first()
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot introuvable")

    cycle.statut = "termine"
    cycle.date_fin_reelle = payload.date_fin_reelle or date.today()
    if current_user:
        cycle.id_utilisateur_modification = current_user.id_utilisateur

    db.commit()
    db.refresh(cycle)
    return cycle_to_dict(db, cycle)
