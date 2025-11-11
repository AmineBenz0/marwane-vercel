"""
Router FastAPI pour la gestion des fournisseurs.
Gère les endpoints CRUD pour les fournisseurs.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.fournisseur import Fournisseur
from app.models.user import Utilisateur
from app.schemas.fournisseur import FournisseurCreate, FournisseurUpdate, FournisseurRead
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

