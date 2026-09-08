"""
Router FastAPI pour la gestion des paiements.
Gère les endpoints pour créer, lire, modifier et supprimer des paiements.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.database import get_db
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.models.lettre_credit import LettreDeCredit
from app.models.cession_lc import CessionLC
from app.models.user import Utilisateur
from app.services.ledger import record_correction
from app.services.financial import validate_payment_date, validate_payment_idempotency
from app.services.financial_ledger import sync_payment_cash_movement
from app.utils.business_date import business_date
from app.schemas.paiement import (
    PaiementCreate, PaiementUpdate, PaiementRead, 
    PaiementBatchCreate, StatutPaiementTransaction, PaiementSummary
)
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/paiements", tags=["Paiements"])


def _validate_lc_payment(
    db: Session,
    paiement_data,
    transaction: Transaction,
    current_user: Utilisateur,
    existing_payment_id: Optional[int] = None,
) -> Optional[LettreDeCredit]:
    """
    Valide l'utilisation d'une LC pour un paiement.

    Une LC doit etre active, disponible, utilisee en totalite, et ne peut pas etre
    reutilisee par un autre paiement.
    """
    payment_type = (paiement_data.type_paiement or '').lower()
    if payment_type != 'lc':
        return None

    if not paiement_data.id_lc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'ID de la Lettre de Crédit est requis pour ce type de paiement"
        )

    lc = db.query(LettreDeCredit).filter(LettreDeCredit.id_lc == paiement_data.id_lc).first()
    if not lc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lettre de Crédit avec l'ID {paiement_data.id_lc} introuvable"
        )

    linked_payment = db.query(Paiement).filter(
        Paiement.id_lc == lc.id_lc,
        Paiement.statut != "annule",
    ).first()
    is_same_payment = (
        existing_payment_id is not None
        and linked_payment is not None
        and linked_payment.id_paiement == existing_payment_id
    )

    if linked_payment and not is_same_payment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette LC est déjà utilisée par un autre paiement"
        )

    if not is_same_payment:
        if lc.statut != 'active':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La Lettre de Crédit n'est pas active (Statut: {lc.statut})"
            )

        if not lc.est_disponible:
            if lc.date_disponibilite > business_date():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cette LC ne sera disponible qu'à partir du {lc.date_disponibilite}"
                )

    if Decimal(str(paiement_data.montant)) != Decimal(str(lc.montant)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Le montant du paiement ({paiement_data.montant} MAD) doit correspondre "
                f"au montant total de la LC ({lc.montant} MAD) car elle doit être utilisée en totalité."
            )
        )

    if transaction.id_client:
        if lc.type_detenteur != 'client' or lc.id_client != transaction.id_client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cette LC n'appartient pas au client de cette transaction"
            )

    if transaction.id_fournisseur and (
        lc.type_detenteur != 'fournisseur'
        or lc.id_fournisseur != transaction.id_fournisseur
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette LC n'appartient pas au fournisseur de cette transaction"
        )

    lc.statut = 'utilisee'
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    return lc


def _release_lc_if_unused(
    db: Session,
    id_lc: Optional[int],
    current_user: Utilisateur,
    exclude_payment_id: Optional[int] = None,
) -> None:
    """Remet une LC en active si le paiement qui l'utilisait est retiré."""
    if not id_lc:
        return

    query = db.query(Paiement).filter(Paiement.id_lc == id_lc, Paiement.statut != "annule")
    if exclude_payment_id is not None:
        query = query.filter(Paiement.id_paiement != exclude_payment_id)

    if query.first():
        return

    if db.query(CessionLC).filter(CessionLC.id_lc == id_lc).first():
        return

    lc = db.query(LettreDeCredit).filter(LettreDeCredit.id_lc == id_lc).first()
    if lc and lc.statut == 'utilisee':
        lc.statut = 'active'
        lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None


