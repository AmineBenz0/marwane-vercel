"""Atomic BOM execution and transformation history."""

from datetime import datetime, time, timezone
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.nomenclature import Nomenclature
from app.models.produit import Produit
from app.models.transformation import Transformation, TransformationLigne
from app.models.user import Utilisateur
from app.schemas.nomenclature import (
    TransformationCreate,
    TransformationPreviewRead,
    TransformationRead,
)
from app.services.inventory import get_average_unit_cost, get_stock_quantity, record_movement, reverse_source_movements
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/transformations", tags=["Transformations / Production"])


def _read_transformation(transformation: Transformation) -> TransformationRead:
    return TransformationRead(
        id_transformation=transformation.id_transformation,
        id_nomenclature=transformation.id_nomenclature,
        date_transformation=transformation.date_transformation,
        quantite_sortie=transformation.quantite_sortie,
        cout_total=transformation.cout_total,
        notes=transformation.notes,
        date_creation=transformation.date_creation,
        lignes=[{
            "id_ligne": line.id_ligne,
            "id_produit": line.id_produit,
            "quantite": line.quantite,
            "type_ligne": line.type_ligne,
            "nom_produit": line.produit.nom_produit if line.produit else None,
        } for line in transformation.lignes],
    )


def _validate_transformation_idempotency(existing: Transformation, requested: TransformationCreate) -> None:
    """Reject reuse of a transformation key with a different operation."""
    same_identity = (
        existing.id_nomenclature == requested.id_nomenclature
        and existing.date_transformation == requested.date_transformation
        and (
            requested.quantite_sortie is None
            or Decimal(str(existing.quantite_sortie)) == Decimal(str(requested.quantite_sortie))
        )
    )
    if same_identity and existing.id_nomenclature is None:
        requested_lines = sorted(
            (line.id_produit, line.type_ligne.upper(), Decimal(str(line.quantite)))
            for line in requested.lignes
        )
        existing_lines = sorted(
            (line.id_produit, line.type_ligne.upper(), Decimal(str(line.quantite)))
            for line in existing.lignes
        )
        same_identity = requested_lines == existing_lines
    if not same_identity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La clé d'idempotence est déjà utilisée pour une autre transformation",
        )


def _resolve_lines(db: Session, payload: TransformationCreate):
    if payload.id_nomenclature:
        bom = db.query(Nomenclature).options(joinedload(Nomenclature.lignes)).filter(
            Nomenclature.id_nomenclature == payload.id_nomenclature,
            Nomenclature.est_active.is_(True),
        ).first()
        if not bom:
            raise HTTPException(status_code=404, detail="BOM active introuvable")
        if bom.date_debut and payload.date_transformation < bom.date_debut:
            raise HTTPException(status_code=400, detail="Le BOM n'est pas encore applicable à cette date")
        if bom.date_fin and payload.date_transformation > bom.date_fin:
            raise HTTPException(status_code=400, detail="Le BOM n'est plus applicable à cette date")
        output_quantity = payload.quantite_sortie or Decimal(str(bom.quantite_sortie))
        scale = output_quantity / Decimal(str(bom.quantite_sortie))
        yield_factor = Decimal("100") / Decimal(str(bom.rendement_pct or 100))
        lines = [(line.id_produit_entree, Decimal(str(line.quantite)) * scale * yield_factor, "INPUT") for line in bom.lignes]
        lines.append((bom.id_produit_sortie, output_quantity, "OUTPUT"))
        return bom, lines

    if not payload.lignes:
        raise HTTPException(status_code=400, detail="Une transformation doit avoir au moins une ligne")
    lines = [(line.id_produit, Decimal(str(line.quantite)), line.type_ligne.upper()) for line in payload.lignes]
    if not any(kind == "INPUT" for _, _, kind in lines) or not any(kind == "OUTPUT" for _, _, kind in lines):
        raise HTTPException(status_code=400, detail="Une transformation doit avoir au moins une entrée et une sortie")
    return None, lines


