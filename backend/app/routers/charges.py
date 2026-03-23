"""
Router FastAPI pour la gestion des Charges (Dépenses standalone).
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime

from app.database import get_db
from app.models.charge import Charge
from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.user import Utilisateur
from app.schemas.charge import ChargeCreate, ChargeUpdate, ChargeRead, ChargeSummary
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/charges", tags=["Charges / Dépenses"])


def _apply_charge_impact(db: Session, charge: Charge):
    """
    Applique l'impact financier d'une charge sur la Caisse OU un Compte Bancaire.
    Une charge est toujours une SORTIE.
    """
    from app.models.compte_bancaire import MouvementBancaire, CompteBancaire
    from app.routers.paiements import _create_caisse_snapshot

    # CAS 1: Impact sur un Compte Bancaire
    if charge.id_compte:
        # Nettoyer l'impact Caisse s'il existait (changement de mode de paiement)
        caisse_mvmt = db.query(Caisse).filter(Caisse.id_charge == charge.id_charge).first()
        if caisse_mvmt:
            db.delete(caisse_mvmt)
        
        # Gérer le mouvement bancaire
        existing_bank = db.query(MouvementBancaire).filter(MouvementBancaire.id_charge == charge.id_charge).first()
        old_montant = Decimal('0.00')
        
        if existing_bank:
            old_montant = existing_bank.montant
            existing_bank.montant = charge.montant
            existing_bank.date_mouvement = datetime.combine(charge.date_charge, datetime.min.time())
            existing_bank.id_compte = charge.id_compte
        else:
            new_bank = MouvementBancaire(
                id_compte=charge.id_compte,
                id_charge=charge.id_charge,
                montant=charge.montant,
                type_mouvement='SORTIE',
                source='frais',
                notes=charge.libelle,
                date_mouvement=datetime.combine(charge.date_charge, datetime.min.time())
            )
            db.add(new_bank)
        
        # Mettre à jour le solde du compte
        compte = db.query(CompteBancaire).filter(CompteBancaire.id_compte == charge.id_compte).first()
        if compte:
            compte.solde_actuel = Decimal(str(compte.solde_actuel)) + old_montant - charge.montant
        
        return None

    # CAS 2: Impact sur la Caisse (par défaut)
    # Nettoyer l'impact Bancaire s'il existait
    from app.models.compte_bancaire import MouvementBancaire, CompteBancaire
    from decimal import Decimal
    bank_mvmt = db.query(MouvementBancaire).filter(MouvementBancaire.id_charge == charge.id_charge).first()
    if bank_mvmt:
        compte = db.query(CompteBancaire).filter(CompteBancaire.id_compte == bank_mvmt.id_compte).first()
        if compte:
            compte.solde_actuel = Decimal(str(compte.solde_actuel)) + bank_mvmt.montant
        db.delete(bank_mvmt)

    existing = db.query(Caisse).filter(Caisse.id_charge == charge.id_charge).first()
    
    if existing:
        existing.montant = charge.montant
        existing.date_mouvement = datetime.combine(charge.date_charge, datetime.min.time())
        db.flush()
        _create_caisse_snapshot(db, existing.id_mouvement)
        return existing

    new_mvmt = Caisse(
        montant=charge.montant,
        type_mouvement='SORTIE',
        id_charge=charge.id_charge,
        date_mouvement=datetime.combine(charge.date_charge, datetime.min.time())
    )
    db.add(new_mvmt)
    db.flush()
    _create_caisse_snapshot(db, new_mvmt.id_mouvement)
    
    return new_mvmt


@router.get("", response_model=List[ChargeRead])
def get_charges(
    skip: int = 0,
    limit: int = 100,
    categorie: Optional[str] = None,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Récupère la liste des charges avec filtres."""
    query = db.query(Charge)
    
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
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Résumé des charges par catégorie sur une période."""
    query = db.query(
        Charge.categorie,
        func.sum(Charge.montant).label('total'),
        func.count(Charge.id_charge).label('count')
    )
    
    if date_debut:
        query = query.filter(Charge.date_charge >= date_debut)
    if date_fin:
        query = query.filter(Charge.date_charge <= date_fin)
        
    results = query.group_by(Charge.categorie).all()
    return results


@router.get("/{id}", response_model=ChargeRead)
def get_charge(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Détails d'une charge."""
    charge = db.query(Charge).filter(Charge.id_charge == id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Charge introuvable")
    return charge


@router.post("", response_model=ChargeRead, status_code=status.HTTP_201_CREATED)
def create_charge(
    charge_data: ChargeCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Crée une nouvelle charge et génère le mouvement de caisse."""
    new_charge = Charge(
        **charge_data.model_dump(),
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    db.add(new_charge)
    db.flush()
    
    # Appliquer l'impact financier (Caisse ou Banque)
    _apply_charge_impact(db, new_charge)
    
    db.commit()
    db.refresh(new_charge)
    return new_charge


@router.put("/{id}", response_model=ChargeRead)
def update_charge(
    id: int,
    charge_data: ChargeUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Met à jour une charge et son mouvement de caisse."""
    charge = db.query(Charge).filter(Charge.id_charge == id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Charge introuvable")
    
    update_dict = charge_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(charge, key, value)
        
    charge.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    # Mettre à jour l'impact financier
    _apply_charge_impact(db, charge)
    
    db.commit()
    db.refresh(charge)
    return charge


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_charge(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Supprime une charge et son mouvement de caisse."""
    charge = db.query(Charge).filter(Charge.id_charge == id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Charge introuvable")
    
    # La suppression en cascade gérée par SQLAlchemy s'occupera du mouvement de caisse
    db.delete(charge)
    db.commit()
    return None
