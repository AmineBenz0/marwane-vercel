"""
Router FastAPI pour la gestion des fournisseurs.
Gère les endpoints CRUD pour les fournisseurs.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from decimal import Decimal
from datetime import date
from dateutil.relativedelta import relativedelta
from app.database import get_db
from app.models.fournisseur import Fournisseur
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.schemas.fournisseur import FournisseurCreate, FournisseurUpdate, FournisseurRead, FournisseurProfile, FournisseurProfileStats, FournisseurStatsMensuelles, FournisseurStatsMensuellesItem
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/fournisseurs", tags=["Fournisseurs"])


@router.get("", response_model=List[FournisseurRead], status_code=status.HTTP_200_OK)
def get_fournisseurs(
    skip: int = 0,
    limit: int = 100,
    est_actif: Optional[bool] = None,
    recherche: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Récupère la liste des fournisseurs avec filtres optionnels.
    
    Permet de filtrer par statut actif/inactif et de rechercher par nom.
    
    Args:
        skip: Nombre de fournisseurs à sauter (pour la pagination)
        limit: Nombre maximum de fournisseurs à retourner
        est_actif: Filtre optionnel pour les fournisseurs actifs/inactifs (None = tous)
        recherche: Terme de recherche optionnel pour filtrer par nom (recherche partielle, insensible à la casse)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Liste des fournisseurs (FournisseurRead)
    """
    query = db.query(Fournisseur)
    
    # Filtre par est_actif si fourni
    if est_actif is not None:
        query = query.filter(Fournisseur.est_actif == est_actif)
    
    # Filtre par recherche (nom_fournisseur) si fourni
    if recherche:
        recherche_clean = recherche.strip()
        if recherche_clean:
            query = query.filter(
                Fournisseur.nom_fournisseur.ilike(f"%{recherche_clean}%")
            )
    
    # Pagination
    fournisseurs = query.offset(skip).limit(limit).all()
    
    return fournisseurs


@router.get("/{id}/profile", response_model=FournisseurProfile, status_code=status.HTTP_200_OK)
def get_fournisseur_profile(
    id: int,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Récupère le profil complet d'un fournisseur avec ses statistiques et transactions.
    
    Retourne les informations du fournisseur, des statistiques agrégées (nombre de transactions,
    montant total, montant moyen, dates première/dernière transaction) et une liste paginée
    des transactions du fournisseur.
    
    Args:
        id: ID du fournisseur
        skip: Nombre de transactions à sauter (pour la pagination)
        limit: Nombre maximum de transactions à retourner (défaut: 20)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Profil complet du fournisseur (FournisseurProfile) avec statistiques et transactions paginées
        
    Raises:
        HTTPException 404: Si le fournisseur n'existe pas
    """
    # Vérifier que le fournisseur existe
    fournisseur = db.query(Fournisseur).filter(Fournisseur.id_fournisseur == id).first()
    
    if not fournisseur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fournisseur avec l'ID {id} introuvable"
        )
    
    # Calculer les statistiques agrégées avec une seule requête optimisée
    stats_query = db.query(
        func.count(Transaction.id_transaction).label('total_transactions'),
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0')).label('montant_total_achats'),
        func.avg(Transaction.montant_total).label('montant_moyen'),
        func.min(Transaction.date_transaction).label('date_premiere'),
        func.max(Transaction.date_transaction).label('date_derniere')
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True  # Seulement les transactions actives
    )
    
    stats_result = stats_query.first()
    
    # Extraire les statistiques (gérer les cas NULL)
    total_transactions = stats_result.total_transactions or 0
    montant_total_achats = stats_result.montant_total_achats or Decimal('0')
    montant_moyen = Decimal(str(stats_result.montant_moyen)) if stats_result.montant_moyen is not None else None
    date_premiere = stats_result.date_premiere
    date_derniere = stats_result.date_derniere
    
    # Créer l'objet statistiques
    statistiques = FournisseurProfileStats(
        total_transactions=total_transactions,
        montant_total_achats=montant_total_achats,
        montant_moyen_transaction=montant_moyen,
        date_premiere_transaction=date_premiere,
        date_derniere_transaction=date_derniere
    )
    
    # Récupérer les transactions paginées (triées par date décroissante)
    transactions = db.query(Transaction).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True
    ).order_by(
        Transaction.date_transaction.desc()
    ).offset(skip).limit(limit).all()
    
    # Construire la réponse
    profile = FournisseurProfile(
        fournisseur=fournisseur,
        statistiques=statistiques,
        transactions=transactions
    )
    
    return profile


@router.get("/{id}", response_model=FournisseurRead, status_code=status.HTTP_200_OK)
def get_fournisseur(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Récupère les détails d'un fournisseur par son ID.
    
    Args:
        id: ID du fournisseur à récupérer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Détails du fournisseur (FournisseurRead)
        
    Raises:
        HTTPException 404: Si le fournisseur n'existe pas
    """
    fournisseur = db.query(Fournisseur).filter(Fournisseur.id_fournisseur == id).first()
    
    if not fournisseur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fournisseur avec l'ID {id} introuvable"
        )
    
    return fournisseur


