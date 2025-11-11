"""
Router FastAPI pour la gestion des clients.
Gère les endpoints CRUD pour les clients.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.client import Client
from app.models.user import Utilisateur
from app.schemas.client import ClientCreate, ClientUpdate, ClientRead
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

