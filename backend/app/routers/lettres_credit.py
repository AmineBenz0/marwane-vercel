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
from app.models.lettre_credit_utilisation import LettreCreditUtilisation
from app.models.user import Utilisateur
from app.schemas.lettre_credit import (
    LettreCreditAnnuler,
    LettreCreditCreate,
    LettreCreditPayerFournisseur,
    LettreCreditRead,
    LettreCreditReceptionRead,
    LettreCreditSummary,
    LettreCreditUpdate,
    LettreCreditUtilisationRead,
    LettreCreditVerserBanque,
)
from app.utils.dependencies import get_current_active_user
from app.services.financial_ledger import record_bank_movement, validate_bank_idempotency
from app.services.letter_credit_cancellation import cancel_letter_credit
from app.utils.business_date import business_date
from app.schemas.lc_correction import LCCorrectionCommand, LCCorrectionApply
from app.services.lc_corrections import preview_lc_correction, apply_lc_correction
from app.models.correction_operation import CorrectionOperation
from app.services.settlement_state import row_snapshot
from app.services.lc_lifecycle import record_lc_non_payment_use

router = APIRouter(prefix="/lettres-credit", tags=["Lettres de Crédit"])


def format_lc_read(lc: LettreDeCredit) -> LettreCreditRead:
    """Formate une LC pour la lecture avec les champs calculés."""
    detenteur_nom = "Inconnu"
    if lc.statut_cycle == 'detenue' and lc.client_origine:
        detenteur_nom = lc.client_origine.nom_client
    elif lc.type_detenteur == 'client' and lc.client:
        detenteur_nom = lc.client.nom_client
    elif lc.type_detenteur == 'fournisseur' and lc.fournisseur:
        detenteur_nom = lc.fournisseur.nom_fournisseur
    
    # Utilisation du schéma pour la conversion
    lc_read = LettreCreditRead.model_validate(lc)
    lc_read.detenteur_nom = detenteur_nom
    lc_read.client_origine_nom = lc.client_origine.nom_client if lc.client_origine else None
    lc_read.receptions = [
        LettreCreditReceptionRead.model_validate(p)
        for p in sorted(lc.paiements, key=lambda item: (item.date_paiement, item.id_paiement))
        if p.role_lc == 'reception'
    ]
    lc_read.utilisations = [
        LettreCreditUtilisationRead.model_validate(u).model_copy(update={
            'fournisseur_nom': u.fournisseur.nom_fournisseur if u.fournisseur else None,
            'compte_banque_nom': u.compte_bancaire.nom_banque if u.compte_bancaire else None,
        })
        for u in sorted(lc.utilisations, key=lambda item: (item.date_creation, item.id_utilisation))
    ]
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
        if lc.statut_cycle == 'detenue' and lc.client_origine:
            detenteur_nom = lc.client_origine.nom_client
        elif lc.type_detenteur == 'client' and lc.client:
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
        LettreDeCredit.statut_cycle == 'detenue',
    )
    
    if id_client:
        query = query.filter(LettreDeCredit.id_client_origine == id_client)
    else:
        # Client receipt may settle a sale before the instrument itself becomes
        # usable for a supplier transfer or bank deposit.
        query = query.filter(LettreDeCredit.date_disponibilite <= today)
    # A held LC belongs to the business portfolio and can pay any supplier.
        
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


@router.post("/corrections/preview")
def preview_lc(command: LCCorrectionCommand, db: Session = Depends(get_db),
               actor: Utilisateur = Depends(get_current_active_user)):
    return preview_lc_correction(db, command)


@router.post("/corrections/apply")
def apply_lc(body: LCCorrectionApply, db: Session = Depends(get_db),
             actor: Utilisateur = Depends(get_current_active_user)):
    return apply_lc_correction(db, body.command, body.dependency_fingerprint, actor)