@router.get("/{id}/stats-mensuelles", response_model=FournisseurStatsMensuelles, status_code=status.HTTP_200_OK)
def get_fournisseur_stats_mensuelles(
    id: int,
    periode: int = Query(6, ge=6, le=12, description="Nombre de mois à retourner (6 ou 12)"),
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Récupère les statistiques mensuelles d'un fournisseur pour une période donnée.
    
    Retourne les données agrégées par mois (montant total et nombre de transactions)
    pour les 6 ou 12 derniers mois. Les mois sans transactions sont inclus avec des valeurs à 0.
    
    Args:
        id: ID du fournisseur
        periode: Nombre de mois à retourner (6 ou 12, défaut: 6)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Statistiques mensuelles (FournisseurStatsMensuelles) avec données agrégées par mois
        
    Raises:
        HTTPException 404: Si le fournisseur n'existe pas
        HTTPException 400: Si la période n'est pas valide (doit être 6 ou 12)
    """
    # Vérifier que le fournisseur existe
    fournisseur = db.query(Fournisseur).filter(Fournisseur.id_fournisseur == id).first()
    
    if not fournisseur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fournisseur avec l'ID {id} introuvable"
        )
    
    # Valider la période
    if periode not in [6, 12]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La période doit être 6 ou 12 mois"
        )
    
    # Calculer la date de début (N mois avant aujourd'hui, premier jour du mois)
    date_fin = date.today()
    # Calculer le premier jour du mois qui est N mois avant aujourd'hui
    date_debut = (date_fin.replace(day=1) - relativedelta(months=periode-1))
    
    # Requête pour obtenir les statistiques agrégées par mois
    # Utiliser extract pour être compatible avec SQLite et PostgreSQL
    # Extraire l'année et le mois, puis formater en Python
    stats_query = db.query(
        extract('year', Transaction.date_transaction).label('annee'),
        extract('month', Transaction.date_transaction).label('mois'),
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0')).label('montant'),
        func.count(Transaction.id_transaction).label('nb_transactions')
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Transaction.date_transaction >= date_debut,
        Transaction.date_transaction <= date_fin
    ).group_by(
        extract('year', Transaction.date_transaction),
        extract('month', Transaction.date_transaction)
    ).order_by(
        extract('year', Transaction.date_transaction),
        extract('month', Transaction.date_transaction)
    )
    
    # Récupérer les résultats
    stats_results = stats_query.all()
    
    # Créer un dictionnaire avec les données réelles
    stats_dict = {}
    for result in stats_results:
        # Formater le mois en YYYY-MM
        mois_key = f"{int(result.annee)}-{int(result.mois):02d}"
        stats_dict[mois_key] = {
            'montant': result.montant or Decimal('0'),
            'nb_transactions': result.nb_transactions or 0
        }
    
    # Générer tous les mois de la période (même ceux sans transactions)
    data = []
    current_date = date_debut  # Premier jour du mois de début
    
    while current_date <= date_fin:
        mois_key = current_date.strftime('%Y-%m')
        
        # Utiliser les données réelles si disponibles, sinon 0
        montant = stats_dict.get(mois_key, {}).get('montant', Decimal('0'))
        nb_transactions = stats_dict.get(mois_key, {}).get('nb_transactions', 0)
        
        data.append(FournisseurStatsMensuellesItem(
            mois=mois_key,
            montant=montant,
            nb_transactions=nb_transactions
        ))
        
        # Passer au mois suivant
        current_date = current_date + relativedelta(months=1)
    
    # Formater la période pour la réponse
    periode_str = f"{periode}_mois"
    
    return FournisseurStatsMensuelles(
        periode=periode_str,
        data=data
    )


@router.post("", response_model=FournisseurRead, status_code=status.HTTP_201_CREATED)
def create_fournisseur(
    fournisseur_data: FournisseurCreate,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Crée un nouveau fournisseur.
    
    Enregistre automatiquement l'ID de l'utilisateur qui a créé le fournisseur.
    
    Args:
        fournisseur_data: Données du nouveau fournisseur (FournisseurCreate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Fournisseur créé (FournisseurRead)
        
    Raises:
        HTTPException 400: Si un fournisseur avec le même nom existe déjà
    """
    # Vérifier si un fournisseur avec le même nom existe déjà (actif ou inactif)
    existing_fournisseur = db.query(Fournisseur).filter(
        Fournisseur.nom_fournisseur == fournisseur_data.nom_fournisseur.strip()
    ).first()
    
    if existing_fournisseur:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Un fournisseur avec le nom '{fournisseur_data.nom_fournisseur}' existe déjà"
        )
    
    # Créer le nouveau fournisseur
    new_fournisseur = Fournisseur(
        nom_fournisseur=fournisseur_data.nom_fournisseur.strip(),
        est_actif=fournisseur_data.est_actif,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    db.add(new_fournisseur)
    db.commit()
    db.refresh(new_fournisseur)
    
    return new_fournisseur


@router.put("/{id}", response_model=FournisseurRead, status_code=status.HTTP_200_OK)
def update_fournisseur(
    id: int,
    fournisseur_data: FournisseurUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Met à jour un fournisseur existant.
    
    Permet une mise à jour partielle (seuls les champs fournis seront modifiés).
    Enregistre automatiquement l'ID de l'utilisateur qui a modifié le fournisseur.
    
    Args:
        id: ID du fournisseur à modifier
        fournisseur_data: Données à mettre à jour (FournisseurUpdate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Fournisseur mis à jour (FournisseurRead)
        
    Raises:
        HTTPException 404: Si le fournisseur n'existe pas
        HTTPException 400: Si un autre fournisseur avec le même nom existe déjà
    """
    fournisseur = db.query(Fournisseur).filter(Fournisseur.id_fournisseur == id).first()
    
    if not fournisseur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fournisseur avec l'ID {id} introuvable"
        )
    
    # Vérifier si le nom existe déjà pour un autre fournisseur
    if fournisseur_data.nom_fournisseur is not None:
        nom_clean = fournisseur_data.nom_fournisseur.strip()
        existing_fournisseur = db.query(Fournisseur).filter(
            Fournisseur.nom_fournisseur == nom_clean,
            Fournisseur.id_fournisseur != id
        ).first()
        
        if existing_fournisseur:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Un fournisseur avec le nom '{nom_clean}' existe déjà"
            )
    
    # Mettre à jour les champs fournis
    update_data = fournisseur_data.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        if field == "nom_fournisseur" and value is not None:
            setattr(fournisseur, field, value.strip())
        else:
            setattr(fournisseur, field, value)
    
    # Enregistrer l'utilisateur qui a modifié
    fournisseur.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    db.commit()
    db.refresh(fournisseur)
    
    return fournisseur


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fournisseur(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Supprime un fournisseur (soft delete).
    
    Effectue un soft delete en mettant est_actif à False.
    Le fournisseur ne sera plus visible dans les listes par défaut mais restera en base de données.
    Enregistre automatiquement l'ID de l'utilisateur qui a supprimé le fournisseur.
    
    Args:
        id: ID du fournisseur à supprimer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Raises:
        HTTPException 404: Si le fournisseur n'existe pas
        HTTPException 400: Si le fournisseur est déjà inactif
    """
    fournisseur = db.query(Fournisseur).filter(Fournisseur.id_fournisseur == id).first()
    
    if not fournisseur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fournisseur avec l'ID {id} introuvable"
        )
    
    # Vérifier si le fournisseur est déjà inactif
    if not fournisseur.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le fournisseur avec l'ID {id} est déjà inactif"
        )
    
    # Soft delete : mettre est_actif à False
    fournisseur.est_actif = False
    fournisseur.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    db.commit()
    
    return None


@router.patch("/{id}/reactivate", response_model=FournisseurRead, status_code=status.HTTP_200_OK)
def reactivate_fournisseur(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Réactive un fournisseur inactif.
    
    Effectue l'inverse du soft delete en remettant est_actif à True.
    Enregistre automatiquement l'ID de l'utilisateur qui a réactivé le fournisseur.
    
    Args:
        id: ID du fournisseur à réactiver
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance, None si auth désactivée)
        
    Returns:
        Fournisseur réactivé (FournisseurRead)
        
    Raises:
        HTTPException 404: Si le fournisseur n'existe pas
        HTTPException 400: Si le fournisseur est déjà actif
    """
    fournisseur = db.query(Fournisseur).filter(Fournisseur.id_fournisseur == id).first()
    
    if not fournisseur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fournisseur avec l'ID {id} introuvable"
        )
    
    # Vérifier si le fournisseur est déjà actif
    if fournisseur.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le fournisseur avec l'ID {id} est déjà actif"
        )
    
    # Réactiver : mettre est_actif à True
    fournisseur.est_actif = True
    # Enregistrer l'utilisateur qui a réactivé (si authentification activée)
    fournisseur.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    db.commit()
    db.refresh(fournisseur)
    
    return fournisseur
