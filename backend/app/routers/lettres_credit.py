"""
Router FastAPI pour la gestion des Lettres de Crédit (LC).
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.lettre_credit import LettreDeCredit
from app.models.fournisseur import Fournisseur
from app.models.compte_bancaire import MouvementBancaire
from app.models.cession_lc import CessionLC
from app.models.user import Utilisateur
from app.schemas.lettre_credit import (
    LettreCreditCreate,
    LettreCreditPayerFournisseur,
    LettreCreditRead,
    LettreCreditSummary,
    LettreCreditUpdate,
    LettreCreditVerserBanque,
)
from app.utils.dependencies import get_current_active_user
from app.services.financial_ledger import record_bank_movement, validate_bank_idempotency
from app.utils.business_date import business_date

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
    """Récupère les LC actives et disponibles (date OK)."""
    today = business_date()
    query = db.query(LettreDeCredit).filter(
        LettreDeCredit.statut == 'active',
        LettreDeCredit.date_disponibilite <= today,
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
    """Crée une nouvelle LC. Le détenteur est toujours un client."""
    # Vérifier l'unicité de la référence
    existing = db.query(LettreDeCredit).filter(LettreDeCredit.numero_reference == lc_data.numero_reference).first()
    if existing:
        raise HTTPException(status_code=400, detail="Cette référence de LC existe déjà")
    
    # Vérifier que le client est fourni
    if not lc_data.id_client:
        raise HTTPException(status_code=400, detail="ID Client requis pour une Lettre de Crédit")

    new_lc = LettreDeCredit(
        numero_reference=lc_data.numero_reference,
        banque_emettrice=lc_data.banque_emettrice,
        montant=lc_data.montant,
        date_emission=lc_data.date_emission,
        date_disponibilite=lc_data.date_disponibilite,
        id_client=lc_data.id_client,
        notes=lc_data.notes,
        type_detenteur='client',  # Toujours client
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


def _get_active_lc_or_400(id: int, db: Session) -> LettreDeCredit:
    lc = db.query(LettreDeCredit).filter(LettreDeCredit.id_lc == id).with_for_update().first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Crédit introuvable")
    if lc.statut != 'active':
        raise HTTPException(status_code=400, detail="Cette LC est déjà utilisée")
    if not lc.est_disponible:
        raise HTTPException(
            status_code=400,
            detail=f"Cette LC ne sera disponible qu'à partir du {lc.date_disponibilite}"
        )
    return lc


@router.post("/{id}/verser-banque", response_model=LettreCreditRead)
def verser_lc_banque(
    id: int,
    payload: LettreCreditVerserBanque,
    response: Response,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Verse la valeur d'une LC disponible dans un compte bancaire."""
    idempotency_key = f"lc-bank-deposit-{id}"
    lc = db.query(LettreDeCredit).filter(
        LettreDeCredit.id_lc == id,
    ).with_for_update().first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Crédit introuvable")

    existing = db.query(MouvementBancaire).filter(
        MouvementBancaire.cle_idempotence == idempotency_key,
    ).first()
    if existing:
        validate_bank_idempotency(existing, {
            "id_compte": payload.id_compte,
            "montant": lc.montant,
            "type_mouvement": "ENTREE",
            "source": "lc",
            "reference": lc.numero_reference,
            "id_paiement": None,
            "id_charge": None,
        })
        response.status_code = status.HTTP_200_OK
        return format_lc_read(lc)

    if lc.statut != "active":
        raise HTTPException(status_code=400, detail="Cette LC est déjà utilisée")
    if not lc.est_disponible:
        raise HTTPException(
            status_code=400,
            detail=f"Cette LC ne sera disponible qu'à partir du {lc.date_disponibilite}",
        )
    record_bank_movement(
        db,
        id_compte=payload.id_compte,
        montant=lc.montant,
        type_mouvement='ENTREE',
        source='lc',
        reference=lc.numero_reference,
        notes=payload.notes or f"Versement LC {lc.numero_reference}",
        cle_idempotence=idempotency_key,
        current_user=current_user,
    )
    lc.statut = 'utilisee'
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None

    db.commit()
    db.refresh(lc)
    return format_lc_read(lc)


@router.post("/{id}/payer-fournisseur", response_model=LettreCreditRead)
def payer_fournisseur_lc(
    id: int,
    payload: LettreCreditPayerFournisseur,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Marque une LC disponible comme utilisee pour payer un fournisseur."""
    lc = _get_active_lc_or_400(id, db)
    fournisseur = db.query(Fournisseur).filter(Fournisseur.id_fournisseur == payload.id_fournisseur).first()
    if not fournisseur:
        raise HTTPException(status_code=404, detail="Fournisseur introuvable")

    cession = CessionLC(
        id_lc=lc.id_lc,
        type_cedant=lc.type_detenteur,
        id_cedant_client=lc.id_client if lc.type_detenteur == 'client' else None,
        id_cedant_fournisseur=lc.id_fournisseur if lc.type_detenteur == 'fournisseur' else None,
        type_cessionnaire='fournisseur',
        id_cessionnaire_fournisseur=fournisseur.id_fournisseur,
        date_cession=payload.date_cession,
        motif=payload.notes or f"Paiement fournisseur par LC {lc.numero_reference}",
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
    )
    lc.type_detenteur = 'fournisseur'
    lc.id_client = None
    lc.id_fournisseur = fournisseur.id_fournisseur
    lc.statut = 'utilisee'
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None

    db.add(cession)
    db.commit()
    db.refresh(lc)
    return format_lc_read(lc)
