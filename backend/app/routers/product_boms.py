"""Reusable product BOM definitions."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.nomenclature import Nomenclature, NomenclatureLigne
from app.models.produit import Produit
from app.models.user import Utilisateur
from app.schemas.nomenclature import NomenclatureCreate, NomenclatureRead
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/product-boms", tags=["Product BOMs"])


def _validate_bom_products(db: Session, payload: NomenclatureCreate):
    output = db.query(Produit).filter(Produit.id_produit == payload.id_produit_sortie).first()
    if not output:
        raise HTTPException(status_code=404, detail="Produit de sortie introuvable")
    if output.type_produit != "produit_fini":
        raise HTTPException(status_code=400, detail="Le produit de sortie doit être un produit fini")
    products = db.query(Produit).filter(Produit.id_produit.in_([line.id_produit_entree for line in payload.lignes])).all()
    by_id = {product.id_produit: product for product in products}
    if len(by_id) != len(payload.lignes):
        raise HTTPException(status_code=404, detail="Un produit d'entrée est introuvable")
    invalid = [product.nom_produit for product in products if product.type_produit != "matiere_premiere"]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Les entrées doivent être des matières premières: {', '.join(invalid)}")
    return output


def _read_bom(bom: Nomenclature) -> NomenclatureRead:
    value = NomenclatureRead.model_validate(bom)
    for line in value.lignes:
        source = next((item for item in bom.lignes if item.id_ligne == line.id_ligne), None)
        line.nom_produit = source.produit_entree.nom_produit if source and source.produit_entree else None
    value.produit_sortie_nom = bom.produit_sortie.nom_produit if bom.produit_sortie else None
    return value


@router.get("", response_model=List[NomenclatureRead])
def list_product_boms(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    query = db.query(Nomenclature).options(
        joinedload(Nomenclature.lignes).joinedload(NomenclatureLigne.produit_entree),
        joinedload(Nomenclature.produit_sortie),
    )
    if active_only:
        query = query.filter(Nomenclature.est_active.is_(True))
    return [_read_bom(bom) for bom in query.order_by(Nomenclature.id_produit_sortie, Nomenclature.version.desc()).all()]


@router.post("", response_model=NomenclatureRead, status_code=status.HTTP_201_CREATED)
def create_product_bom(
    payload: NomenclatureCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    _validate_bom_products(db, payload)
    if payload.est_active:
        db.query(Nomenclature).filter(
            Nomenclature.id_produit_sortie == payload.id_produit_sortie,
            Nomenclature.est_active.is_(True),
        ).update({Nomenclature.est_active: False}, synchronize_session=False)
    bom = Nomenclature(
        id_produit_sortie=payload.id_produit_sortie,
        version=payload.version,
        est_active=payload.est_active,
        date_debut=payload.date_debut,
        date_fin=payload.date_fin,
        quantite_sortie=payload.quantite_sortie,
        rendement_pct=payload.rendement_pct,
        notes=payload.notes,
        id_utilisateur=current_user.id_utilisateur if current_user else None,
    )
    db.add(bom)
    db.flush()
    for line in payload.lignes:
        db.add(NomenclatureLigne(
            id_nomenclature=bom.id_nomenclature,
            id_produit_entree=line.id_produit_entree,
            quantite=line.quantite,
        ))
    db.commit()
    db.refresh(bom)
    return _read_bom(bom)


@router.put("/{id}", response_model=NomenclatureRead)
def update_product_bom(
    id: int,
    payload: NomenclatureCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    bom = db.query(Nomenclature).filter(Nomenclature.id_nomenclature == id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM introuvable")
    _validate_bom_products(db, payload)
    if payload.est_active:
        db.query(Nomenclature).filter(
            Nomenclature.id_produit_sortie == payload.id_produit_sortie,
            Nomenclature.id_nomenclature != id,
            Nomenclature.est_active.is_(True),
        ).update({Nomenclature.est_active: False}, synchronize_session=False)
    for field in ("id_produit_sortie", "version", "est_active", "date_debut", "date_fin", "quantite_sortie", "rendement_pct", "notes"):
        setattr(bom, field, getattr(payload, field))
    bom.id_utilisateur = current_user.id_utilisateur if current_user else None
    for line in list(bom.lignes):
        db.delete(line)
    db.flush()
    for line in payload.lignes:
        db.add(NomenclatureLigne(id_nomenclature=id, id_produit_entree=line.id_produit_entree, quantite=line.quantite))
    db.commit()
    db.refresh(bom)
    return _read_bom(bom)

