"""
Router FastAPI pour la gestion des paiements.
Gère les endpoints pour créer, lire, modifier et supprimer des paiements.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime, date
from decimal import Decimal

from app.database import get_db
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.models.lettre_credit import LettreDeCredit
from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.user import Utilisateur
from app.schemas.paiement import (
    PaiementCreate, PaiementUpdate, PaiementRead, 
    PaiementBatchCreate, StatutPaiementTransaction, PaiementSummary
)
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/paiements", tags=["Paiements"])


def _update_caisse_movement(db: Session, paiement: Paiement, transaction: Transaction):
    """
    Helper pour créer/mettre à jour un mouvement de caisse lié à un paiement.
    """
    # Types qui affectent immédiatement la caisse
    types_immediats = ['cash', 'virement', 'lc', 'carte', 'compensation', 'autre']
    
    doit_creer_mouvement = False
    
    # 1. Vérifier si on doit créer un mouvement
    if paiement.type_paiement in types_immediats and paiement.statut == 'valide':
        doit_creer_mouvement = True
    elif paiement.type_paiement == 'cheque' and paiement.statut_cheque == 'encaisse':
        doit_creer_mouvement = True
        
    if doit_creer_mouvement:
        # Vérifier si un mouvement existe déjà pour ce paiement
        existing = db.query(Caisse).filter(Caisse.id_paiement == paiement.id_paiement).first()
        if existing:
            # Mettre à jour le montant si nécessaire
            if existing.montant != paiement.montant:
                existing.montant = paiement.montant
            return existing

        # Déterminer le type de mouvement (ENTRÉE pour client, SORTIE pour fournisseur)
        type_mouvement = 'ENTREE' if transaction.id_client is not None else 'SORTIE'
        
        # Créer le nouveau mouvement
        new_mouvement = Caisse(
            montant=paiement.montant,
            type_mouvement=type_mouvement,
            id_transaction=transaction.id_transaction,
            id_paiement=paiement.id_paiement,
            # On utilise la date du paiement pour le mouvement de caisse
            date_mouvement=datetime.combine(paiement.date_paiement, datetime.min.time())
        )
        db.add(new_mouvement)
        db.flush() # Pour obtenir id_mouvement
        
        # Mettre à jour l'historique de solde (Snapshot)
        _create_caisse_snapshot(db, new_mouvement.id_mouvement)
        
        return new_mouvement
    else:
        # Si on ne doit pas avoir de mouvement, mais qu'il en existe un (ex: statut changé), on le supprime
        existing = db.query(Caisse).filter(Caisse.id_paiement == paiement.id_paiement).first()
        if existing:
            # Avant de supprimer, on pourrait vouloir marquer le snapshot ? 
            # Pour simplifier, on supprime juste le mouvement. 
            # Les snapshots suivants recalculeront le solde correctement.
            db.delete(existing)
            db.flush()
            
    return None


def _create_caisse_snapshot(db: Session, id_mouvement: int):
    """
    Crée un snapshot du solde après un mouvement.
    """
    solde_actuel = db.query(
        func.sum(
            case(
                (Caisse.type_mouvement == 'ENTREE', Caisse.montant),
                else_=-Caisse.montant
            )
        )
    ).scalar() or Decimal('0.00')
    
    new_history = CaisseSoldeHistorique(
        solde=solde_actuel,
        id_mouvement=id_mouvement,
        date_snapshot=datetime.now()
    )
    db.add(new_history)




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
    # Vérifier que la transaction existe
    transaction = db.query(Transaction).filter(
        Transaction.id_transaction == paiement_data.id_transaction
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {paiement_data.id_transaction} introuvable"
        )
    
    # Note: Les paiements dépassant le montant restant sont autorisés (avances, surpaiements)
    
    # Logique spécifique pour les Lettres de Crédit (LC)
    if paiement_data.type_paiement == 'lc':
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
            
        # 1. Vérifier le statut
        if lc.statut != 'active':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La Lettre de Crédit n'est pas active (Statut: {lc.statut})"
            )
            
        # 2. Vérifier la disponibilité (date)
        if not lc.est_disponible:
            from datetime import date
            if lc.date_disponibilite > date.today():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cette LC ne sera disponible qu'à partir du {lc.date_disponibilite}"
                )
        
        # 3. Vérifier le montant (Doit être utilisée en totalité)
        if paiement_data.montant != lc.montant:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Le montant du paiement ({paiement_data.montant} MAD) doit correspondre "
                       f"au montant total de la LC ({lc.montant} MAD) car elle doit être utilisée en totalité."
            )
            
        # 4. Vérifier le détenteur (Optionnel mais recommandé)
        if transaction.id_client and lc.type_detenteur == 'client' and lc.id_client != transaction.id_client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cette LC n'appartient pas au client de cette transaction"
            )
        if transaction.id_fournisseur and lc.type_detenteur == 'fournisseur' and lc.id_fournisseur != transaction.id_fournisseur:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cette LC n'appartient pas au fournisseur de cette transaction"
            )
            
        # Marquer la LC comme utilisée
        lc.statut = 'utilisee'
        lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    # Déterminer le statut initial
    statut_initial = 'valide'
    if paiement_data.type_paiement == 'cheque':
        statut_initial = 'en_attente'  # Les chèques sont en attente par défaut
    
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
        statut=statut_initial,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    db.add(nouveau_paiement)
    db.flush() # Pour obtenir l'ID
    
    # Mettre à jour la caisse
    _update_caisse_movement(db, nouveau_paiement, transaction)
    
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
    
    # Mettre à jour les champs fournis
    update_data = paiement_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(paiement, field, value)
    
    # Mettre à jour l'utilisateur de modification
    paiement.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    # Mettre à jour la caisse si nécessaire (ex: chèque passé à 'encaisse')
    transaction = db.query(Transaction).filter(Transaction.id_transaction == paiement.id_transaction).first()
    if transaction:
        _update_caisse_movement(db, paiement, transaction)
        
    db.commit()
    db.refresh(paiement)
    
    return paiement


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paiement(
    id: int,
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
    
    # Supprimer les mouvements de caisse associés
    caisse_mouvements = db.query(Caisse).filter(Caisse.id_paiement == id).all()
    for mvmt in caisse_mouvements:
        db.delete(mvmt)
        
    db.delete(paiement)
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
            # Récupérer la transaction
            transaction = db.query(Transaction).filter(Transaction.id_transaction == p_data.id_transaction).first()
            if not transaction:
                raise HTTPException(status_code=404, detail=f"Transaction {p_data.id_transaction} introuvable")
                
            # Logique LC (simplifiée ici, on réutilise la logique de create_paiement)
            if p_data.type_paiement == 'lc':
                lc = db.query(LettreDeCredit).filter(LettreDeCredit.id_lc == p_data.id_lc).first()
                if not lc or lc.statut != 'active':
                    raise HTTPException(status_code=400, detail=f"LC {p_data.id_lc} non disponible")
                lc.statut = 'utilisee'
                lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
            
            # Déterminer le statut initial
            statut_initial = 'valide'
            if p_data.type_paiement == 'cheque':
                statut_initial = 'en_attente'
                
            # Créer le paiement
            nouveau_paiement = Paiement(
                **p_data.model_dump(),
                statut=statut_initial,
                id_utilisateur_creation=current_user.id_utilisateur if current_user else None
            )
            db.add(nouveau_paiement)
            db.flush()
            
            # Mouvement de caisse
            _update_caisse_movement(db, nouveau_paiement, transaction)
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


