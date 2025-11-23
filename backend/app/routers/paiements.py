"""
Router FastAPI pour la gestion des paiements.
Gère les endpoints pour créer, lire, modifier et supprimer des paiements.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal

from app.database import get_db
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.schemas.paiement import (
    PaiementCreate, PaiementUpdate, PaiementRead, 
    StatutPaiementTransaction, PaiementSummary
)
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/paiements", tags=["Paiements"])


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
    
    # Vérifier que le montant ne dépasse pas le montant restant
    montant_restant = transaction.montant_restant
    if paiement_data.montant > montant_restant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le montant du paiement ({paiement_data.montant} MAD) dépasse "
                   f"le montant restant à payer ({montant_restant} MAD)"
        )
    
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
        notes=paiement_data.notes,
        statut=statut_initial,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    db.add(nouveau_paiement)
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

