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
    # 1. V�rifier la LC
    lc = db.query(LettreDeCredit).filter(
        LettreDeCredit.id_lc == cession_data.id_lc,
    ).with_for_update().first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Cr�dit introuvable")
    
    if lc.statut == 'active' and not lc.est_disponible:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cette LC ne sera disponible qu'a partir du "
                f"{lc.date_disponibilite}"
            ),
        )
    if lc.statut != 'active':
        raise HTTPException(status_code=400, detail=f"La LC doit �tre active pour �tre c�d�e (Statut actuel: {lc.statut})")
    if lc.version_utilisation != cession_data.version_utilisation:
        raise HTTPException(status_code=409, detail="La LC a chang� depuis l'ouverture du formulaire. Actualisez la page.")

    # 3. V�rifier que le c�dant est bien le d�tenteur
    if lc.type_detenteur != cession_data.type_cedant:
         raise HTTPException(status_code=400, detail="Le type du c�dant ne correspond pas au d�tenteur actuel")
    if lc.type_detenteur == 'client' and lc.id_client != cession_data.id_cedant_client:
         raise HTTPException(status_code=400, detail="Le client c�dant n'est pas le d�tenteur actuel")
    if lc.type_detenteur == 'fournisseur' and lc.id_fournisseur != cession_data.id_cedant_fournisseur:
         raise HTTPException(status_code=400, detail="Le fournisseur c�dant n'est pas le d�tenteur actuel")

    # 2. Cr�er la cession
    nouvelle_cession = CessionLC(
        **cession_data.model_dump(exclude={"version_utilisation"}),
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    # 3. Mettre � jour la LC (Changement de d�tenteur)
    lc.type_detenteur = cession_data.type_cessionnaire
    lc.id_client = cession_data.id_cessionnaire_client
    lc.id_fournisseur = cession_data.id_cessionnaire_fournisseur
    lc.statut = 'utilisee'
    lc.version_utilisation += 1
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    db.add(nouvelle_cession)
    db.commit()
    db.refresh(nouvelle_cession)
    
    # Formater pour le retour
    res = CessionLCRead.model_validate(nouvelle_cession)
    res.numero_reference_lc = lc.numero_reference
    return res
