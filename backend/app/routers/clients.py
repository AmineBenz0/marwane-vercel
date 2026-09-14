"""
Router FastAPI pour la gestion des clients.
Gère les endpoints CRUD pour les clients.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, Date
from decimal import Decimal
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from app.database import get_db
from app.models.client import Client
from app.models.transaction import Transaction
from app.models.produit import Produit
from app.models.user import Utilisateur
from app.models.paiement import Paiement
from app.schemas.client import (
    ClientCreate, ClientUpdate, ClientRead, ClientProfile, ClientProfileStats, 
    ClientStatsMensuelles, ClientStatsMensuellesItem, ClientProduitsAchetes, ProduitAchete,
    ClientInsightsFinanciers, ClientScore
)
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.get("", response_model=List[ClientRead], status_code=status.HTTP_200_OK)
def get_clients(
    skip: int = 0,
    limit: int = 100,
    est_actif: Optional[bool] = None,
    recherche: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère la liste des clients avec filtres optionnels.
    
    Permet de filtrer par statut actif/inactif et de rechercher par nom.
    
    Args:
        skip: Nombre de clients à sauter (pour la pagination)
        limit: Nombre maximum de clients à retourner
        est_actif: Filtre optionnel pour les clients actifs/inactifs (None = tous)
        recherche: Terme de recherche optionnel pour filtrer par nom (recherche partielle, insensible à la casse)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Liste des clients (ClientRead)
    """
    query = db.query(Client)
    
    # Filtre par est_actif si fourni
    if est_actif is not None:
        query = query.filter(Client.est_actif == est_actif)
    
    # Filtre par recherche (nom_client) si fourni
    if recherche:
        recherche_clean = recherche.strip()
        if recherche_clean:
            query = query.filter(
                Client.nom_client.ilike(f"%{recherche_clean}%")
            )
    
    # Pagination
    clients = query.offset(skip).limit(limit).all()
    
    return clients


@router.get("/{id}/profile", response_model=ClientProfile, status_code=status.HTTP_200_OK)
def get_client_profile(
    id: int,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère le profil complet d'un client avec ses statistiques et transactions.
    
    Retourne les informations du client, des statistiques agrégées (nombre de transactions,
    montant total, montant moyen, dates première/dernière transaction) et une liste paginée
    des transactions du client.
    
    Args:
        id: ID du client
        skip: Nombre de transactions à sauter (pour la pagination)
        limit: Nombre maximum de transactions à retourner (défaut: 20)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Profil complet du client (ClientProfile) avec statistiques et transactions paginées
        
    Raises:
        HTTPException 404: Si le client n'existe pas
    """
    # Vérifier que le client existe
    client = db.query(Client).filter(Client.id_client == id).first()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client avec l'ID {id} introuvable"
        )
    
    # Calculer les statistiques agrégées avec une seule requête optimisée
    stats_query = db.query(
        func.count(Transaction.id_transaction).label('total_transactions'),
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0')).label('montant_total_ventes'),
        func.avg(Transaction.montant_total).label('montant_moyen'),
        func.min(Transaction.date_transaction).label('date_premiere'),
        func.max(Transaction.date_transaction).label('date_derniere')
    ).filter(
        Transaction.id_client == id,
        Transaction.est_actif == True  # Seulement les transactions actives
    )
    
    stats_result = stats_query.first()
    
    # Extraire les statistiques (gérer les cas NULL)
    total_transactions = stats_result.total_transactions or 0
    montant_total_ventes = stats_result.montant_total_ventes or Decimal('0')
    montant_moyen = Decimal(str(stats_result.montant_moyen)) if stats_result.montant_moyen is not None else None
    date_premiere = stats_result.date_premiere
    date_derniere = stats_result.date_derniere
    
    # Créer l'objet statistiques
    statistiques = ClientProfileStats(
        total_transactions=total_transactions,
        montant_total_ventes=montant_total_ventes,
        montant_moyen_transaction=montant_moyen,
        date_premiere_transaction=date_premiere,
        date_derniere_transaction=date_derniere
    )
    
    # Récupérer les transactions paginées (triées par date décroissante)
    transactions = db.query(Transaction).filter(
        Transaction.id_client == id,
        Transaction.est_actif == True
    ).order_by(
        Transaction.date_transaction.desc()
    ).offset(skip).limit(limit).all()
    
    # Construire la réponse
    profile = ClientProfile(
        client=client,
        statistiques=statistiques,
        transactions=transactions
    )
    
    return profile


@router.get("/{id}", response_model=ClientRead, status_code=status.HTTP_200_OK)
def get_client(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère les détails d'un client par son ID.
    
    Args:
        id: ID du client à récupérer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Détails du client (ClientRead)
        
    Raises:
        HTTPException 404: Si le client n'existe pas
    """
    client = db.query(Client).filter(Client.id_client == id).first()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client avec l'ID {id} introuvable"
        )
    
    return client


