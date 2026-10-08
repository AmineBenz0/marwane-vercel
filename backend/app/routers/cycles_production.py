from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.lots_production import create_lot, update_lot, terminate_lot
from app.schemas.lot_production import LotProductionCreate
from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.user import Utilisateur
from app.models.production import Production
from app.utils.cycle_insights import cycle_insights
from app.schemas.cycle_production import (
    CycleHistoryAssign,
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
    find_cycle_for_date,
    validate_cycle_date,
    validate_cycle_mortality,
    refresh_cycle_status,
)

router = APIRouter(prefix="/cycles-production", tags=["Cycles production"])


def _ensure_batiment(db: Session, id_batiment: int) -> Batiment:
    batiment = db.query(Batiment).filter(Batiment.id_batiment == id_batiment).with_for_update().first()
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
    # Compatibility endpoint: a single-building arrival is still a parent lot.
    data = cycle_in.model_dump(exclude={"id_batiment", "nom_cycle"})
    data["nom_lot"] = cycle_in.nom_cycle
    data["repartitions"] = [{"id_batiment": cycle_in.id_batiment, "effectif_initial": cycle_in.effectif_initial}]
    lot = create_lot(LotProductionCreate(**data), db, current_user)
    return lot["repartitions"][0]


@router.get("/context/{id_batiment}")
def get_cycle_context(
    id_batiment: int,
    date_saisie: date,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    cycle = find_cycle_for_date(db, id_batiment, date_saisie)
    has_cycles = db.query(CycleProduction.id_cycle).filter(
        CycleProduction.id_batiment == id_batiment,
    ).first() is not None
    return {"cycle": cycle_to_dict(db, cycle, date_saisie) if cycle else None, "has_cycles": has_cycles}


@router.get("/{id_cycle}/insights")
def get_cycle_insights(
    id_cycle: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    cycle = db.get(CycleProduction, id_cycle)
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle introuvable")
    return cycle_insights(db, cycle)


@router.post("/{id_cycle}/rattacher")
def assign_cycle_history(
    id_cycle: int,
    payload: CycleHistoryAssign,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    cycle = db.get(CycleProduction, id_cycle)
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle introuvable")
    _ensure_batiment(db, cycle.id_batiment)
    validate_cycle_date(cycle, payload.date_debut)
    validate_cycle_date(cycle, payload.date_fin)
    if payload.date_fin > date.today():
        raise HTTPException(status_code=400, detail="La période ne peut pas être dans le futur.")
    records = db.query(Production).filter(
        Production.id_batiment == cycle.id_batiment,
        Production.id_cycle.is_(None),
        Production.est_actif.is_(True),
        Production.date_production >= payload.date_debut,
        Production.date_production <= payload.date_fin,
    ).all()
    validate_cycle_mortality(db, cycle, sum(record.mortalite or 0 for record in records))
    for record in records:
        record.id_cycle = cycle.id_cycle
        record.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    db.commit()
    return {"rattachees": len(records)}


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

    if cycle.id_lot:
        if len(cycle.lot.allocations) > 1:
            raise HTTPException(status_code=409, detail="Modifiez le lot partagé depuis Production & stock.")
        data = {
            "nom_lot": cycle.lot.nom_lot, "souche": cycle.lot.souche,
            "date_debut": cycle.lot.date_debut, "age_depart_semaines": cycle.lot.age_depart_semaines,
            "effectif_initial": cycle.effectif_initial, "duree_semaines": cycle.lot.duree_semaines,
            "date_fin_prevue": cycle.lot.date_fin_prevue, "notes": cycle.lot.notes,
        }
        changes = cycle_in.model_dump(exclude_unset=True)
        if "nom_cycle" in changes:
            changes["nom_lot"] = changes.pop("nom_cycle")
        data.update(changes)
        if "date_fin_prevue" not in changes and ("date_debut" in changes or "duree_semaines" in changes):
            data["date_fin_prevue"] = None
        if any(data[key] is None for key in ("nom_lot", "date_debut", "age_depart_semaines", "effectif_initial", "duree_semaines")):
            raise HTTPException(status_code=400, detail="Les champs obligatoires ne peuvent pas être vides.")
        data["repartitions"] = [{"id_batiment": cycle.id_batiment, "effectif_initial": data["effectif_initial"]}]
        return update_lot(cycle.id_lot, LotProductionCreate(**data), db, current_user)["repartitions"][0]

    _ensure_batiment(db, cycle.id_batiment)
    if cycle.statut == "termine":
        raise HTTPException(status_code=400, detail="Ce cycle est terminé.")
    update_data = cycle_in.model_dump(exclude_unset=True)
    required_fields = {"nom_cycle", "date_debut", "age_depart_semaines", "effectif_initial", "duree_semaines", "date_fin_prevue"}
    if any(value is None and field in required_fields for field, value in update_data.items()):
        raise HTTPException(status_code=400, detail="Les champs obligatoires ne peuvent pas être vides.")
    new_start = update_data.get("date_debut", cycle.date_debut)
    if new_start > date.today():
        raise HTTPException(status_code=400, detail="La date de début ne peut pas être dans le futur.")
    if db.query(CycleProduction).filter(
        CycleProduction.id_batiment == cycle.id_batiment,
        CycleProduction.id_cycle != cycle.id_cycle,
        CycleProduction.date_fin_reelle >= new_start,
    ).first():
        raise HTTPException(status_code=400, detail="Cette date chevauche un cycle précédent.")
    if db.query(Production).filter(
        Production.id_cycle == id_cycle, Production.est_actif.is_(True),
        Production.date_production < new_start,
    ).first():
        raise HTTPException(status_code=400, detail="Des saisies précèdent cette nouvelle date de début.")
    for field, value in update_data.items():
        setattr(cycle, field, value)

    if "date_fin_prevue" not in update_data and ("date_debut" in update_data or "duree_semaines" in update_data):
        cycle.date_fin_prevue = calculate_cycle_end_date(cycle.date_debut, cycle.duree_semaines)

    if cycle.date_fin_prevue < cycle.date_debut:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date de fin prevue doit etre apres la date de debut",
        )

    validate_cycle_mortality(db, cycle, 0)
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

    if cycle.id_lot:
        if len(cycle.lot.allocations) > 1:
            raise HTTPException(status_code=409, detail="Terminez le lot partagé depuis Production & stock.")
        return terminate_lot(cycle.id_lot, payload, db, current_user)["repartitions"][0]

    _ensure_batiment(db, cycle.id_batiment)
    if cycle.statut == "termine":
        return cycle_to_dict(db, cycle)
    end_date = payload.date_fin_reelle or date.today()
    if end_date < cycle.date_debut or end_date > date.today():
        raise HTTPException(status_code=400, detail="La date de fin doit être entre le début du cycle et aujourd'hui.")
    if db.query(Production).filter(
        Production.id_cycle == id_cycle, Production.est_actif.is_(True),
        Production.date_production > end_date,
    ).first():
        raise HTTPException(status_code=400, detail="Des saisies existent après cette date de fin.")
    cycle.statut = "termine"
    cycle.date_fin_reelle = end_date
    if current_user:
        cycle.id_utilisateur_modification = current_user.id_utilisateur

    db.commit()
    db.refresh(cycle)
    return cycle_to_dict(db, cycle)