@router.get("", response_model=List[PaiementRead], status_code=status.HTTP_200_OK)
def get_paiements(
    skip: int = 0,
    limit: int = 100,
    id_transaction: Optional[int] = None,
    type_paiement: Optional[str] = None,
    statut: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère la liste des paiements avec filtres optionnels.
    
    Args:
        skip: Nombre de paiements à sauter (pour la pagination)
        limit: Nombre maximum de paiements à retourner
        id_transaction: Filtre optionnel par ID de transaction
        type_paiement: Filtre optionnel par type de paiement
        statut: Filtre optionnel par statut
        db: Session de base de données
        current_user: Utilisateur actuel authentifié
        
    Returns:
        Liste des paiements (PaiementRead)
    """
    query = db.query(Paiement)
    
    # Filtre par transaction
    if id_transaction is not None:
        query = query.filter(Paiement.id_transaction == id_transaction)
    
    # Filtre par type de paiement
    if type_paiement:
        query = query.filter(Paiement.type_paiement == type_paiement.lower())
    
    # Filtre par statut
    if statut:
        query = query.filter(Paiement.statut == statut.lower())
    
    # Pagination et tri par date décroissante
    paiements = query.order_by(Paiement.date_paiement.desc()).offset(skip).limit(limit).all()
    
    return paiements


@router.get("/{id}", response_model=PaiementRead, status_code=status.HTTP_200_OK)
def get_paiement(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère les détails d'un paiement par son ID.
    
    Args:
        id: ID du paiement à récupérer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié
        
    Returns:
        Détails du paiement (PaiementRead)
        
    Raises:
        HTTPException 404: Si le paiement n'existe pas
    """
    paiement = db.query(Paiement).filter(Paiement.id_paiement == id).first()
    
    if not paiement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Paiement avec l'ID {id} introuvable"
        )

    return paiement


