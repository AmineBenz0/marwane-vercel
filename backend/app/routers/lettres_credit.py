"""
Router FastAPI pour la gestion des Lettres de Crédit (LC).
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.models.lettre_credit import LettreDeCredit
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.user import Utilisateur
from app.schemas.lettre_credit import (
    LettreCreditCreate, LettreCreditUpdate, LettreCreditRead, LettreCreditSummary
)
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/lettres-credit", tags=["Lettres de Crédit"])


def format_lc_read(lc: LettreDeCredit) -> LettreCreditRead:
    """Formate une LC pour la lecture avec les champs calculés."""
    detenteur_nom = "Inconnu"
    if lc.type_detenteur == 'client' and lc.client:
        detenteur_nom = lc.client.nom_client
    elif lc.type_detenteur == 'fournisseur' and lc.fournisseur:
        detenteur_nom = lc.fournisseur.nom_fournisseur
    
    # Utilisation du schéma pour la conversion
    lc_read = LettreCreditRead.model_validate(lc)
    lc_read.detenteur_nom = detenteur_nom
    lc_read.est_disponible = lc.est_disponible
    return lc_read


@router.get("", response_model=List[LettreCreditSummary])
def get_lettres_credit(
    skip: int = 0,
    limit: int = 100,
    statut: Optional[str] = None,
    id_client: Optional[int] = None,
    id_fournisseur: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Récupère la liste des LC avec filtres."""
    query = db.query(LettreDeCredit)
    
    if statut:
        query = query.filter(LettreDeCredit.statut == statut.lower())
    if id_client:
        query = query.filter(LettreDeCredit.id_client == id_client)
    if id_fournisseur:
        query = query.filter(LettreDeCredit.id_fournisseur == id_fournisseur)
        
    lcs = query.order_by(LettreDeCredit.date_disponibilite.asc()).offset(skip).limit(limit).all()
    
    results = []
    for lc in lcs:
        detenteur_nom = "Inconnu"
        if lc.type_detenteur == 'client' and lc.client:
            detenteur_nom = lc.client.nom_client
        elif lc.type_detenteur == 'fournisseur' and lc.fournisseur:
            detenteur_nom = lc.fournisseur.nom_fournisseur
            
        summary = LettreCreditSummary.model_validate(lc)
        summary.detenteur_nom = detenteur_nom
        summary.est_disponible = lc.est_disponible
        results.append(summary)
        
    return results


@router.get("/disponibles", response_model=List[LettreCreditSummary])
def get_lettres_credit_disponibles(
    id_client: Optional[int] = None,
    id_fournisseur: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Récupère les LC actives et disponibles (date OK, non expirées)."""
    today = date.today()
    query = db.query(LettreDeCredit).filter(
        LettreDeCredit.statut == 'active',
        LettreDeCredit.date_disponibilite <= today,
        LettreDeCredit.date_expiration >= today
    )
    
    if id_client:
        query = query.filter(LettreDeCredit.id_client == id_client)
    if id_fournisseur:
        query = query.filter(LettreDeCredit.id_fournisseur == id_fournisseur)
        
    lcs = query.all()
    results = []
    for lc in lcs:
        detenteur_nom = "Inconnu"
        if lc.type_detenteur == 'client' and lc.client:
            detenteur_nom = lc.client.nom_client
        elif lc.type_detenteur == 'fournisseur' and lc.fournisseur:
            detenteur_nom = lc.fournisseur.nom_fournisseur
            
        summary = LettreCreditSummary.model_validate(lc)
        summary.detenteur_nom = detenteur_nom
        summary.est_disponible = True
        results.append(summary)
        
    return results


@router.get("/{id}", response_model=LettreCreditRead)
def get_lettre_credit(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Détails d'une LC."""
    lc = db.query(LettreDeCredit).filter(LettreDeCredit.id_lc == id).first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Crédit introuvable")
    return format_lc_read(lc)


@router.post("", response_model=LettreCreditRead, status_code=status.HTTP_201_CREATED)
def create_lettre_credit(
    lc_data: LettreCreditCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Crée une nouvelle LC."""
    # Vérifier l'unicité de la référence
    existing = db.query(LettreDeCredit).filter(LettreDeCredit.numero_reference == lc_data.numero_reference).first()
    if existing:
        raise HTTPException(status_code=400, detail="Cette référence de LC existe déjà")
    
    # Vérifier le détenteur
    if lc_data.type_detenteur == 'client' and not lc_data.id_client:
        raise HTTPException(status_code=400, detail="ID Client requis pour un détenteur de type client")
    if lc_data.type_detenteur == 'fournisseur' and not lc_data.id_fournisseur:
        raise HTTPException(status_code=400, detail="ID Fournisseur requis pour un détenteur de type fournisseur")

    new_lc = LettreDeCredit(
        **lc_data.model_dump(),
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    db.add(new_lc)
    db.commit()
    db.refresh(new_lc)
    return format_lc_read(new_lc)


@router.put("/{id}", response_model=LettreCreditRead)
def update_lettre_credit(
    id: int,
    lc_data: LettreCreditUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Met à jour une LC."""
    lc = db.query(LettreDeCredit).filter(LettreDeCredit.id_lc == id).first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Crédit introuvable")
    
    update_data = lc_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(lc, key, value)
    
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    db.commit()
    db.refresh(lc)
    return format_lc_read(lc)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lettre_credit(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Supprime une LC (seulement si non utilisée)."""
    lc = db.query(LettreDeCredit).filter(LettreDeCredit.id_lc == id).first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Crédit introuvable")
    
    if lc.statut == 'utilisee':
        raise HTTPException(status_code=400, detail="Impossible de supprimer une LC déjà utilisée")
    
    db.delete(lc)
    db.commit()
    return None
