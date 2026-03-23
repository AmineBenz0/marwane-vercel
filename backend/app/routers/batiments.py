from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.batiment import Batiment
from app.schemas.batiment import BatimentRead, BatimentCreate
from app.utils.dependencies import get_current_active_user
from app.models.user import Utilisateur

router = APIRouter(prefix="/batiments", tags=["Bâtiments"])


@router.get("", response_model=List[BatimentRead])
def get_batiments(db: Session = Depends(get_db)):
    """
    Récupère la liste de tous les bâtiments actifs.
    """
    return db.query(Batiment).filter(Batiment.est_actif == True).all()


@router.post("", response_model=BatimentRead, status_code=status.HTTP_201_CREATED)
def create_batiment(
    batiment_in: BatimentCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Crée un nouveau bâtiment.
    """
    existing = db.query(Batiment).filter(Batiment.nom == batiment_in.nom).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Un bâtiment nommé '{batiment_in.nom}' existe déjà."
        )
    
    db_batiment = Batiment(**batiment_in.model_dump())
    db.add(db_batiment)
    db.commit()
    db.refresh(db_batiment)
    return db_batiment


@router.get("/{id}", response_model=BatimentRead)
def get_batiment(id: int, db: Session = Depends(get_db)):
    """
    Récupère un bâtiment par son ID.
    """
    batiment = db.query(Batiment).filter(Batiment.id_batiment == id).first()
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment introuvable")
    return batiment


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_batiment(
    id: int, 
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Désactive un bâtiment (Soft Delete).
    """
    batiment = db.query(Batiment).filter(Batiment.id_batiment == id).first()
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment introuvable")
    
    batiment.est_actif = False
    db.commit()
    return None
