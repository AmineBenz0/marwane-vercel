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
from app.models.lettre_credit_utilisation import LettreCreditUtilisation
from app.models.user import Utilisateur
from app.schemas.cession_lc import CessionLCCreate, CessionLCRead
from app.utils.dependencies import get_current_active_user
from app.services.lc_lifecycle import record_lc_non_payment_use

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
        if c.type_cedant == 'entreprise':
            nom_cedant = 'Entreprise'
        elif c.type_cedant == 'client' and c.cedant_client:
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
    lc = db.query(LettreDeCredit).filter(
        LettreDeCredit.id_lc == cession_data.id_lc,
    ).with_for_update().first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Crédit introuvable")
    
    if lc.statut == 'active' and not lc.est_disponible:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cette LC ne sera disponible qu'a partir du "
                f"{lc.date_disponibilite}"
            ),
        )
    if lc.statut != 'active':
        raise HTTPException(status_code=400, detail=f"La LC doit être active pour être cédée (Statut actuel: {lc.statut})")
    if lc.version_utilisation != cession_data.version_utilisation:
        raise HTTPException(status_code=409, detail="La LC a changé depuis l'ouverture du formulaire. Actualisez la page.")

    # 3. Vérifier que le cédant est bien le détenteur
    if lc.statut_cycle != 'detenue':
        raise HTTPException(status_code=409, detail="La LC n'est pas détenue par l'entreprise.")
    if cession_data.type_cessionnaire != 'fournisseur' or not cession_data.id_cessionnaire_fournisseur:
        raise HTTPException(status_code=422, detail="Une LC détenue par l'entreprise peut être transférée à un fournisseur.")

    # 2. Créer la cession
    nouvelle_cession = CessionLC(
        id_lc=lc.id_lc,
        type_cedant='entreprise',
        type_cessionnaire='fournisseur',
        id_cessionnaire_fournisseur=cession_data.id_cessionnaire_fournisseur,
        date_cession=cession_data.date_cession,
        motif=cession_data.motif,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    # 3. Mettre à jour la LC (Changement de détenteur)
    lc.type_detenteur = cession_data.type_cessionnaire
    lc.id_client = None
    lc.id_fournisseur = cession_data.id_cessionnaire_fournisseur
    lc.statut = 'utilisee'
    lc.statut_cycle = 'transferee'
    lc.version_utilisation += 1
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    db.add(nouvelle_cession)
    db.flush()
    record_lc_non_payment_use(
        db,
        lc,
        type_utilisation='fournisseur',
        date_utilisation=cession_data.date_cession,
        id_fournisseur=cession_data.id_cessionnaire_fournisseur,
        id_cession=nouvelle_cession.id_cession,
        current_user=current_user,
    )
    db.commit()
    db.refresh(nouvelle_cession)
    
    # Formater pour le retour
    res = CessionLCRead.model_validate(nouvelle_cession)
    res.numero_reference_lc = lc.numero_reference
    return res

