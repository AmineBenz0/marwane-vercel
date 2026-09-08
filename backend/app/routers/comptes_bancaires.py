from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal

from app.database import get_db
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.utils.dependencies import get_current_active_user
from app.services.financial_ledger import record_bank_movement, validate_bank_idempotency
from app.models.user import Utilisateur
from app.schemas.compte_bancaire import (
    CompteBancaireCreate,
    CompteBancaireRead,
    MouvementBancaireCreate,
    MouvementBancaireRead,
)

from sqlalchemy import func, case
from sqlalchemy.exc import IntegrityError

router = APIRouter(prefix="/comptes-bancaires", tags=["Comptes Bancaires"])

@router.get("", response_model=List[CompteBancaireRead])
def get_comptes(
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Récupère la liste de tous les comptes bancaires."""
    return db.query(CompteBancaire).all()

@router.get("/{id}/mouvements", response_model=List[MouvementBancaireRead])
def get_mouvements(
    id: int,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Récupère l'historique des mouvements pour un compte."""
    return db.query(MouvementBancaire).filter(
        MouvementBancaire.id_compte == id,
        MouvementBancaire.statut == "active",
    ).order_by(MouvementBancaire.date_mouvement.desc()).offset(skip).limit(limit).all()

@router.get("/{id}/solde-calcule")
def get_solde_calcule(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Calcule le solde en sommant tous les mouvements.
    Permet de vérifier s'il y a un écart avec le solde_actuel stocké.
    """
    # Vérifier l'existence du compte
    compte = db.query(CompteBancaire).filter(CompteBancaire.id_compte == id).first()
    if not compte:
        raise HTTPException(status_code=404, detail="Compte bancaire introuvable")
        
    solde_calcule = db.query(
        func.sum(
            case(
                (MouvementBancaire.type_mouvement == 'ENTREE', MouvementBancaire.montant),
                else_=-MouvementBancaire.montant
            )
        )
    ).filter(MouvementBancaire.id_compte == id, MouvementBancaire.statut == "active").scalar() or Decimal('0.00')
    
    return {
        "id_compte": id,
        "nom_banque": compte.nom_banque,
        "solde_stocke": compte.solde_actuel,
        "solde_calcule": solde_calcule,
        "ecart": Decimal(str(compte.solde_actuel)) - solde_calcule
    }

@router.post("", response_model=CompteBancaireRead, status_code=status.HTTP_201_CREATED)
def create_compte(
    compte_in: CompteBancaireCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Crée un nouveau compte bancaire."""
    new_compte = CompteBancaire(
        nom_banque=compte_in.nom_banque,
        numero_compte=compte_in.numero_compte,
        solde_actuel=Decimal("0.00"),
    )
    db.add(new_compte)
    db.flush()
    
    # Créer le mouvement initial si solde != 0
    if compte_in.solde_initial != 0:
        record_bank_movement(
            db,
            id_compte=new_compte.id_compte,
            montant=abs(compte_in.solde_initial),
            type_mouvement='ENTREE' if compte_in.solde_initial > 0 else 'SORTIE',
            source='initial',
            notes='Solde initial',
            cle_idempotence=f"bank-opening-{new_compte.id_compte}",
            current_user=current_user,
        )
        
    db.commit()
    db.refresh(new_compte)
    return new_compte


@router.post("/{id}/mouvements", response_model=MouvementBancaireRead, status_code=status.HTTP_201_CREATED)
def create_mouvement(
    id: int,
    mouvement_in: MouvementBancaireCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Ajoute une entree ou une sortie bancaire simple et met a jour le solde."""
    replay = bool(
        mouvement_in.cle_idempotence
        and db.query(MouvementBancaire).filter(
            MouvementBancaire.cle_idempotence == mouvement_in.cle_idempotence,
        ).first()
    )
    try:
        mouvement = record_bank_movement(
            db,
            id_compte=id,
            montant=mouvement_in.montant,
            type_mouvement=mouvement_in.type_mouvement,
            source=mouvement_in.source,
            reference=mouvement_in.reference,
            notes=mouvement_in.notes,
            cle_idempotence=mouvement_in.cle_idempotence,
            current_user=current_user,
        )
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        if movement_key := mouvement_in.cle_idempotence:
            existing = db.query(MouvementBancaire).filter(
                MouvementBancaire.cle_idempotence == movement_key,
            ).first()
            if existing:
                validate_bank_idempotency(existing, {
                    "id_compte": id,
                    "montant": mouvement_in.montant,
                    "type_mouvement": mouvement_in.type_mouvement,
                    "source": mouvement_in.source,
                    "reference": mouvement_in.reference,
                    "id_paiement": None,
                    "id_charge": None,
                })
                response.status_code = status.HTTP_200_OK
                return existing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le mouvement bancaire n'a pas pu être enregistré en raison d'un conflit d'intégrité",
        ) from exc
    db.commit()
    db.refresh(mouvement)
    if replay:
        response.status_code = status.HTTP_200_OK
    return mouvement
