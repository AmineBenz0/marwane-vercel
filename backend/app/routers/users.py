"""
Router FastAPI pour la gestion des utilisateurs.
Gère les endpoints CRUD pour les utilisateurs (admin uniquement).
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import Utilisateur
from app.schemas.user import UserCreate, UserUpdate, UserRead
from app.utils.dependencies import get_current_admin_user
from app.utils.security import hash_password

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=List[UserRead], status_code=status.HTTP_200_OK)
def get_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """
    Récupère la liste des utilisateurs.
    
    Accessible uniquement aux administrateurs.
    Retourne uniquement les utilisateurs actifs par défaut.
    
    Args:
        skip: Nombre d'utilisateurs à sauter (pour la pagination)
        limit: Nombre maximum d'utilisateurs à retourner
        db: Session de base de données
        current_user: Utilisateur admin actuel (via dépendance)
        
    Returns:
        Liste des utilisateurs (UserRead)
    """
    users = db.query(Utilisateur).filter(Utilisateur.est_actif == True).offset(skip).limit(limit).all()
    return users


@router.get("/{user_id}", response_model=UserRead, status_code=status.HTTP_200_OK)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """
    Récupère les détails d'un utilisateur par son ID.
    
    Accessible uniquement aux administrateurs.
    
    Args:
        user_id: ID de l'utilisateur à récupérer
        db: Session de base de données
        current_user: Utilisateur admin actuel (via dépendance)
        
    Returns:
        Détails de l'utilisateur (UserRead)
        
    Raises:
        HTTPException 404: Si l'utilisateur n'existe pas
    """
    user = db.query(Utilisateur).filter(
        Utilisateur.id_utilisateur == user_id,
        Utilisateur.est_actif == True
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec l'ID {user_id} introuvable"
        )
    
    return user


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """
    Crée un nouvel utilisateur.
    
    Accessible uniquement aux administrateurs.
    Le mot de passe sera automatiquement hashé avant stockage.
    
    Args:
        user_data: Données du nouvel utilisateur (UserCreate)
        db: Session de base de données
        current_user: Utilisateur admin actuel (via dépendance)
        
    Returns:
        Utilisateur créé (UserRead)
        
    Raises:
        HTTPException 400: Si l'email existe déjà
    """
    # Vérifier si l'email existe déjà
    existing_user = db.query(Utilisateur).filter(Utilisateur.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Un utilisateur avec l'email {user_data.email} existe déjà"
        )
    
    # Créer le nouvel utilisateur
    hashed_password = hash_password(user_data.mot_de_passe)
    new_user = Utilisateur(
        nom_utilisateur=user_data.nom_utilisateur,
        email=user_data.email,
        mot_de_passe_hash=hashed_password,
        role=user_data.role,
        est_actif=True
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.put("/{user_id}", response_model=UserRead, status_code=status.HTTP_200_OK)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """
    Met à jour un utilisateur existant.
    
    Accessible uniquement aux administrateurs.
    Permet une mise à jour partielle (seuls les champs fournis seront modifiés).
    Si un nouveau mot de passe est fourni, il sera hashé avant stockage.
    
    Args:
        user_id: ID de l'utilisateur à modifier
        user_data: Données à mettre à jour (UserUpdate)
        db: Session de base de données
        current_user: Utilisateur admin actuel (via dépendance)
        
    Returns:
        Utilisateur mis à jour (UserRead)
        
    Raises:
        HTTPException 404: Si l'utilisateur n'existe pas
        HTTPException 400: Si l'email existe déjà pour un autre utilisateur
    """
    user = db.query(Utilisateur).filter(
        Utilisateur.id_utilisateur == user_id,
        Utilisateur.est_actif == True
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec l'ID {user_id} introuvable"
        )
    
    # Vérifier si l'email existe déjà pour un autre utilisateur
    if user_data.email and user_data.email != user.email:
        existing_user = db.query(Utilisateur).filter(
            Utilisateur.email == user_data.email,
            Utilisateur.id_utilisateur != user_id
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Un utilisateur avec l'email {user_data.email} existe déjà"
            )
    
    # Mettre à jour les champs fournis
    update_data = user_data.model_dump(exclude_unset=True)
    
    if "mot_de_passe" in update_data:
        # Hasher le nouveau mot de passe
        update_data["mot_de_passe_hash"] = hash_password(update_data.pop("mot_de_passe"))
    
    for field, value in update_data.items():
        setattr(user, field, value)
    
    db.commit()
    db.refresh(user)
    
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """
    Supprime un utilisateur (soft delete).
    
    Accessible uniquement aux administrateurs.
    Effectue un soft delete en mettant est_actif à False.
    L'utilisateur ne sera plus visible dans les listes mais restera en base de données.
    
    Args:
        user_id: ID de l'utilisateur à supprimer
        db: Session de base de données
        current_user: Utilisateur admin actuel (via dépendance)
        
    Raises:
        HTTPException 404: Si l'utilisateur n'existe pas
        HTTPException 400: Si l'utilisateur essaie de se supprimer lui-même
    """
    user = db.query(Utilisateur).filter(
        Utilisateur.id_utilisateur == user_id,
        Utilisateur.est_actif == True
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec l'ID {user_id} introuvable"
        )
    
    # Empêcher un utilisateur de se supprimer lui-même
    if user.id_utilisateur == current_user.id_utilisateur:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous ne pouvez pas supprimer votre propre compte"
        )
    
    # Soft delete : mettre est_actif à False
    user.est_actif = False
    db.commit()
    
    return None