@router.get("/{id}/stats-mensuelles", response_model=ClientStatsMensuelles, status_code=status.HTTP_200_OK)
def get_client_stats_mensuelles(
    id: int,
    periode: int = Query(6, ge=6, le=12, description="Nombre de mois à retourner (6 ou 12)"),
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère les statistiques mensuelles d'un client pour une période donnée.
    
    Retourne les données agrégées par mois (montant total et nombre de transactions)
    pour les 6 ou 12 derniers mois. Les mois sans transactions sont inclus avec des valeurs à 0.
    
    Args:
        id: ID du client
        periode: Nombre de mois à retourner (6 ou 12, défaut: 6)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Statistiques mensuelles (ClientStatsMensuelles) avec données agrégées par mois
        
    Raises:
        HTTPException 404: Si le client n'existe pas
        HTTPException 400: Si la période n'est pas valide (doit être 6 ou 12)
    """
    # Vérifier que le client existe
    client = db.query(Client).filter(Client.id_client == id).first()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client avec l'ID {id} introuvable"
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
        Transaction.id_client == id,
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
        
        data.append(ClientStatsMensuellesItem(
            mois=mois_key,
            montant=montant,
            nb_transactions=nb_transactions
        ))
        
        # Passer au mois suivant
        current_date = current_date + relativedelta(months=1)
    
    # Formater la période pour la réponse
    periode_str = f"{periode}_mois"
    
    return ClientStatsMensuelles(
        periode=periode_str,
        data=data
    )


@router.get("/{id}/produits-achetes", response_model=ClientProduitsAchetes, status_code=status.HTTP_200_OK)
def get_client_produits_achetes(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère la liste des produits achetés par un client avec leurs statistiques.
    
    Retourne des statistiques agrégées par produit pour ce client :
    - Quantité totale achetée par produit
    - Montant total dépensé par produit
    - Nombre d'achats (transactions) par produit
    - Prix moyen par produit
    - Dates du premier et dernier achat
    
    Args:
        id: ID du client
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        ClientProduitsAchetes avec la liste des produits et statistiques globales
        
    Raises:
        HTTPException 404: Si le client n'existe pas
    """
    # Vérifier que le client existe
    client = db.query(Client).filter(Client.id_client == id).first()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client avec l'ID {id} introuvable"
        )
    
    # Requête pour agréger les données par produit
    produits_stats_query = db.query(
        Transaction.id_produit,
        Produit.nom_produit,
        func.sum(Transaction.quantite).label('quantite_totale'),
        func.sum(Transaction.montant_total).label('montant_total'),
        func.count(Transaction.id_transaction).label('nombre_achats'),
        func.min(Transaction.date_transaction).label('premiere_date_achat'),
        func.max(Transaction.date_transaction).label('derniere_date_achat')
    ).join(
        Produit, Transaction.id_produit == Produit.id_produit
    ).filter(
        Transaction.id_client == id,
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
        nombre_achats = int(stat.nombre_achats or 0)
        
        # Calculer le prix moyen (montant_total / quantite_totale)
        prix_moyen = montant_total / Decimal(str(quantite_totale)) if quantite_totale > 0 else Decimal('0')
        
        # Accumuler les totaux globaux
        quantite_totale_tous_produits += quantite_totale
        montant_total_tous_produits += montant_total
        
        # Créer l'objet ProduitAchete
        produit_achete = ProduitAchete(
            id_produit=stat.id_produit,
            nom_produit=stat.nom_produit,
            quantite_totale=quantite_totale,
            montant_total=montant_total,
            nombre_achats=nombre_achats,
            prix_moyen=prix_moyen,
            premiere_date_achat=stat.premiere_date_achat,
            derniere_date_achat=stat.derniere_date_achat
        )
        
        produits.append(produit_achete)
    
    # Construire la réponse
    return ClientProduitsAchetes(
        client_id=id,
        nombre_produits_differents=nombre_produits_differents,
        quantite_totale_tous_produits=quantite_totale_tous_produits,
        montant_total_tous_produits=montant_total_tous_produits,
        produits=produits
    )


@router.post("", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
def create_client(
    client_data: ClientCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Crée un nouveau client.
    
    Enregistre automatiquement l'ID de l'utilisateur qui a créé le client.
    
    Args:
        client_data: Données du nouveau client (ClientCreate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Client créé (ClientRead)
        
    Raises:
        HTTPException 400: Si un client avec le même nom existe déjà
    """
    # Vérifier si un client avec le même nom existe déjà (actif ou inactif)
    existing_client = db.query(Client).filter(
        Client.nom_client == client_data.nom_client.strip()
    ).first()
    
    if existing_client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Un client avec le nom '{client_data.nom_client}' existe déjà"
        )
    
    # Créer le nouveau client
    new_client = Client(
        nom_client=client_data.nom_client.strip(),
        est_actif=client_data.est_actif,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    db.add(new_client)
    db.commit()
    db.refresh(new_client)
    
    return new_client


@router.put("/{id}", response_model=ClientRead, status_code=status.HTTP_200_OK)
def update_client(
    id: int,
    client_data: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Met à jour un client existant.
    
    Permet une mise à jour partielle (seuls les champs fournis seront modifiés).
    Enregistre automatiquement l'ID de l'utilisateur qui a modifié le client.
    
    Args:
        id: ID du client à modifier
        client_data: Données à mettre à jour (ClientUpdate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Client mis à jour (ClientRead)
        
    Raises:
        HTTPException 404: Si le client n'existe pas
        HTTPException 400: Si un autre client avec le même nom existe déjà
    """
    client = db.query(Client).filter(Client.id_client == id).first()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client avec l'ID {id} introuvable"
        )
    
    # Vérifier si le nom existe déjà pour un autre client
    if client_data.nom_client is not None:
        nom_clean = client_data.nom_client.strip()
        existing_client = db.query(Client).filter(
            Client.nom_client == nom_clean,
            Client.id_client != id
        ).first()
        
        if existing_client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Un client avec le nom '{nom_clean}' existe déjà"
            )
    
    # Mettre à jour les champs fournis
    update_data = client_data.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        if field == "nom_client" and value is not None:
            setattr(client, field, value.strip())
        else:
            setattr(client, field, value)
    
    # Enregistrer l'utilisateur qui a modifié (si authentification activée)
    if current_user:
        client.id_utilisateur_modification = current_user.id_utilisateur
    
    db.commit()
    db.refresh(client)
    
    return client


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Supprime un client (soft delete).
    
    Effectue un soft delete en mettant est_actif à False.
    Le client ne sera plus visible dans les listes par défaut mais restera en base de données.
    Enregistre automatiquement l'ID de l'utilisateur qui a supprimé le client.
    
    Args:
        id: ID du client à supprimer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Raises:
        HTTPException 404: Si le client n'existe pas
        HTTPException 400: Si le client est déjà inactif
    """
    client = db.query(Client).filter(Client.id_client == id).first()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client avec l'ID {id} introuvable"
        )
    
    # Vérifier si le client est déjà inactif
    if not client.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le client avec l'ID {id} est déjà inactif"
        )
    
    # Soft delete : mettre est_actif à False
    client.est_actif = False
    # Enregistrer l'utilisateur qui a modifié (si authentification activée)
    if current_user:
        client.id_utilisateur_modification = current_user.id_utilisateur
    
    db.commit()
    
    return None


@router.patch("/{id}/reactivate", response_model=ClientRead, status_code=status.HTTP_200_OK)
def reactivate_client(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Réactive un client inactif.
    
    Effectue l'inverse du soft delete en remettant est_actif à True.
    Enregistre automatiquement l'ID de l'utilisateur qui a réactivé le client.
    
    Args:
        id: ID du client à réactiver
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Client réactivé (ClientRead)
        
    Raises:
        HTTPException 404: Si le client n'existe pas
        HTTPException 400: Si le client est déjà actif
    """
    client = db.query(Client).filter(Client.id_client == id).first()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client avec l'ID {id} introuvable"
        )
    
    # Vérifier si le client est déjà actif
    if client.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le client avec l'ID {id} est déjà actif"
        )
    
    # Réactiver : mettre est_actif à True
    client.est_actif = True
    # Enregistrer l'utilisateur qui a réactivé (si authentification activée)
    if current_user:
        client.id_utilisateur_modification = current_user.id_utilisateur
    
    db.commit()
    db.refresh(client)
    
    return client


