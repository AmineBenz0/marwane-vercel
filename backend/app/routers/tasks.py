"""
Router FastAPI pour la gestion des tâches.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.task import Tache
from app.models.user import Utilisateur
from app.schemas.task import TacheCreate, TacheUpdate, TacheRead
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("", response_model=List[TacheRead])
def get_tasks(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    statut: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user)
):
    """
    Récupère la liste des tâches de l'utilisateur actuel.
    Permet de filtrer par plage de dates (utile pour le calendrier).
    """
    query = db.query(Tache).filter(Tache.id_utilisateur == current_user.id_utilisateur)
    
    if start_date:
        query = query.filter(Tache.date_debut >= start_date)
    if end_date:
        query = query.filter(Tache.date_debut <= end_date)
    if statut:
        query = query.filter(Tache.statut == statut)
        
    return query.all()


@router.post("", response_model=TacheRead, status_code=status.HTTP_201_CREATED)
def create_task(
    task_data: TacheCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user)
):
    """
    Crée une nouvelle tâche pour l'utilisateur actuel.
    """
    new_task = Tache(
        **task_data.model_dump(),
        id_utilisateur=current_user.id_utilisateur
    )
    
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    
    return new_task


@router.get("/{task_id}", response_model=TacheRead)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user)
):
    """
    Récupère les détails d'une tâche spécifique.
    """
    task = db.query(Tache).filter(
        Tache.id_tache == task_id,
        Tache.id_utilisateur == current_user.id_utilisateur
    ).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche introuvable"
        )
        
    return task


@router.put("/{task_id}", response_model=TacheRead)
def update_task(
    task_id: int,
    task_data: TacheUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user)
):
    """
    Met à jour une tâche existante.
    """
    task = db.query(Tache).filter(
        Tache.id_tache == task_id,
        Tache.id_utilisateur == current_user.id_utilisateur
    ).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche introuvable"
        )
    
    update_data = task_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
        
    db.commit()
    db.refresh(task)
    
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user)
):
    """
    Supprime une tâche.
    """
    task = db.query(Tache).filter(
        Tache.id_tache == task_id,
        Tache.id_utilisateur == current_user.id_utilisateur
    ).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche introuvable"
        )
        
    db.delete(task)
    db.commit()
    
    return None
