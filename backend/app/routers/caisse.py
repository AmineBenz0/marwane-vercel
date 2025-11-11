"""
Router FastAPI pour la gestion de la caisse.
Gère les endpoints pour les mouvements, le solde et l'historique de la caisse.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime, date
from decimal import Decimal

from app.database import get_db
from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.transaction import Transaction
from app.schemas.caisse import (
    MouvementCaisseRead,
    SoldeCaisseRead,
    HistoriqueSoldeRead
)
from app.utils.dependencies import get_current_active_user
from app.models.user import Utilisateur

router = APIRouter(prefix="/caisse", tags=["Caisse"])


@router.get("/mouvements", response_model=List[MouvementCaisseRead], status_code=status.HTTP_200_OK)
def get_mouvements(
    skip: int = 0,
    limit: int = 100,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    type_mouvement: Optional[str] = None,
    id_transaction: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère la liste des mouvements de caisse avec filtres optionnels.
    
    Permet de filtrer par date, type de mouvement et transaction associée.
    
    Args:
        skip: Nombre de mouvements à sauter (pour la pagination)
        limit: Nombre maximum de mouvements à retourner
        date_debut: Date de début pour filtrer les mouvements (inclusive)
        date_fin: Date de fin pour filtrer les mouvements (inclusive)
        type_mouvement: Type de mouvement ('ENTREE' ou 'SORTIE')
        id_transaction: ID de la transaction pour filtrer les mouvements
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Liste des mouvements de caisse (MouvementCaisseRead)
    """
    # Filtrer pour ne montrer que les mouvements liés aux transactions actives
    query = db.query(Caisse).join(
        Transaction, Caisse.id_transaction == Transaction.id_transaction
    ).filter(
        Transaction.est_actif == True
    )
    
    # Filtre par date
    if date_debut:
        query = query.filter(func.date(Caisse.date_mouvement) >= date_debut)
    if date_fin:
        query = query.filter(func.date(Caisse.date_mouvement) <= date_fin)
    
    # Filtre par type de mouvement
    if type_mouvement:
        if type_mouvement not in ['ENTREE', 'SORTIE']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="type_mouvement doit être 'ENTREE' ou 'SORTIE'"
            )
        query = query.filter(Caisse.type_mouvement == type_mouvement)
    
    # Filtre par transaction
    if id_transaction is not None:
        query = query.filter(Caisse.id_transaction == id_transaction)
    
    # Pagination et tri
    mouvements = query.order_by(Caisse.date_mouvement.desc()).offset(skip).limit(limit).all()
    
    return mouvements


@router.get("/solde", response_model=SoldeCaisseRead, status_code=status.HTTP_200_OK)
def get_solde(
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère le solde actuel de la caisse calculé en temps réel.
    
    Le solde est calculé comme la différence entre les entrées et les sorties :
    solde = somme(ENTREE) - somme(SORTIE)
    
    Args:
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Solde actuel de la caisse avec la date du dernier mouvement (SoldeCaisseRead)
    """
    # Calculer le solde : somme des entrées - somme des sorties
    # IMPORTANT : Ne compter que les mouvements liés aux transactions actives
    # Calculer séparément les entrées et sorties
    entrees = db.query(func.coalesce(func.sum(Caisse.montant), 0)).join(
        Transaction, Caisse.id_transaction == Transaction.id_transaction
    ).filter(
        Caisse.type_mouvement == 'ENTREE',
        Transaction.est_actif == True
    ).scalar() or Decimal('0.00')
    
    sorties = db.query(func.coalesce(func.sum(Caisse.montant), 0)).join(
        Transaction, Caisse.id_transaction == Transaction.id_transaction
    ).filter(
        Caisse.type_mouvement == 'SORTIE',
        Transaction.est_actif == True
    ).scalar() or Decimal('0.00')
    
    # Calculer le solde
    solde_actuel = Decimal(str(entrees)) - Decimal(str(sorties))
    
    # Récupérer la date du dernier mouvement (uniquement des transactions actives)
    derniere_maj = db.query(func.max(Caisse.date_mouvement)).join(
        Transaction, Caisse.id_transaction == Transaction.id_transaction
    ).filter(
        Transaction.est_actif == True
    ).scalar()
    if not derniere_maj:
        derniere_maj = datetime.now()
    
    return SoldeCaisseRead(
        solde_actuel=solde_actuel,
        derniere_maj=derniere_maj
    )


@router.get("/historique", response_model=List[HistoriqueSoldeRead], status_code=status.HTTP_200_OK)
def get_historique(
    skip: int = 0,
    limit: int = 100,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère l'historique du solde de la caisse.
    
    Retourne les snapshots historiques du solde de la caisse, triés par date
    (plus récent en premier).
    
    Args:
        skip: Nombre d'enregistrements à sauter (pour la pagination)
        limit: Nombre maximum d'enregistrements à retourner
        date_debut: Date de début pour filtrer l'historique (inclusive)
        date_fin: Date de fin pour filtrer l'historique (inclusive)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Liste des enregistrements d'historique du solde (HistoriqueSoldeRead)
    """
    query = db.query(CaisseSoldeHistorique)
    
    # Filtre par date
    if date_debut:
        query = query.filter(func.date(CaisseSoldeHistorique.date_snapshot) >= date_debut)
    if date_fin:
        query = query.filter(func.date(CaisseSoldeHistorique.date_snapshot) <= date_fin)
    
    # Pagination et tri
    historique = query.order_by(
        CaisseSoldeHistorique.date_snapshot.desc()
    ).offset(skip).limit(limit).all()
    
    return historique