def _validate_lines(db: Session, lines, *, lock: bool = False):
    product_ids = {product_id for product_id, _, _ in lines}
    query = db.query(Produit).filter(Produit.id_produit.in_(product_ids)).order_by(Produit.id_produit)
    if lock:
        query = query.with_for_update()
    products = query.all()
    by_id = {product.id_produit: product for product in products}
    if len(by_id) != len(product_ids):
        raise HTTPException(status_code=404, detail="Un produit de la transformation est introuvable")
    seen_lines = set()
    for product_id, quantity, kind in lines:
        line_key = (product_id, kind)
        if line_key in seen_lines:
            raise HTTPException(status_code=400, detail="Un produit ne peut apparaître qu'une seule fois par type de ligne")
        seen_lines.add(line_key)
        product = by_id[product_id]
        if kind not in {"INPUT", "OUTPUT"}:
            raise HTTPException(status_code=400, detail="type_ligne doit être INPUT ou OUTPUT")
        if product.type_produit == "service":
            raise HTTPException(status_code=400, detail="Un service ne peut pas entrer dans une transformation")
        if kind == "INPUT" and product.type_produit != "matiere_premiere":
            raise HTTPException(status_code=400, detail="Les entrées doivent être des matières premières")
        if kind == "OUTPUT" and product.type_produit != "produit_fini":
            raise HTTPException(status_code=400, detail="Les sorties doivent être des produits finis")
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Les quantités doivent être positives")
    return by_id


