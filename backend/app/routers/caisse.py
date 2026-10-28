"""
Router FastAPI pour la gestion de la caisse.
Gère les endpoints pour les mouvements, le solde et l'historique de la caisse.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from datetime import datetime, date, timezone
from decimal import Decimal

from app.database import get_db
from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.transaction import Transaction
from app.models.lettre_credit import LettreDeCredit
from app.schemas.caisse import (
    MouvementCaisseRead,
    SoldeCaisseRead,
    SoldeCaisseCompletRead,
    HistoriqueSoldeRead
)
from app.utils.dependencies import get_current_active_user
from app.utils.business_date import business_date
from app.models.user import Utilisateur
from app.services.financial import financial_position_as_of, cash_ledger_as_of

router = APIRouter(prefix="/caisse", tags=["Caisse"])


def _get_lc_disponibles_total(db: Session, as_of: Optional[date] = None) -> Decimal:
    """Valeur des LC actives et utilisables aujourd'hui, comptees comme caisse."""
    as_of = as_of or business_date()
    total = db.query(func.coalesce(func.sum(LettreDeCredit.montant), 0)).filter(
        LettreDeCredit.statut == 'active',
        LettreDeCredit.date_disponibilite <= as_of
    ).scalar() or Decimal('0.00')
    return Decimal(str(total))


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
    query = db.query(Caisse).options(joinedload(Caisse.charge)).outerjoin(
        Transaction, Caisse.id_transaction == Transaction.id_transaction
    ).filter(
        Caisse.statut == "active",
        or_(
            Transaction.est_actif,
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
    date_as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère le solde actuel de la caisse calculé en temps réel (THÉORIQUE).
    
    Renvoie le solde espèces calculé depuis les mouvements de caisse valides.
    
    Args:
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Solde actuel de la caisse avec la date du dernier mouvement (SoldeCaisseRead)
    """
    as_of = date_as_of or business_date()
    solde_caisse = cash_ledger_as_of(db, as_of)["balance"]
    derniere_maj = db.query(func.max(Caisse.date_mouvement)).filter(
        Caisse.statut == "active",
        Caisse.id_cession.is_(None),
        func.date(Caisse.date_mouvement) <= as_of,
    ).scalar()
    
    if not derniere_maj:
        derniere_maj = datetime.now(timezone.utc)
    
    return SoldeCaisseRead(
        solde_actuel=solde_caisse,
        derniere_maj=derniere_maj
    )


@router.get("/solde/complet", response_model=SoldeCaisseCompletRead, status_code=status.HTTP_200_OK)
def get_solde_complet(
    date_as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Les créances et dettes viennent des transactions et paiements valides,
    quel que soit le moyen de paiement. Le solde espèces vient uniquement des
    mouvements de caisse; les soldes bancaires sont calculés séparément.
    
    Args:
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Vue complète du solde de la caisse (SoldeCaisseCompletRead)
    """
    
    as_of = date_as_of or business_date()

    # ==================== POSITION FINANCIÈRE ====================
    # Créances/dettes nettes des paiements valides, tous moyens confondus.
    
    entrees_theoriques = db.query(func.coalesce(func.sum(Transaction.montant_total), 0)).filter(
        Transaction.id_client.isnot(None),
        Transaction.est_actif,
        Transaction.date_transaction <= as_of,
    ).scalar() or Decimal('0.00')
    
    sorties_theoriques = db.query(func.coalesce(func.sum(Transaction.montant_total), 0)).filter(
        Transaction.id_fournisseur.isnot(None),
        Transaction.est_actif,
        Transaction.date_transaction <= as_of,
    ).scalar() or Decimal('0.00')
    
    lc_disponibles = _get_lc_disponibles_total(db, as_of)
    entrees_theoriques = Decimal(str(entrees_theoriques)) + lc_disponibles
    sorties_theoriques = Decimal(str(sorties_theoriques))
    solde_theorique = entrees_theoriques - sorties_theoriques
    
    # Date du dernier mouvement (transaction)
    derniere_maj_transaction = db.query(func.max(Transaction.date_transaction)).filter(
        Transaction.est_actif,
        Transaction.date_transaction <= as_of,
    ).scalar()
    
    # ==================== SOLDES DE CAISSE ====================
    # Caisse snapshots are not added to the ledger; LC cessions are not cash.
    cash = cash_ledger_as_of(db, as_of)
    solde_reel = cash["balance"]
    
    # Date du dernier paiement/mouvement
    derniere_maj_paiement = db.query(func.max(Caisse.date_mouvement)).filter(
        Caisse.statut == "active",
        Caisse.id_cession.is_(None),
        func.date(Caisse.date_mouvement) <= as_of,
    ).scalar()
    
    # ==================== ÉCART ET DÉTAILS ====================
    
    position = financial_position_as_of(db, as_of)
    ecart = position["receivables"] - position["payables"]
    
    return SoldeCaisseCompletRead(
        # Solde théorique
        solde_theorique=solde_theorique,
        entrees_theoriques=entrees_theoriques,
        sorties_theoriques=sorties_theoriques,
        
        # Solde réel
        solde_reel=solde_reel,
        solde_caisse=solde_reel,
        entrees_reelles=cash["inflows"],
        sorties_reelles=cash["outflows"],
        
        # Écart
        ecart=ecart,
        creances_clients=position["receivables"],
        dettes_fournisseurs=position["payables"],
        date_soldes=as_of,
        
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

