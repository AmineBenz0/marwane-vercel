from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.models.production import Production
from app.models.batiment import Batiment
from app.schemas.production import ProductionRead, ProductionCreate, ProductionUpdate, ProductionDailyStats
from app.utils.dependencies import get_current_active_user
from app.models.user import Utilisateur

router = APIRouter(prefix="/productions", tags=["Productions"])


@router.get("", response_model=List[ProductionRead])
def get_productions(
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    id_batiment: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Liste les productions avec filtres optionnels.
    """
    query = db.query(Production, Batiment.nom.label("nom_batiment")).join(Batiment)
    
    if date_debut:
        query = query.filter(Production.date_production >= date_debut)
    if date_fin:
        query = query.filter(Production.date_production <= date_fin)
    if id_batiment:
        query = query.filter(Production.id_batiment == id_batiment)
        
    results = query.order_by(Production.date_production.desc()).offset(skip).limit(limit).all()
    
    final_results = []
    for prod, nom_batiment in results:
        # On crée une copie pour ne pas modifier l'objet SQLAlchemy original dans la session
        p_data = {c.name: getattr(prod, c.name) for c in prod.__table__.columns}
        p_data["nom_batiment"] = nom_batiment
        final_results.append(p_data)
        
    return final_results


@router.post("", response_model=ProductionRead, status_code=status.HTTP_201_CREATED)
def create_production(
    prod_in: ProductionCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Enregistre une nouvelle production et calcule automatiquement les cartons.
    """
    # Vérifier l'existence du bâtiment
    batiment = db.query(Batiment).filter(Batiment.id_batiment == prod_in.id_batiment).first()
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment introuvable")

    # Calculer le nombre de cartons selon les règles métier
    nb_cartons = Production.calculer_cartons(prod_in.nombre_oeufs, prod_in.type_oeuf)
    
    db_prod = Production(
        **prod_in.model_dump(),
        nombre_cartons=nb_cartons,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    db.add(db_prod)
    db.commit()
    db.refresh(db_prod)
    
    # Ajouter le nom du bâtiment pour la réponse
    res = {c.name: getattr(db_prod, c.name) for c in db_prod.__table__.columns}
    res["nom_batiment"] = batiment.nom
    return res


@router.get("/stats/daily", response_model=List[ProductionDailyStats])
def get_daily_stats(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère les statistiques de production agrégées par jour.
    Utilise des agrégations SQL pour l'efficacité.
    """
    from datetime import date, timedelta
    date_debut = date.today() - timedelta(days=days)

    # 1. Agrégation par jour + type
    par_type_rows = db.query(
        Production.date_production,
        Production.type_oeuf,
        func.sum(Production.nombre_oeufs).label("total")
    ).filter(
        Production.date_production >= date_debut
    ).group_by(
        Production.date_production, Production.type_oeuf
    ).all()

    # 2. Agrégation par jour + bâtiment
    par_batiment_rows = db.query(
        Production.date_production,
        Batiment.nom.label("nom_batiment"),
        func.sum(Production.nombre_oeufs).label("total")
    ).join(Batiment).filter(
        Production.date_production >= date_debut
    ).group_by(
        Production.date_production, Batiment.nom
    ).all()

    # 3. Totaux par jour
    totaux = db.query(
        Production.date_production,
        func.sum(Production.nombre_oeufs).label("total_oeufs"),
        func.sum(Production.nombre_cartons).label("total_cartons")
    ).filter(
        Production.date_production >= date_debut
    ).group_by(
        Production.date_production
    ).order_by(
        Production.date_production.desc()
    ).limit(days).all()

    # Regrouper en dicts indexés par date
    type_map = {}
    for row in par_type_rows:
        if row.date_production not in type_map:
            type_map[row.date_production] = []
        type_map[row.date_production].append(
            {"type": row.type_oeuf, "count": int(row.total or 0)}
        )

    batiment_map = {}
    for row in par_batiment_rows:
        if row.date_production not in batiment_map:
            batiment_map[row.date_production] = []
        batiment_map[row.date_production].append(
            {"batiment": row.nom_batiment, "count": int(row.total or 0)}
        )

    return [
        ProductionDailyStats(
            date=s.date_production,
            total_oeufs=int(s.total_oeufs or 0),
            total_cartons=int(s.total_cartons or 0),
            par_type=type_map.get(s.date_production, []),
            par_batiment=batiment_map.get(s.date_production, [])
        ) for s in totaux
    ]


@router.get("/{id}", response_model=ProductionRead)
def get_production(
    id: int, 
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère le détail d'une production.
    """
    result = db.query(Production, Batiment.nom.label("nom_batiment")).join(Batiment).filter(Production.id_production == id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Production introuvable")
    
    prod, nom_batiment = result
    p_data = {c.name: getattr(prod, c.name) for c in prod.__table__.columns}
    p_data["nom_batiment"] = nom_batiment
    return p_data


@router.put("/{id}", response_model=ProductionRead)
def update_production(
    id: int,
    prod_in: ProductionUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Met à jour une production existante et recalcule les cartons si besoin.
    """
    prod = db.query(Production).filter(Production.id_production == id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Production introuvable")
    
    update_dict = prod_in.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(prod, key, value)
    
    # Recalculer les cartons si le nombre d'œufs ou le type a changé
    if 'nombre_oeufs' in update_dict or 'type_oeuf' in update_dict:
        prod.nombre_cartons = Production.calculer_cartons(prod.nombre_oeufs, prod.type_oeuf)
    
    prod.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    db.commit()
    db.refresh(prod)
    
    # Retourner avec le nom du bâtiment
    batiment = db.query(Batiment).filter(Batiment.id_batiment == prod.id_batiment).first()
    res = {c.name: getattr(prod, c.name) for c in prod.__table__.columns}
    res["nom_batiment"] = batiment.nom if batiment else None
    return res


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_production(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Supprime une production.
    """
    prod = db.query(Production).filter(Production.id_production == id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Production introuvable")
    
    db.delete(prod)
    db.commit()
    return None
