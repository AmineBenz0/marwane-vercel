"""
Router FastAPI pour la gestion des cessions de LC.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.models.lettre_credit import LettreDeCredit
from app.models.cession_lc import CessionLC
from app.models.user import Utilisateur
from app.schemas.cession_lc import CessionLCCreate, CessionLCRead
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/cessions-lc", tags=["Cessions de LC"])


@router.get("", response_model=List[CessionLCRead])
def get_cessions_lc(
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Liste toutes les cessions."""
    cessions = db.query(CessionLC).order_by(CessionLC.date_creation.desc()).all()
    
    results = []
    for c in cessions:
        nom_cedant = "Inconnu"
        if c.type_cedant == 'client' and c.cedant_client:
            nom_cedant = c.cedant_client.nom_client
        elif c.type_cedant == 'fournisseur' and c.cedant_fournisseur:
            nom_cedant = c.cedant_fournisseur.nom_fournisseur
            
        nom_cessionnaire = "Inconnu"
        if c.type_cessionnaire == 'client' and c.cessionnaire_client:
            nom_cessionnaire = c.cessionnaire_client.nom_client
        elif c.type_cessionnaire == 'fournisseur' and c.cessionnaire_fournisseur:
            nom_cessionnaire = c.cessionnaire_fournisseur.nom_fournisseur
            
        item = CessionLCRead.model_validate(c)
        item.nom_cedant = nom_cedant
        item.nom_cessionnaire = nom_cessionnaire
        item.numero_reference_lc = c.lettre_credit.numero_reference if c.lettre_credit else "N/A"
        results.append(item)
        
    return results


@router.post("", response_model=CessionLCRead, status_code=status.HTTP_201_CREATED)
def create_cession_lc(
    cession_data: CessionLCCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Effectue une cession de LC (transfert complet)."""
    # 1. Vérifier la LC
    lc = db.query(LettreDeCredit).filter(LettreDeCredit.id_lc == cession_data.id_lc).first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Crédit introuvable")
    
    if lc.statut != 'active':
        raise HTTPException(status_code=400, detail=f"La LC doit être active pour être cédée (Statut actuel: {lc.statut})")

    # 3. Vérifier que le cédant est bien le détenteur
    if lc.type_detenteur != cession_data.type_cedant:
         raise HTTPException(status_code=400, detail="Le type du cédant ne correspond pas au détenteur actuel")
    if lc.type_detenteur == 'client' and lc.id_client != cession_data.id_cedant_client:
         raise HTTPException(status_code=400, detail="Le client cédant n'est pas le détenteur actuel")
    if lc.type_detenteur == 'fournisseur' and lc.id_fournisseur != cession_data.id_cedant_fournisseur:
         raise HTTPException(status_code=400, detail="Le fournisseur cédant n'est pas le détenteur actuel")

    # 2. Créer la cession
    nouvelle_cession = CessionLC(
        **cession_data.model_dump(),
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    # 3. Mettre à jour la LC (Changement de détenteur)
    lc.type_detenteur = cession_data.type_cessionnaire
    lc.id_client = cession_data.id_cessionnaire_client
    lc.id_fournisseur = cession_data.id_cessionnaire_fournisseur
    # On garde le statut active car elle est transférée immédiatement
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    db.add(nouvelle_cession)
    db.commit()
    db.refresh(nouvelle_cession)
    
    # Formater pour le retour
    res = CessionLCRead.model_validate(nouvelle_cession)
    res.numero_reference_lc = lc.numero_reference
    return res