@router.post("", response_model=PaiementRead, status_code=status.HTTP_201_CREATED)
def create_paiement(
    paiement_data: PaiementCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Crée un nouveau paiement pour une transaction.
    
    Vérifie que:
    - La transaction existe
    - Le montant du paiement ne dépasse pas le montant restant dû
    
    Args:
        paiement_data: Données du nouveau paiement (PaiementCreate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié
        
    Returns:
        Paiement créé (PaiementRead)
        
    Raises:
        HTTPException 400: Si la transaction n'existe pas ou si le montant est invalide
        HTTPException 404: Si la transaction n'existe pas
    """
    if paiement_data.cle_idempotence:
        existing = db.query(Paiement).filter(Paiement.cle_idempotence == paiement_data.cle_idempotence).first()
        if existing:
            validate_payment_idempotency(existing, paiement_data)
            response.status_code = status.HTTP_200_OK
            return existing

    # Vérifier que la transaction existe
    transaction = db.query(Transaction).filter(
        Transaction.id_transaction == paiement_data.id_transaction
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {paiement_data.id_transaction} introuvable"
        )

    validate_payment_date(transaction, paiement_data.date_paiement)
    
    # Note: Les paiements dépassant le montant restant sont autorisés (avances, surpaiements)
    
    _validate_lc_payment(db, paiement_data, transaction, current_user)
    
    # Déterminer le statut initial
    statut_initial = 'valide'
    if paiement_data.type_paiement == 'cheque':
        # An encashed cheque is already effective. Pending cheque statuses do
        # not enter the ledger until the cheque is explicitly encashed.
        statut_initial = 'valide' if paiement_data.statut_cheque == 'encaisse' else 'en_attente'
    
    # Créer le nouveau paiement
    nouveau_paiement = Paiement(
        id_transaction=paiement_data.id_transaction,
        date_paiement=paiement_data.date_paiement,
        montant=paiement_data.montant,
        type_paiement=paiement_data.type_paiement.lower(),
        numero_cheque=paiement_data.numero_cheque,
        banque=paiement_data.banque,
        date_encaissement_prevue=paiement_data.date_encaissement_prevue,
        statut_cheque=paiement_data.statut_cheque.lower() if paiement_data.statut_cheque else None,
        reference_virement=paiement_data.reference_virement,
        id_lc=paiement_data.id_lc if paiement_data.type_paiement == 'lc' else None,
        notes=paiement_data.notes,
        cle_idempotence=paiement_data.cle_idempotence,
        statut=statut_initial,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    db.add(nouveau_paiement)
    try:
        db.flush() # Pour obtenir l'ID
    except IntegrityError as exc:
        db.rollback()
        if paiement_data.cle_idempotence:
            existing = db.query(Paiement).filter(
                Paiement.cle_idempotence == paiement_data.cle_idempotence
            ).first()
            if existing:
                validate_payment_idempotency(existing, paiement_data)
                response.status_code = status.HTTP_200_OK
                return existing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le paiement n'a pas pu être enregistré en raison d'un conflit d'intégrité",
        ) from exc
    
    # Mettre à jour la caisse
    sync_payment_cash_movement(
        db,
        nouveau_paiement,
        transaction,
        current_user=current_user,
        reason="Création du paiement",
    )
    
    db.commit()
    db.refresh(nouveau_paiement)
    
    return nouveau_paiement


@router.put("/{id}", response_model=PaiementRead, status_code=status.HTTP_200_OK)
def update_paiement(
    id: int,
    paiement_data: PaiementUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Met à jour un paiement existant.
    
    Args:
        id: ID du paiement à mettre à jour
        paiement_data: Données à mettre à jour (PaiementUpdate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié
        
    Returns:
        Paiement mis à jour (PaiementRead)
        
    Raises:
        HTTPException 404: Si le paiement n'existe pas
    """
    paiement = db.query(Paiement).filter(Paiement.id_paiement == id).first()
    
    if not paiement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Paiement avec l'ID {id} introuvable"
        )

    if paiement.statut == "annule":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Un paiement annulé est immuable")
    
    transaction = db.query(Transaction).filter(Transaction.id_transaction == paiement.id_transaction).first()
    old_lc_id = paiement.id_lc
    update_data = paiement_data.model_dump(exclude_unset=True)
    if "type_paiement" in update_data and update_data["type_paiement"]:
        update_data["type_paiement"] = update_data["type_paiement"].lower()

    immutable_fields = {"date_paiement", "montant", "type_paiement", "id_lc"}
    changed_immutable = [
        field for field in immutable_fields
        if field in update_data and update_data[field] != getattr(paiement, field)
    ]
    if changed_immutable:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Les attributs financiers d'un paiement sont immuables. "
                "Annulez le paiement avec une raison puis créez un nouveau paiement."
            ),
        )

    reason = update_data.pop("raison", None) or "Correction opérationnelle du paiement"
    changed_fields = list(update_data)
    if update_data.get("statut") == "annule":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'annulation d'un paiement doit utiliser l'opération de void avec une raison.",
        )

    # A cheque that transitions to encashed becomes effective in the same
    # transaction. This keeps the general status and cheque status coherent.
    if paiement.type_paiement == "cheque" and update_data.get("statut_cheque") == "encaisse":
        if paiement.statut in {"en_attente", "valide"}:
            update_data["statut"] = "valide"

    next_payment = SimpleNamespace(
        type_paiement=update_data.get("type_paiement", paiement.type_paiement),
        id_lc=update_data.get("id_lc", paiement.id_lc),
        montant=update_data.get("montant", paiement.montant),
    )

    if next_payment.type_paiement == 'lc':
        if not transaction:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaction {paiement.id_transaction} introuvable"
            )
        _validate_lc_payment(db, next_payment, transaction, current_user, existing_payment_id=id)
    else:
        update_data["id_lc"] = None

    for field, value in update_data.items():
        setattr(paiement, field, value)
    
    # Mettre à jour l'utilisateur de modification
    paiement.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    if old_lc_id and old_lc_id != paiement.id_lc:
        _release_lc_if_unused(db, old_lc_id, current_user, exclude_payment_id=id)

    # Mettre à jour la caisse si nécessaire (ex: chèque passé à 'encaisse')
    if transaction:
        sync_payment_cash_movement(
            db,
            paiement,
            transaction,
            current_user=current_user,
            reason=reason,
        )

    if changed_fields:
        record_correction(
            db,
            type_entite="paiement",
            id_entite=paiement.id_paiement,
            action="modification",
            raison=reason,
            current_user=current_user,
            details={"champs": changed_fields},
        )
        
    db.commit()
    db.refresh(paiement)
    
    return paiement


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paiement(
    id: int,
    raison: str = "Annulation demandée par l'utilisateur",
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Supprime un paiement.
    
    Args:
        id: ID du paiement à supprimer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié
        
    Raises:
        HTTPException 404: Si le paiement n'existe pas
    """
    paiement = db.query(Paiement).filter(Paiement.id_paiement == id).first()
    
    if not paiement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Paiement avec l'ID {id} introuvable"
        )

    if paiement.statut == "annule":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le paiement est déjà annulé")
    paiement.statut = "annule"
    paiement.motif_annulation = raison[:1000]
    paiement.date_annulation = datetime.now(timezone.utc)
    paiement.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    sync_payment_cash_movement(
        db,
        paiement,
        paiement.transaction,
        current_user=current_user,
        reason=raison,
    )
    _release_lc_if_unused(db, paiement.id_lc, current_user, exclude_payment_id=id)
    db.commit()
    
    return None


@router.get("/transaction/{id_transaction}/statut", response_model=StatutPaiementTransaction)
def get_statut_paiement_transaction(
    id_transaction: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère le statut de paiement complet d'une transaction.
    
    Retourne des informations détaillées sur l'état des paiements:
    - Montant total de la transaction
    - Montant déjà payé
    - Montant restant à payer
    - Pourcentage payé
    - Statut global
    - Nombre de paiements effectués
    
    Args:
        id_transaction: ID de la transaction
        db: Session de base de données
        current_user: Utilisateur actuel authentifié
        
    Returns:
        Statut de paiement de la transaction (StatutPaiementTransaction)
        
    Raises:
        HTTPException 404: Si la transaction n'existe pas
    """
    transaction = db.query(Transaction).filter(
        Transaction.id_transaction == id_transaction
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {id_transaction} introuvable"
        )
    
    # Compter le nombre de paiements
    nombre_paiements = len(transaction.paiements)
    
    return StatutPaiementTransaction(
        id_transaction=transaction.id_transaction,
        montant_total=transaction.montant_total,
        montant_paye=transaction.montant_paye,
        montant_restant=transaction.montant_restant,
        pourcentage_paye=transaction.pourcentage_paye,
        statut_paiement=transaction.statut_paiement,
        est_en_retard=transaction.est_en_retard,
        nombre_paiements=nombre_paiements
    )


@router.get("/statistiques/par-type", response_model=List[PaiementSummary])
def get_statistiques_paiements_par_type(
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère des statistiques sur les paiements groupés par type.
    
    Retourne pour chaque type de paiement:
    - Nombre total de paiements
    - Montant total des paiements
    
    Args:
        db: Session de base de données
        current_user: Utilisateur actuel authentifié
        
    Returns:
        Liste des statistiques par type de paiement (PaiementSummary)
    """
    stats = db.query(
        Paiement.type_paiement,
        func.count(Paiement.id_paiement).label('nombre_paiements'),
        func.sum(Paiement.montant).label('montant_total')
    ).filter(
        Paiement.statut.in_(['valide', 'en_attente'])  # Exclure les annulés et rejetés
    ).group_by(
        Paiement.type_paiement
    ).all()
    
    return [
        PaiementSummary(
            type_paiement=stat.type_paiement,
            nombre_paiements=stat.nombre_paiements,
            montant_total=stat.montant_total or Decimal('0')
        )
        for stat in stats
    ]


@router.post("/batch", response_model=List[PaiementRead], status_code=status.HTTP_201_CREATED)
def create_paiements_batch(
    batch_data: PaiementBatchCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Crée plusieurs paiements de manière atomique.
    Idéal pour le nouveau formulaire de paiement multi-lignes.
    """
    if not batch_data.paiements:
        raise HTTPException(status_code=400, detail="Liste de paiements vide")
        
    created_paiements = []
    
    try:
        for p_data in batch_data.paiements:
            if p_data.cle_idempotence:
                existing = db.query(Paiement).filter(Paiement.cle_idempotence == p_data.cle_idempotence).first()
                if existing:
                    validate_payment_idempotency(existing, p_data)
                    created_paiements.append(existing)
                    continue

            # Récupérer la transaction
            transaction = db.query(Transaction).filter(Transaction.id_transaction == p_data.id_transaction).first()
            if not transaction:
                raise HTTPException(status_code=404, detail=f"Transaction {p_data.id_transaction} introuvable")

            validate_payment_date(transaction, p_data.date_paiement)
                
            _validate_lc_payment(db, p_data, transaction, current_user)
            
            # Déterminer le statut initial
            statut_initial = 'valide'
            if p_data.type_paiement == 'cheque':
                statut_initial = 'valide' if p_data.statut_cheque == 'encaisse' else 'en_attente'
                
            # Créer le paiement
            nouveau_paiement = Paiement(
                **p_data.model_dump(),
                statut=statut_initial,
                id_utilisateur_creation=current_user.id_utilisateur if current_user else None
            )
            db.add(nouveau_paiement)
            db.flush()
            
            # Mouvement de caisse
            sync_payment_cash_movement(
                db,
                nouveau_paiement,
                transaction,
                current_user=current_user,
                reason="Création du paiement en lot",
            )
            created_paiements.append(nouveau_paiement)
            
        db.commit()
        for p in created_paiements:
            db.refresh(p)
            
        return created_paiements
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


