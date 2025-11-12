"""
Router FastAPI pour la gestion des clients.
Gère les endpoints CRUD pour les clients.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from decimal import Decimal
from datetime import date
from dateutil.relativedelta import relativedelta
from app.database import get_db
from app.models.client import Client
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.schemas.client import ClientCreate, ClientUpdate, ClientRead, ClientProfile, ClientProfileStats, ClientStatsMensuelles, ClientStatsMensuellesItem
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