@router.get("/{id}/correction-context")
def lc_correction_context(id: int, db: Session = Depends(get_db),
                          actor: Utilisateur = Depends(get_current_active_user)):
    lc = db.get(LettreDeCredit, id)
    if lc is None:
        raise HTTPException(404, 'Lettre de crédit introuvable.')
    from uuid import uuid4
    command = LCCorrectionCommand(operation_id=uuid4(), id_lc=id, expected_version=lc.version_utilisation,
        reason='Chargement de la situation', changes={'notes': lc.notes})
    plan = preview_lc_correction(db, command)
    operations = db.query(CorrectionOperation).filter(
        CorrectionOperation.request_payload['kind'].as_string() == 'lc_correction',
        CorrectionOperation.request_payload['id_lc'].as_integer() == id).order_by(
        CorrectionOperation.recorded_at.desc()).limit(30).all()
    return {'plan': plan, 'history': [{'operation_id': str(o.operation_id), 'reason': o.reason,
        'recorded_at': o.recorded_at, 'actor_id': o.id_utilisateur,
        'before': o.result_payload['impact']['before'], 'after': o.result_payload['record'],
        'impact': o.result_payload['impact']} for o in operations]}


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
        date_reception=lc_data.date_reception,
        id_client=lc_data.id_client,
        id_client_origine=lc_data.id_client,
        statut_cycle='detenue',
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
    if set(update_data) - {'notes'}:
        raise HTTPException(409, 'Utilisez la correction avec aperçu pour modifier les valeurs de la LC.')
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
    
    from app.models.paiement import Paiement
    if (lc.statut == 'utilisee' or lc.cessions or db.query(Paiement.id_paiement).filter(Paiement.id_lc == id).first()
        or lc.version_utilisation > 0):
        raise HTTPException(409, 'Une LC avec un historique d’utilisation est conservée dans le registre.')
    
    lc.statut = 'utilisee'
    lc.statut_cycle = 'annulee'
    lc.version_utilisation += 1
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    db.commit()
    return None


@router.post("/{id}/annuler", response_model=LettreCreditRead)
def annuler_lettre_credit(
    id: int,
    payload: LettreCreditAnnuler,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Annule une LC utilisée en conservant les traces de l'opération."""
    lc = cancel_letter_credit(
        db,
        id,
        current_user=current_user,
        reason=payload.raison,
        version_utilisation=payload.version_utilisation,
    )
    return format_lc_read(lc)


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
    lc = db.query(LettreDeCredit).filter(
        LettreDeCredit.id_lc == id,
    ).with_for_update().first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Crédit introuvable")

    idempotency_key = f"lc-bank-deposit-{id}-{payload.version_utilisation + 1}"
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
        if existing.statut != "active":
            raise HTTPException(
                status_code=409,
                detail="Cette demande correspond à une utilisation déjà annulée. Actualisez la page.",
            )
        response.status_code = status.HTTP_200_OK
        return format_lc_read(lc)

    if payload.version_utilisation != lc.version_utilisation:
        raise HTTPException(status_code=409, detail="La LC a changé depuis l'ouverture du formulaire. Actualisez la page.")

    if lc.statut != "active" or lc.statut_cycle != "detenue":
        raise HTTPException(status_code=400, detail="Cette LC est déjà utilisée")
    if not lc.est_disponible:
        raise HTTPException(
            status_code=400,
            detail=f"Cette LC ne sera disponible qu'à partir du {lc.date_disponibilite}",
        )
    bank_movement = record_bank_movement(
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
    record_lc_non_payment_use(
        db,
        lc,
        type_utilisation="banque",
        date_utilisation=business_date(),
        id_compte=payload.id_compte,
        id_mouvement_bancaire=bank_movement.id_mouvement,
        current_user=current_user,
    )
    lc.version_utilisation += 1
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
    if payload.version_utilisation != lc.version_utilisation:
        raise HTTPException(status_code=409, detail="La LC a changé depuis l'ouverture du formulaire. Actualisez la page.")
    fournisseur = db.query(Fournisseur).filter(Fournisseur.id_fournisseur == payload.id_fournisseur).first()
    if not fournisseur:
        raise HTTPException(status_code=404, detail="Fournisseur introuvable")

    cession = CessionLC(
        id_lc=lc.id_lc,
        type_cedant='entreprise',
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
    lc.version_utilisation += 1
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None

    db.add(cession)
    db.flush()
    record_lc_non_payment_use(
        db,
        lc,
        type_utilisation="fournisseur",
        date_utilisation=payload.date_cession,
        id_fournisseur=fournisseur.id_fournisseur,
        id_cession=cession.id_cession,
        current_user=current_user,
    )
    db.commit()
    db.refresh(lc)
    return format_lc_read(lc)

