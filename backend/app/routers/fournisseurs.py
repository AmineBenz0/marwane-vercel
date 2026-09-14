"""
Router FastAPI pour la gestion des fournisseurs.
Gère les endpoints CRUD pour les fournisseurs.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, Date
from decimal import Decimal
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from app.database import get_db
from app.models.fournisseur import Fournisseur
from app.models.transaction import Transaction
from app.models.produit import Produit
from app.models.user import Utilisateur
from app.models.paiement import Paiement
from app.schemas.fournisseur import (
    FournisseurCreate, FournisseurUpdate, FournisseurRead, FournisseurProfile, 
    FournisseurProfileStats, FournisseurStatsMensuelles, FournisseurStatsMensuellesItem,
    FournisseurProduitsVendus, ProduitVendu, FournisseurInsightsFinanciers, FournisseurScore
)
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
    date_debut = (date_fin.replace(day=1) - relativedelta(months=periode-1))
    
    # --- 1. Calculer le solde initial (tout avant date_debut) ---
    total_achats_avant = db.query(func.coalesce(func.sum(Transaction.montant_total), 0)).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Transaction.date_transaction < date_debut
    ).scalar() or 0
    
    total_paiements_avant = db.query(func.coalesce(func.sum(Paiement.montant), 0)).join(
        Transaction, Paiement.id_transaction == Transaction.id_transaction
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Paiement.statut == 'valide',
        Paiement.date_paiement < date_debut
    ).scalar() or 0
    
    solde_initial = Decimal(str(total_achats_avant)) - Decimal(str(total_paiements_avant))
    
    # --- 2. Requête pour les achats mensuels ---
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
    )
    
    # --- 3. Requête pour les paiements mensuels ---
    paiements_query = db.query(
        extract('year', Paiement.date_paiement).label('annee'),
        extract('month', Paiement.date_paiement).label('mois'),
        func.coalesce(func.sum(Paiement.montant), Decimal('0')).label('montant')
    ).join(
        Transaction, Paiement.id_transaction == Transaction.id_transaction
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Paiement.statut == 'valide',
        Paiement.date_paiement >= date_debut,
        Paiement.date_paiement <= date_fin
    ).group_by(
        extract('year', Paiement.date_paiement),
        extract('month', Paiement.date_paiement)
    )
    
    stats_results = stats_query.all()
    paiements_results = paiements_query.all()
    
    # Consolider dans des dictionnaires
    achats_dict = {f"{int(r.annee)}-{int(r.mois):02d}": r for r in stats_results}
    paiements_dict = {f"{int(r.annee)}-{int(r.mois):02d}": r.montant for r in paiements_results}
    
    # Générer tous les mois avec solde cumulé
    data = []
    current_date = date_debut
    solde_courant = solde_initial
    
    while current_date <= date_fin:
        mois_key = current_date.strftime('%Y-%m')
        
        achats_mois = achats_dict.get(mois_key)
        montant_achats = achats_mois.montant if achats_mois else Decimal('0')
        nb_trans = achats_mois.nb_transactions if achats_mois else 0
        montant_paiements = paiements_dict.get(mois_key, Decimal('0'))
        
        # Le solde augmente avec les achats et diminue avec les paiements
        solde_courant += (montant_achats - montant_paiements)
        
        data.append(FournisseurStatsMensuellesItem(
            mois=mois_key,
            montant=montant_achats,
            paiements=montant_paiements,
            solde_cumule=solde_courant,
            nb_transactions=nb_trans
        ))
        
        current_date = current_date + relativedelta(months=1)
    
    return FournisseurStatsMensuelles(
        periode=f"{periode}_mois",
        data=data
    )


@router.get("/{id}/produits-vendus", response_model=FournisseurProduitsVendus, status_code=status.HTTP_200_OK)
def get_fournisseur_produits_vendus(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Récupère la liste des produits vendus par un fournisseur avec leurs statistiques.
    
    Retourne des statistiques agrégées par produit pour ce fournisseur :
    - Quantité totale vendue par produit
    - Montant total reçu par produit
    - Nombre de ventes (transactions) par produit
    - Prix moyen par produit
    - Dates de la première et dernière vente
    
    Args:
        id: ID du fournisseur
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        FournisseurProduitsVendus avec la liste des produits et statistiques globales
        
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
    
    # Requête pour agréger les données par produit
    produits_stats_query = db.query(
        Transaction.id_produit,
        Produit.nom_produit,
        func.sum(Transaction.quantite).label('quantite_totale'),
        func.sum(Transaction.montant_total).label('montant_total'),
        func.count(Transaction.id_transaction).label('nombre_ventes'),
        func.min(Transaction.date_transaction).label('premiere_date_vente'),
        func.max(Transaction.date_transaction).label('derniere_date_vente')
    ).join(
        Produit, Transaction.id_produit == Produit.id_produit
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True
    ).group_by(
        Transaction.id_produit,
        Produit.nom_produit
    ).order_by(
        func.sum(Transaction.montant_total).desc()  # Trier par montant total décroissant
    )
    
    # Récupérer les résultats
    produits_stats = produits_stats_query.all()
    
    # Calculer les statistiques globales
    nombre_produits_differents = len(produits_stats)
    quantite_totale_tous_produits = 0
    montant_total_tous_produits = Decimal('0')
    
    # Construire la liste des produits
    produits = []
    for stat in produits_stats:
        quantite_totale = int(stat.quantite_totale or 0)
        montant_total = Decimal(str(stat.montant_total or '0'))
        nombre_ventes = int(stat.nombre_ventes or 0)
        
        # Calculer le prix moyen (montant_total / quantite_totale)
        prix_moyen = montant_total / Decimal(str(quantite_totale)) if quantite_totale > 0 else Decimal('0')
        
        # Accumuler les totaux globaux
        quantite_totale_tous_produits += quantite_totale
        montant_total_tous_produits += montant_total
        
        # Créer l'objet ProduitVendu
        produit_vendu = ProduitVendu(
            id_produit=stat.id_produit,
            nom_produit=stat.nom_produit,
            quantite_totale=quantite_totale,
            montant_total=montant_total,
            nombre_ventes=nombre_ventes,
            prix_moyen=prix_moyen,
            premiere_date_vente=stat.premiere_date_vente,
            derniere_date_vente=stat.derniere_date_vente
        )
        
        produits.append(produit_vendu)
    
    # Construire la réponse
    return FournisseurProduitsVendus(
        fournisseur_id=id,
        nombre_produits_differents=nombre_produits_differents,
        quantite_totale_tous_produits=quantite_totale_tous_produits,
        montant_total_tous_produits=montant_total_tous_produits,
        produits=produits
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


@router.get("/{id}/insights-financiers", response_model=FournisseurInsightsFinanciers, status_code=status.HTTP_200_OK)
def get_fournisseur_insights_financiers(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Récupère les insights financiers avancés pour un fournisseur.
    
    Calcule des métriques avancées :
    - Taux de paiement (% du montant total payé)
    - Montant impayé (factures)
    - Délai moyen de paiement
    - Fréquence moyenne entre transactions
    - Dernière activité
    - Transactions en retard
    - Tendance (hausse/baisse/stable)
    
    Args:
        id: ID du fournisseur
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        FournisseurInsightsFinanciers avec toutes les métriques calculées
        
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
    
    # 1. Calculer le montant total des transactions actives
    montant_total_query = db.query(
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0'))
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True
    ).scalar()
    
    montant_total = Decimal(str(montant_total_query or '0'))
    
    # 2. Calculer le montant total payé
    montant_paye_query = db.query(
        func.coalesce(func.sum(Paiement.montant), Decimal('0'))
    ).join(
        Transaction, Paiement.id_transaction == Transaction.id_transaction
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Paiement.statut == 'valide'
    ).scalar()
    
    montant_paye = Decimal(str(montant_paye_query or '0'))
    
    # 3. Calculer le taux de paiement
    taux_paiement = float((montant_paye / montant_total * 100) if montant_total > 0 else 0)
    
    # 4. Calculer le montant impayé
    montant_impaye = montant_total - montant_paye
    
    # 5. Calculer le délai moyen de paiement (jours entre date_transaction et date_paiement)
    # En PostgreSQL, la soustraction de deux DATE renvoie le nombre de jours directement
    delais_query = db.query(
        func.avg(
            func.cast(Paiement.date_paiement, Date) - func.cast(Transaction.date_transaction, Date)
        )
    ).join(
        Transaction, Paiement.id_transaction == Transaction.id_transaction
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Paiement.statut == 'valide'
    ).scalar()
    
    delai_moyen_paiement = float(delais_query) if delais_query else None
    
    # 6. Calculer la fréquence moyenne entre transactions
    # Récupérer toutes les dates de transaction triées
    dates_transactions = db.query(
        Transaction.date_transaction
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True
    ).order_by(
        Transaction.date_transaction
    ).all()
    
    frequence_moyenne = None
    if len(dates_transactions) > 1:
        # Calculer les différences entre transactions consécutives
        deltas = []
        for i in range(1, len(dates_transactions)):
            delta = (dates_transactions[i][0] - dates_transactions[i-1][0]).days
            deltas.append(delta)
        
        if deltas:
            frequence_moyenne = sum(deltas) / len(deltas)
    
    # 7. Calculer le nombre de jours depuis la dernière transaction
    derniere_transaction = db.query(
        func.max(Transaction.date_transaction)
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True
    ).scalar()
    
    jours_depuis_derniere_transaction = None
    if derniere_transaction:
        jours_depuis_derniere_transaction = (datetime.now().date() - derniere_transaction).days
    
    # 8. Calculer les transactions en retard
    today = date.today()
    
    # Transactions avec date_echeance dépassée et non entièrement payées
    transactions_en_retard_query = db.query(
        Transaction.id_transaction,
        Transaction.montant_total,
        func.coalesce(func.sum(Paiement.montant), Decimal('0')).label('montant_paye')
    ).outerjoin(
        Paiement, (Paiement.id_transaction == Transaction.id_transaction) & (Paiement.statut == 'valide')
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Transaction.date_echeance.isnot(None),
        Transaction.date_echeance < today
    ).group_by(
        Transaction.id_transaction,
        Transaction.montant_total
    ).all()
    
    nombre_transactions_en_retard = 0
    montant_en_retard = Decimal('0')
    
    for trans in transactions_en_retard_query:
        montant_restant = Decimal(str(trans.montant_total)) - Decimal(str(trans.montant_paye or '0'))
        if montant_restant > 0:
            nombre_transactions_en_retard += 1
            montant_en_retard += montant_restant
    
    # 9. Calculer la tendance (comparer ce mois vs mois précédent)
    today = date.today()
    mois_actuel_debut = today.replace(day=1)
    mois_precedent_debut = (mois_actuel_debut - relativedelta(months=1))
    mois_precedent_fin = mois_actuel_debut
    
    # Montant ce mois
    montant_mois_actuel = db.query(
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0'))
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Transaction.date_transaction >= mois_actuel_debut
    ).scalar() or Decimal('0')
    
    # Montant mois précédent
    montant_mois_precedent = db.query(
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0'))
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Transaction.date_transaction >= mois_precedent_debut,
        Transaction.date_transaction < mois_precedent_fin
    ).scalar() or Decimal('0')
    
    tendance = None
    if montant_mois_precedent > 0:
        if montant_mois_actuel > montant_mois_precedent * Decimal('1.1'):  # +10%
            tendance = 'hausse'
        elif montant_mois_actuel < montant_mois_precedent * Decimal('0.9'):  # -10%
            tendance = 'baisse'
        else:
            tendance = 'stable'
    
    # Construire la réponse
    return FournisseurInsightsFinanciers(
        taux_paiement=taux_paiement,
        montant_impaye=montant_impaye,
        delai_moyen_paiement=delai_moyen_paiement,
        frequence_moyenne=frequence_moyenne,
        jours_depuis_derniere_transaction=jours_depuis_derniere_transaction,
        nombre_transactions_en_retard=nombre_transactions_en_retard,
        montant_en_retard=montant_en_retard,
        tendance=tendance
    )


@router.get("/{id}/score", response_model=FournisseurScore, status_code=status.HTTP_200_OK)
def get_fournisseur_score(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Calcule le score de performance d'un fournisseur (0-100).
    
    Le score est calculé selon 4 critères :
    - Taux de paiement de notre part (40%) : Notre fiabilité de paiement
    - Respect de nos engagements (30%) : Ratio de paiements à l'heure
    - Régularité de collaboration (20%) : Fréquence et constance des commandes
    - Ancienneté de la relation (10%) : Durée de la relation commerciale
    
    Args:
        id: ID du fournisseur
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        FournisseurScore avec le score total et les détails
        
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
    
    # 1. Calculer le score de paiement (40 points max) - Notre fiabilité
    montant_total_query = db.query(
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0'))
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True
    ).scalar()
    
    montant_total = Decimal(str(montant_total_query or '0'))
    
    montant_paye_query = db.query(
        func.coalesce(func.sum(Paiement.montant), Decimal('0'))
    ).join(
        Transaction, Paiement.id_transaction == Transaction.id_transaction
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Paiement.statut == 'valide'
    ).scalar()
    
    montant_paye = Decimal(str(montant_paye_query or '0'))
    taux_paiement = float((montant_paye / montant_total * 100) if montant_total > 0 else 0)
    score_paiement = round((taux_paiement / 100) * 40, 2)
    
    # 2. Calculer le score de respect des délais (30 points max) - Notre ponctualité
    total_transactions = db.query(func.count(Transaction.id_transaction)).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True
    ).scalar() or 0
    
    today = date.today()
    transactions_en_retard_query = db.query(
        Transaction.id_transaction,
        Transaction.montant_total,
        func.coalesce(func.sum(Paiement.montant), Decimal('0')).label('montant_paye')
    ).outerjoin(
        Paiement, (Paiement.id_transaction == Transaction.id_transaction) & (Paiement.statut == 'valide')
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True,
        Transaction.date_echeance.isnot(None),
        Transaction.date_echeance < today
    ).group_by(
        Transaction.id_transaction,
        Transaction.montant_total
    ).all()
    
    nombre_en_retard = sum(1 for t in transactions_en_retard_query 
                           if Decimal(str(t.montant_total)) - Decimal(str(t.montant_paye or '0')) > 0)
    
    taux_respect_delais = float(((total_transactions - nombre_en_retard) / total_transactions * 100) 
                                 if total_transactions > 0 else 100)
    score_delais = round((taux_respect_delais / 100) * 30, 2)
    
    # 3. Calculer le score de régularité (20 points max) - Fréquence de nos commandes
    dates_transactions = db.query(
        Transaction.date_transaction
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True
    ).order_by(
        Transaction.date_transaction
    ).all()
    
    frequence_moyenne = None
    score_regularite = 0
    
    if len(dates_transactions) > 1:
        deltas = []
        for i in range(1, len(dates_transactions)):
            delta = (dates_transactions[i][0] - dates_transactions[i-1][0]).days
            deltas.append(delta)
        
        if deltas:
            frequence_moyenne = sum(deltas) / len(deltas)
            
            # Scoring : Plus la fréquence est régulière et courte, meilleur c'est
            # Fréquence idéale : 7-30 jours = 20 points
            # 31-60 jours = 15 points
            # 61-90 jours = 10 points
            # > 90 jours = 5 points
            if frequence_moyenne <= 30:
                score_regularite = 20
            elif frequence_moyenne <= 60:
                score_regularite = 15
            elif frequence_moyenne <= 90:
                score_regularite = 10
            else:
                score_regularite = 5
    else:
        # Fournisseur avec 1 seule commande = score moyen
        score_regularite = 10
        
    # 4. Calculer le score d'ancienneté (10 points max)
    premiere_transaction = db.query(
        func.min(Transaction.date_transaction)
    ).filter(
        Transaction.id_fournisseur == id,
        Transaction.est_actif == True
    ).scalar()
    
    anciennete_mois = None
    score_anciennete = 0
    
    if premiere_transaction:
        anciennete_jours = (date.today() - premiere_transaction).days
        anciennete_mois = int(anciennete_jours / 30)
        
        # Scoring : Plus l'ancienneté est grande, meilleur c'est
        # > 24 mois = 10 points
        # 12-24 mois = 8 points
        # 6-12 mois = 6 points
        # 3-6 mois = 4 points
        # < 3 mois = 2 points
        if anciennete_mois >= 24:
            score_anciennete = 10
        elif anciennete_mois >= 12:
            score_anciennete = 8
        elif anciennete_mois >= 6:
            score_anciennete = 6
        elif anciennete_mois >= 3:
            score_anciennete = 4
        else:
            score_anciennete = 2
    
    # 5. Calculer le score total
    score_total = round(score_paiement + score_delais + score_regularite + score_anciennete, 2)
    
    # 6. Déterminer la catégorie et la couleur
    if score_total >= 85:
        categorie = "excellent"
        label = "Excellent"
        couleur = "success"
        recommandation = "Excellente relation. Fournisseur de confiance, priorité pour nouveaux projets."
    elif score_total >= 70:
        categorie = "bon"
        label = "Bon"
        couleur = "info"
        recommandation = "Bonne relation. Maintenir les paiements à temps et la régularité."
    elif score_total >= 50:
        categorie = "moyen"
        label = "Moyen"
        couleur = "warning"
        recommandation = "Relation moyenne. Améliorer la ponctualité des paiements."
    else:
        categorie = "risque"
        label = "À risque"
        couleur = "error"
        recommandation = "Relation à risque. Régulariser les paiements en retard rapidement."
    
    return FournisseurScore(
        score_total=score_total,
        score_paiement=score_paiement,
        score_delais=score_delais,
        score_regularite=score_regularite,
        score_anciennete=score_anciennete,
        categorie=categorie,
        label=label,
        couleur=couleur,
        taux_paiement=taux_paiement,
        taux_respect_delais=taux_respect_delais,
        frequence_jours=frequence_moyenne,
        anciennete_mois=anciennete_mois,
        recommandation=recommandation
    )
