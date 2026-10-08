"""Manage one arrival and all building allocations in a single transaction."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.lot_production import LotProduction
from app.models.production import Production
from app.models.user import Utilisateur
from app.schemas.lot_production import LotProductionCreate
from app.schemas.cycle_production import CycleProductionTerminate
from app.utils.dependencies import get_current_active_user
from app.utils.production_cycles import (
    ACTIVE_CYCLE_STATUSES, calculate_cycle_end_date, cycle_to_dict,
    validate_cycle_mortality,
)

router = APIRouter(prefix="/lots-production", tags=["Lots production"])


def lot_to_dict(db, lot):
    allocations = [cycle_to_dict(db, cycle) for cycle in lot.allocations]
    sample = allocations[0] if allocations else {}
    mortality = db.query(func.coalesce(func.sum(Production.mortalite), 0)).join(
        CycleProduction, Production.id_cycle == CycleProduction.id_cycle,
    ).filter(
        CycleProduction.id_lot == lot.id_lot, Production.est_actif.is_(True),
        Production.date_production <= (lot.date_fin_reelle or date.today()),
    ).scalar() or 0
    return {
        "id_lot": lot.id_lot, "nom_lot": lot.nom_lot, "souche": lot.souche,
        "date_debut": lot.date_debut, "age_depart_semaines": lot.age_depart_semaines,
        "effectif_initial": lot.effectif_initial,
        "effectif_actuel": max(lot.effectif_initial - int(mortality), 0) if lot.effectif_initial is not None else None,
        "mortalite_totale": int(mortality),
        "duree_semaines": lot.duree_semaines, "date_fin_prevue": lot.date_fin_prevue,
        "date_fin_reelle": lot.date_fin_reelle, "statut": lot.statut, "notes": lot.notes,
        "age_semaines": sample.get("age_semaines"), "semaine_cycle": sample.get("semaine_cycle"),
        "formule_suggeree": sample.get("formule_suggeree"),
        "phase_label": sample.get("phase_label"), "repartitions": allocations,
    }


def _lock_buildings(db, ids, *, require_active=False):
    # All writers lock buildings in ID order, including production entry writers.
    rows = db.query(Batiment).filter(Batiment.id_batiment.in_(ids)).order_by(
        Batiment.id_batiment,
    ).populate_existing().with_for_update().all()
    if len(rows) != len(ids):
        raise HTTPException(status_code=400, detail="Un bâtiment de la répartition est introuvable.")
    if require_active and any(not row.est_actif for row in rows):
        raise HTTPException(status_code=400, detail="La répartition nécessite des bâtiments actifs.")


def _lock_lot(db, id_lot):
    lot = db.query(LotProduction).filter(LotProduction.id_lot == id_lot).populate_existing().with_for_update().first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot introuvable.")
    _lock_buildings(db, [row.id_batiment for row in lot.allocations])
    # Refresh after waiting on any concurrent production writer.
    for row in lot.allocations:
        db.refresh(row)
    return lot


def _validate_start(db, payload, excluded=()):
    if payload.date_debut > date.today():
        raise HTTPException(status_code=400, detail="Le lot ne peut pas commencer dans le futur.")
    ids = [row.id_batiment for row in payload.repartitions]
    conflicts = db.query(CycleProduction).filter(CycleProduction.id_batiment.in_(ids))
    if excluded:
        conflicts = conflicts.filter(CycleProduction.id_cycle.notin_(excluded))
    if conflicts.filter(CycleProduction.statut.in_(ACTIVE_CYCLE_STATUSES)).first():
        raise HTTPException(status_code=400, detail="Un bâtiment a déjà un lot actif. Terminez ce lot avant une nouvelle arrivée.")
    if conflicts.filter(CycleProduction.date_fin_reelle >= payload.date_debut).first():
        raise HTTPException(status_code=400, detail="Cette arrivée chevauche un lot précédent dans un bâtiment.")


def _apply_schedule(lot, payload, user):
    for field in ("nom_lot", "souche", "date_debut", "age_depart_semaines", "effectif_initial", "duree_semaines", "notes"):
        setattr(lot, field, getattr(payload, field))
    lot.date_fin_prevue = payload.date_fin_prevue or calculate_cycle_end_date(payload.date_debut, payload.duree_semaines)
    if user:
        lot.id_utilisateur_modification = user.id_utilisateur


def _sync_allocation(cycle, lot):
    # Keep existing SQL reports and dated lookups compatible during rollout.
    cycle.nom_cycle = lot.nom_lot
    for field in ("souche", "date_debut", "age_depart_semaines", "duree_semaines", "date_fin_prevue", "date_fin_reelle", "statut", "notes"):
        setattr(cycle, field, getattr(lot, field))
    cycle.id_utilisateur_modification = lot.id_utilisateur_modification


@router.get("")
def list_lots(db: Session = Depends(get_db), current_user: Utilisateur = Depends(get_current_active_user)):
    lots = db.query(LotProduction).options(
        selectinload(LotProduction.allocations).selectinload(CycleProduction.batiment),
    ).order_by(LotProduction.date_debut.desc(), LotProduction.id_lot.desc()).all()
    return [lot_to_dict(db, lot) for lot in lots]


@router.post("", status_code=201)
def create_lot(payload: LotProductionCreate, db: Session = Depends(get_db),
               current_user: Utilisateur = Depends(get_current_active_user)):
    _lock_buildings(db, [row.id_batiment for row in payload.repartitions], require_active=True)
    _validate_start(db, payload)
    lot = LotProduction(statut="actif", id_utilisateur_creation=current_user.id_utilisateur if current_user else None)
    _apply_schedule(lot, payload, current_user)
    db.add(lot)
    db.flush()
    for row in payload.repartitions:
        cycle = CycleProduction(
            id_lot=lot.id_lot, id_batiment=row.id_batiment, effectif_initial=row.effectif_initial,
            id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
        )
        _sync_allocation(cycle, lot)
        db.add(cycle)
    db.commit()
    db.refresh(lot)
    return lot_to_dict(db, lot)


@router.put("/{id_lot}")
def update_lot(id_lot: int, payload: LotProductionCreate, db: Session = Depends(get_db),
               current_user: Utilisateur = Depends(get_current_active_user)):
    lot = _lock_lot(db, id_lot)
    if lot.statut == "termine":
        raise HTTPException(status_code=400, detail="Ce lot est terminé.")
    if {row.id_batiment for row in payload.repartitions} != {row.id_batiment for row in lot.allocations}:
        raise HTTPException(status_code=400, detail="Les bâtiments d'un lot démarré ne peuvent pas changer.")
    ids = [row.id_cycle for row in lot.allocations]
    _validate_start(db, payload, ids)
    if db.query(Production).filter(
        Production.id_cycle.in_(ids), Production.est_actif.is_(True),
        Production.date_production < payload.date_debut,
    ).first():
        raise HTTPException(status_code=400, detail="Des saisies précèdent cette nouvelle date d'arrivée.")
    counts = {row.id_batiment: row.effectif_initial for row in payload.repartitions}
    for cycle in lot.allocations:
        validate_cycle_mortality(db, cycle, 0, limit=counts[cycle.id_batiment])
    _apply_schedule(lot, payload, current_user)
    for cycle in lot.allocations:
        cycle.effectif_initial = counts[cycle.id_batiment]
        _sync_allocation(cycle, lot)
    db.commit()
    db.refresh(lot)
    return lot_to_dict(db, lot)


@router.post("/{id_lot}/terminer")
def terminate_lot(id_lot: int, payload: CycleProductionTerminate, db: Session = Depends(get_db),
                  current_user: Utilisateur = Depends(get_current_active_user)):
    lot = _lock_lot(db, id_lot)
    if lot.statut == "termine":
        return lot_to_dict(db, lot)
    end = payload.date_fin_reelle or date.today()
    if end < lot.date_debut or end > date.today():
        raise HTTPException(status_code=400, detail="La date de fin doit être entre l'arrivée et aujourd'hui.")
    if db.query(Production).filter(
        Production.id_cycle.in_([row.id_cycle for row in lot.allocations]),
        Production.est_actif.is_(True), Production.date_production > end,
    ).first():
        raise HTTPException(status_code=400, detail="Des saisies existent après cette date de fin dans un bâtiment.")
    lot.statut = "termine"
    lot.date_fin_reelle = end
    if current_user:
        lot.id_utilisateur_modification = current_user.id_utilisateur
    for cycle in lot.allocations:
        _sync_allocation(cycle, lot)
    db.commit()
    db.refresh(lot)
    return lot_to_dict(db, lot)