@router.post("/preview", response_model=TransformationPreviewRead)
def preview_transformation(
    payload: TransformationCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Preview material requirements and weighted output cost without writes."""
    bom, lines = _resolve_lines(db, payload)
    products = _validate_lines(db, lines)
    inputs = [(product_id, quantity) for product_id, quantity, kind in lines if kind == "INPUT"]
    outputs = [(product_id, quantity) for product_id, quantity, kind in lines if kind == "OUTPUT"]
    if len(outputs) != 1:
        raise HTTPException(status_code=400, detail="Une transformation doit avoir une seule sortie")

    preview_lines = []
    total_cost = Decimal("0")
    stock_sufficient = True
    for product_id, quantity in inputs:
        available = get_stock_quantity(db, product_id)
        unit_cost = get_average_unit_cost(db, product_id)
        enough = available >= quantity
        stock_sufficient = stock_sufficient and enough
        total_cost += quantity * unit_cost
        preview_lines.append({
            "id_produit": product_id,
            "nom_produit": products[product_id].nom_produit,
            "quantite_requise": quantity,
            "quantite_disponible": available,
            "cout_unitaire_moyen": unit_cost,
            "suffisant": enough,
        })
    output_quantity = outputs[0][1]
    return TransformationPreviewRead(
        id_nomenclature=bom.id_nomenclature if bom else None,
        quantite_sortie=output_quantity,
        cout_total=total_cost,
        cout_unitaire_sortie=total_cost / output_quantity if output_quantity else Decimal("0"),
        stock_suffisant=stock_sufficient,
        lignes_entree=preview_lines,
    )


@router.post("", response_model=TransformationRead, status_code=status.HTTP_201_CREATED)
def create_transformation(
    payload: TransformationCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    if payload.cle_idempotence:
        existing = db.query(Transformation).options(joinedload(Transformation.lignes).joinedload(TransformationLigne.produit)).filter(
            Transformation.cle_idempotence == payload.cle_idempotence
        ).first()
        if existing:
            _validate_transformation_idempotency(existing, payload)
            response.status_code = status.HTTP_200_OK
            return _read_transformation(existing)

    bom, lines = _resolve_lines(db, payload)
    products = _validate_lines(db, lines, lock=True)
    inputs = [(product_id, quantity) for product_id, quantity, kind in lines if kind == "INPUT"]
    outputs = [(product_id, quantity) for product_id, quantity, kind in lines if kind == "OUTPUT"]
    if len(outputs) != 1:
        raise HTTPException(status_code=400, detail="Une transformation doit avoir une seule sortie")

    total_cost = Decimal("0")
    costs = {}
    for product_id, quantity in inputs:
        available = get_stock_quantity(db, product_id)
        if available < quantity:
            raise HTTPException(status_code=409, detail=f"Stock insuffisant pour '{products[product_id].nom_produit}'")
        unit_cost = get_average_unit_cost(db, product_id)
        costs[product_id] = unit_cost
        total_cost += quantity * unit_cost
    output_product_id, output_quantity = outputs[0]
    movement_date = datetime.combine(
        payload.date_transformation,
        time.min,
        tzinfo=timezone.utc,
    )

    transformation = Transformation(
        id_nomenclature=bom.id_nomenclature if bom else None,
        date_transformation=payload.date_transformation,
        quantite_sortie=output_quantity,
        cout_total=total_cost,
        cle_idempotence=payload.cle_idempotence,
        notes=payload.notes,
        id_utilisateur=current_user.id_utilisateur if current_user else None,
    )
    db.add(transformation)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if payload.cle_idempotence:
            existing = db.query(Transformation).options(
                joinedload(Transformation.lignes).joinedload(TransformationLigne.produit)
            ).filter(Transformation.cle_idempotence == payload.cle_idempotence).first()
            if existing:
                _validate_transformation_idempotency(existing, payload)
                response.status_code = status.HTTP_200_OK
                return _read_transformation(existing)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La transformation n'a pas pu être enregistrée en raison d'un conflit d'intégrité",
        ) from exc
    user_id = current_user.id_utilisateur if current_user else None
    for product_id, quantity in inputs:
        db.add(TransformationLigne(id_transformation=transformation.id_transformation, id_produit=product_id, quantite=quantity, type_ligne="INPUT"))
        record_movement(db, id_produit=product_id, quantite_delta=-quantity, cout_unitaire=costs[product_id], type_mouvement="transformation_input", source_type="transformation", source_id=transformation.id_transformation, id_utilisateur=user_id, date_mouvement=movement_date)
    db.add(TransformationLigne(id_transformation=transformation.id_transformation, id_produit=output_product_id, quantite=output_quantity, type_ligne="OUTPUT"))
    output_cost = total_cost / output_quantity if output_quantity else Decimal("0")
    record_movement(db, id_produit=output_product_id, quantite_delta=output_quantity, cout_unitaire=output_cost, type_mouvement="transformation_output", source_type="transformation", source_id=transformation.id_transformation, id_utilisateur=user_id, date_mouvement=movement_date)
    db.commit()
    db.refresh(transformation)
    return _read_transformation(transformation)


@router.get("", response_model=List[TransformationRead])
def get_transformations(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    rows = db.query(Transformation).options(joinedload(Transformation.lignes).joinedload(TransformationLigne.produit)).order_by(
        Transformation.date_transformation.desc(), Transformation.id_transformation.desc()
    ).offset(skip).limit(limit).all()
    return [_read_transformation(row) for row in rows]


@router.get("/{id}", response_model=TransformationRead)
def get_transformation(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    transformation = db.query(Transformation).options(joinedload(Transformation.lignes).joinedload(TransformationLigne.produit)).filter(
        Transformation.id_transformation == id
    ).first()
    if not transformation:
        raise HTTPException(status_code=404, detail="Transformation introuvable")
    return _read_transformation(transformation)


@router.post("/{id}/reverse", response_model=TransformationRead)
def reverse_transformation(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    transformation = db.query(Transformation).options(joinedload(Transformation.lignes).joinedload(TransformationLigne.produit)).filter(
        Transformation.id_transformation == id
    ).with_for_update().first()
    if not transformation:
        raise HTTPException(status_code=404, detail="Transformation introuvable")
    reversals = reverse_source_movements(
        db,
        source_type="transformation",
        source_id=id,
        current_user=current_user,
        reason=f"Annulation de la transformation #{id}",
    )
    if not reversals:
        raise HTTPException(status_code=409, detail="Cette transformation est déjà annulée")
    db.commit()
    db.refresh(transformation)
    return _read_transformation(transformation)