@router.get("/{id}/insights-financiers", response_model=ClientInsightsFinanciers, status_code=status.HTTP_200_OK)
def get_client_insights_financiers(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère les insights financiers avancés pour un client.
    
    Calcule des métriques avancées :
    - Taux de paiement (% du montant total payé)
    - Montant impayé (créances)
    - Délai moyen de paiement
    - Fréquence moyenne entre transactions
    - Dernière activité
    - Transactions en retard
    - Tendance (hausse/baisse/stable)
    
    Args:
        id: ID du client
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        ClientInsightsFinanciers avec toutes les métriques calculées
        
    Raises:
        HTTPException 404: Si le client n'existe pas
    """
    # Vérifier que le client existe
    client = db.query(Client).filter(Client.id_client == id).first()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client avec l'ID {id} introuvable"
        )
    
    # 1. Calculer le montant total des transactions actives
    montant_total_query = db.query(
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0'))
    ).filter(
        Transaction.id_client == id,
        Transaction.est_actif == True
    ).scalar()
    
    montant_total = Decimal(str(montant_total_query or '0'))
    
    # 2. Calculer le montant total payé
    montant_paye_query = db.query(
        func.coalesce(func.sum(Paiement.montant), Decimal('0'))
    ).join(
        Transaction, Paiement.id_transaction == Transaction.id_transaction
    ).filter(
        Transaction.id_client == id,
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
        Transaction.id_client == id,
        Transaction.est_actif == True,
        Paiement.statut == 'valide'
    ).scalar()
    
    delai_moyen_paiement = float(delais_query) if delais_query else None
    
    # 6. Calculer la fréquence moyenne entre transactions
    # Récupérer toutes les dates de transaction triées
    dates_transactions = db.query(
        Transaction.date_transaction
    ).filter(
        Transaction.id_client == id,
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
        Transaction.id_client == id,
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
        Transaction.id_client == id,
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
        Transaction.id_client == id,
        Transaction.est_actif == True,
        Transaction.date_transaction >= mois_actuel_debut
    ).scalar() or Decimal('0')
    
    # Montant mois précédent
    montant_mois_precedent = db.query(
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0'))
    ).filter(
        Transaction.id_client == id,
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
    return ClientInsightsFinanciers(
        taux_paiement=taux_paiement,
        montant_impaye=montant_impaye,
        delai_moyen_paiement=delai_moyen_paiement,
        frequence_moyenne=frequence_moyenne,
        jours_depuis_derniere_transaction=jours_depuis_derniere_transaction,
        nombre_transactions_en_retard=nombre_transactions_en_retard,
        montant_en_retard=montant_en_retard,
        tendance=tendance
    )


@router.get("/{id}/score", response_model=ClientScore, status_code=status.HTTP_200_OK)
def get_client_score(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Calcule le score de fiabilité d'un client (0-100).
    
    Le score est calculé selon 4 critères :
    - Taux de paiement (40%) : Pourcentage des montants payés
    - Respect des délais (30%) : Ratio transactions à l'heure vs en retard
    - Régularité des achats (20%) : Fréquence et constance des transactions
    - Ancienneté de la relation (10%) : Durée de la relation commerciale
    
    Args:
        id: ID du client
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        ClientScore avec le score total et les détails
        
    Raises:
        HTTPException 404: Si le client n'existe pas
    """
    # Vérifier que le client existe
    client = db.query(Client).filter(Client.id_client == id).first()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client avec l'ID {id} introuvable"
        )
    
    # 1. Calculer le score de paiement (40 points max)
    montant_total_query = db.query(
        func.coalesce(func.sum(Transaction.montant_total), Decimal('0'))
    ).filter(
        Transaction.id_client == id,
        Transaction.est_actif == True
    ).scalar()
    
    montant_total = Decimal(str(montant_total_query or '0'))
    
    montant_paye_query = db.query(
        func.coalesce(func.sum(Paiement.montant), Decimal('0'))
    ).join(
        Transaction, Paiement.id_transaction == Transaction.id_transaction
    ).filter(
        Transaction.id_client == id,
        Transaction.est_actif == True,
        Paiement.statut == 'valide'
    ).scalar()
    
    montant_paye = Decimal(str(montant_paye_query or '0'))
    taux_paiement = float((montant_paye / montant_total * 100) if montant_total > 0 else 0)
    score_paiement = round((taux_paiement / 100) * 40, 2)
    
    # 2. Calculer le score de respect des délais (30 points max)
    total_transactions = db.query(func.count(Transaction.id_transaction)).filter(
        Transaction.id_client == id,
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
        Transaction.id_client == id,
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
    
    # 3. Calculer le score de régularité (20 points max)
    dates_transactions = db.query(
        Transaction.date_transaction
    ).filter(
        Transaction.id_client == id,
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
        # Client avec 1 seule transaction = score moyen
        score_regularite = 10
        
    # 4. Calculer le score d'ancienneté (10 points max)
    premiere_transaction = db.query(
        func.min(Transaction.date_transaction)
    ).filter(
        Transaction.id_client == id,
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
        recommandation = "Client très fiable. Priorité maximale pour les nouvelles offres."
    elif score_total >= 70:
        categorie = "bon"
        label = "Bon"
        couleur = "info"
        recommandation = "Bon client. Maintenir la relation et encourager la régularité."
    elif score_total >= 50:
        categorie = "moyen"
        label = "Moyen"
        couleur = "warning"
        recommandation = "Client moyen. Surveiller les paiements et améliorer l'engagement."
    else:
        categorie = "risque"
        label = "À risque"
        couleur = "error"
        recommandation = "Client à risque. Vérifier les conditions de paiement et limiter le crédit."
    
    return ClientScore(
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

