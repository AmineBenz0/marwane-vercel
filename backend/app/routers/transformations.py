"""
Router FastAPI pour les Transformations de produits (BOM).
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.transformation import Transformation, TransformationLigne
from app.models.produit import Produit
from app.models.user import Utilisateur
from app.schemas.transformation import TransformationCreate, TransformationRead, TransformationSummary
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/transformations", tags=["Transformations / Production"])


@router.post("", response_model=TransformationRead, status_code=status.HTTP_201_CREATED)
def create_transformation(
    trans_data: TransformationCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Crée une nouvelle transformation (Production Batch).
    Enregistre les consommations (INPUT) et les créations (OUTPUT).
    """
    if not trans_data.lignes:
        raise HTTPException(status_code=400, detail="Une transformation doit avoir au moins une ligne")

    # Création du header
    new_trans = Transformation(
        date_transformation=trans_data.date_transformation,
        notes=trans_data.notes,
        id_utilisateur=current_user.id_utilisateur if current_user else None
    )
    db.add(new_trans)
    db.flush()

    # Création des lignes
    for ligne in trans_data.lignes:
        # Vérifier si le produit existe
        produit = db.query(Produit).filter(Produit.id_produit == ligne.id_produit).first()
        if not produit:
            raise HTTPException(status_code=404, detail=f"Produit {ligne.id_produit} introuvable")
        
        new_ligne = TransformationLigne(
            id_transformation=new_trans.id_transformation,
            id_produit=ligne.id_produit,
            quantite=ligne.quantite,
            type_ligne=ligne.type_ligne.upper() # INPUT or OUTPUT
        )
        db.add(new_ligne)

    db.commit()
    db.refresh(new_trans)
    return new_trans


@router.get("", response_model=List[TransformationSummary])
def get_transformations(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Liste des transformations."""
    results = db.query(Transformation).order_by(Transformation.date_transformation.desc()).offset(skip).limit(limit).all()
    
    # On pourrait ajouter le compte des entrées/sorties ici si on veut un vrai summary
    summaries = []
    for t in results:
        nb_in = len([l for l in t.lignes if l.type_ligne == 'INPUT'])
        nb_out = len([l for l in t.lignes if l.type_ligne == 'OUTPUT'])
        
        summary = TransformationSummary.model_validate(t)
        summary.nb_entrees = nb_in
        summary.nb_sorties = nb_out
        summaries.append(summary)
        
    return summaries


@router.get("/{id}", response_model=TransformationRead)
def get_transformation(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Détails d'une transformation."""
    trans = db.query(Transformation).filter(Transformation.id_transformation == id).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Transformation introuvable")
    
    # On ajoute les noms de produits pour le Read
    for ligne in trans.lignes:
        ligne.nom_produit = ligne.produit.nom_produit
        
    return trans
