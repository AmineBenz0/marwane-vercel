"""
Router FastAPI pour la gestion des Charges / Dépenses.
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.charge import Charge
from app.models.user import Utilisateur
from app.schemas.charge import ChargeCreate, ChargeRead, ChargeSummary, ChargeUpdate
from app.services.financial_ledger import apply_charge_impact
from app.services.charge_operations import cancel_charge
from app.services.ledger import record_correction
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/charges", tags=["Charges / Dépenses"])


@router.get("", response_model=List[ChargeRead])
def get_charges(
    skip: int = 0,
    limit: int = 100,
    categorie: Optional[str] = None,
    id_batiment: Optional[int] = None,
    source_journaliere: Optional[bool] = None,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Récupère la liste des dépenses avec filtres."""
    query = db.query(Charge).filter(Charge.statut == "active")

    if id_batiment is not None:
        query = query.filter(Charge.id_batiment == id_batiment)
    if source_journaliere is not None:
        query = query.filter(Charge.source_journaliere == source_journaliere)
    if categorie:
        query = query.filter(Charge.categorie == categorie)
    if date_debut:
        query = query.filter(Charge.date_charge >= date_debut)
    if date_fin:
        query = query.filter(Charge.date_charge <= date_fin)

    return query.order_by(Charge.date_charge.desc()).offset(skip).limit(limit).all()


@router.get("/summary", response_model=List[ChargeSummary])
def get_charges_summary(
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Résumé des dépenses par catégorie sur une période."""
    query = db.query(
        Charge.categorie,
        func.sum(Charge.montant).label("total"),
        func.count(Charge.id_charge).label("count"),
    ).filter(Charge.statut == "active")

    if date_debut:
        query = query.filter(Charge.date_charge >= date_debut)
    if date_fin:
        query = query.filter(Charge.date_charge <= date_fin)

    return query.group_by(Charge.categorie).all()


@router.get("/{id}", response_model=ChargeRead)
def get_charge(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Détails d'une dépense."""
    charge = db.query(Charge).filter(Charge.id_charge == id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Dépense introuvable")

    return charge


@router.post("", response_model=ChargeRead, status_code=status.HTTP_201_CREATED)
def create_charge(
    charge_data: ChargeCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Crée une nouvelle dépense et génère le mouvement financier associé."""
    new_charge = Charge(
        **charge_data.model_dump(),
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
    )
    db.add(new_charge)
    db.flush()

    apply_charge_impact(
        db,
        new_charge,
        current_user=current_user,
        reason="Création de la dépense",
    )

    db.commit()
    db.refresh(new_charge)
    return new_charge


@router.put("/{id}", response_model=ChargeRead)
def update_charge(
    id: int,
    charge_data: ChargeUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Met à jour une dépense et son mouvement financier associé."""
    charge = db.query(Charge).filter(Charge.id_charge == id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Dépense introuvable")
    if charge.source_journaliere:
        raise HTTPException(status_code=409, detail="Modifiez cette dépense depuis la saisie journalière du bâtiment.")
    if charge.statut == "annule":
        raise HTTPException(status_code=400, detail="La dépense est déjà annulée")

    update_dict = charge_data.model_dump(exclude_unset=True)
    reason = update_dict.pop("raison", None) or "Correction opérationnelle de la dépense"
    changed_fields = list(update_dict)
    for key, value in update_dict.items():
        setattr(charge, key, value)

    charge.id_utilisateur_modification = current_user.id_utilisateur if current_user else None

    apply_charge_impact(
        db,
        charge,
        current_user=current_user,
        reason=reason,
    )
    if changed_fields:
        record_correction(
            db,
            type_entite="charge",
            id_entite=charge.id_charge,
            action="modification",
            raison=reason,
            current_user=current_user,
            details={"champs": changed_fields},
        )

    db.commit()
    db.refresh(charge)
    return charge


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_charge(
    id: int,
    raison: str = Query(
        "Annulation demandée par l'utilisateur",
        min_length=3,
        max_length=1000,
    ),
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Supprime une dépense et son mouvement financier associé."""
    charge = db.query(Charge).filter(Charge.id_charge == id).with_for_update().first()
    if not charge:
        raise HTTPException(status_code=404, detail="Dépense introuvable")
    if charge.source_journaliere:
        raise HTTPException(status_code=409, detail="Modifiez cette dépense depuis la saisie journalière du bâtiment.")
    cancel_charge(db, charge, raison, current_user)
    db.commit()
    return None
