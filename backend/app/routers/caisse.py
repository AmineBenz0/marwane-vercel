"""
Router FastAPI pour la gestion de la caisse.
Gère les endpoints pour les mouvements, le solde et l'historique de la caisse.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case, or_, and_
from datetime import datetime, date
from decimal import Decimal

from app.database import get_db
from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.transaction import Transaction
from app.models.paiement import Paiement
from app.schemas.caisse import (
    MouvementCaisseRead,
    SoldeCaisseRead,
    SoldeCaisseCompletRead,
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
    # Mouvements de caisse filtrés : inclure les mouvements liés aux transactions actives 
    # OU les mouvements sans transaction (comme les dépenses/charges)
    query = db.query(Caisse).outerjoin(
        Transaction, Caisse.id_transaction == Transaction.id_transaction
    ).filter(
        or_(
            Transaction.est_actif == True,
            Caisse.id_transaction.is_(None)
        )
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
    Récupère le solde actuel de la caisse calculé en temps réel (THÉORIQUE).
    
    ⚠️ ATTENTION : Ce solde est basé sur les TRANSACTIONS, pas sur les paiements réels.
    Pour avoir le solde réel basé sur les encaissements, utilisez /solde/complet
    
    Le solde est calculé comme la différence entre les entrées et les sorties :
    solde = somme(ENTREE) - somme(SORTIE)
    
    Args:
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Solde actuel de la caisse avec la date du dernier mouvement (SoldeCaisseRead)
    """
    # Calculer le solde théorique : somme des transactions clients - somme des transactions fournisseurs
    entrees = db.query(func.coalesce(func.sum(Transaction.montant_total), 0)).filter(
        Transaction.id_client.isnot(None),
        Transaction.est_actif == True
    ).scalar() or Decimal('0.00')
    
    sorties = db.query(func.coalesce(func.sum(Transaction.montant_total), 0)).filter(
        Transaction.id_fournisseur.isnot(None),
        Transaction.est_actif == True
    ).scalar() or Decimal('0.00')
    
    # Calculer le solde théorique
    solde_theorique = Decimal(str(entrees)) - Decimal(str(sorties))
    
    # Récupérer la date de la dernière transaction active
    derniere_maj = db.query(func.max(Transaction.date_transaction)).filter(
        Transaction.est_actif == True
    ).scalar()
    
    if not derniere_maj:
        derniere_maj = datetime.now()
    
    return SoldeCaisseRead(
        solde_actuel=solde_theorique,
        derniere_maj=derniere_maj
    )


@router.get("/solde/complet", response_model=SoldeCaisseCompletRead, status_code=status.HTTP_200_OK)
def get_solde_complet(
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère une vision complète de la caisse avec deux perspectives :
    
    1. 💰 SOLDE THÉORIQUE (Expected) : Basé sur les transactions enregistrées
       - Représente ce qui est "dû" (créances) et ce qui est "à payer" (dettes)
       - Calculé à partir des mouvements de caisse liés aux transactions
    
    2. 💵 SOLDE RÉEL (Actual) : Basé sur les paiements effectivement encaissés
       - Représente l'argent réellement entré/sorti de la caisse
       - Calculé à partir des paiements validés et des chèques encaissés
    
    3. 📊 ÉCART : Différence entre théorique et réel
       - Créances clients non encaissées
       - Dettes fournisseurs non payées
    
    Args:
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Vue complète du solde de la caisse (SoldeCaisseCompletRead)
    """
    
    # ==================== SOLDE THÉORIQUE ====================
    # Basé directement sur les transactions (Chiffre d'affaires attendu)
    
    entrees_theoriques = db.query(func.coalesce(func.sum(Transaction.montant_total), 0)).filter(
        Transaction.id_client.isnot(None),
        Transaction.est_actif == True
    ).scalar() or Decimal('0.00')
    
    sorties_theoriques = db.query(func.coalesce(func.sum(Transaction.montant_total), 0)).filter(
        Transaction.id_fournisseur.isnot(None),
        Transaction.est_actif == True
    ).scalar() or Decimal('0.00')
    
    solde_theorique = Decimal(str(entrees_theoriques)) - Decimal(str(sorties_theoriques))
    
    # Date du dernier mouvement (transaction)
    derniere_maj_transaction = db.query(func.max(Transaction.date_transaction)).filter(
        Transaction.est_actif == True
    ).scalar()
    
    # ==================== SOLDE RÉEL ====================
    # Basé sur les mouvements de caisse enregistrés (Paiements effectifs)
    
    entrees_reelles = db.query(func.coalesce(func.sum(Caisse.montant), 0)).join(
        Transaction, Caisse.id_transaction == Transaction.id_transaction
    ).filter(
        Caisse.type_mouvement == 'ENTREE',
        Transaction.est_actif == True
    ).scalar() or Decimal('0.00')
    
    sorties_reelles = db.query(func.coalesce(func.sum(Caisse.montant), 0)).outerjoin(
        Transaction, Caisse.id_transaction == Transaction.id_transaction
    ).filter(
        Caisse.type_mouvement == 'SORTIE',
        or_(
            Transaction.est_actif == True,
            Caisse.id_transaction.is_(None)
        )
    ).scalar() or Decimal('0.00')
    
    solde_reel = Decimal(str(entrees_reelles)) - Decimal(str(sorties_reelles))
    
    # Date du dernier paiement/mouvement
    derniere_maj_paiement = db.query(func.max(Caisse.date_mouvement)).scalar()
    
    # ==================== ÉCART ET DÉTAILS ====================
    
    ecart = solde_theorique - solde_reel
    
    # Créances clients = Transactions clients - Paiements clients
    creances_clients = Decimal(str(entrees_theoriques)) - Decimal(str(entrees_reelles))
    
    # Dettes fournisseurs = Transactions fournisseurs - Paiements fournisseurs
    dettes_fournisseurs = Decimal(str(sorties_theoriques)) - Decimal(str(sorties_reelles))
    
    return SoldeCaisseCompletRead(
        # Solde théorique
        solde_theorique=solde_theorique,
        entrees_theoriques=Decimal(str(entrees_theoriques)),
        sorties_theoriques=Decimal(str(sorties_theoriques)),
        
        # Solde réel
        solde_reel=solde_reel,
        entrees_reelles=Decimal(str(entrees_reelles)),
        sorties_reelles=Decimal(str(sorties_reelles)),
        
        # Écart
        ecart=ecart,
        creances_clients=creances_clients,
        dettes_fournisseurs=dettes_fournisseurs,
        
        # Métadonnées
        derniere_maj_transaction=derniere_maj_transaction,
        derniere_maj_paiement=derniere_maj_paiement
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

