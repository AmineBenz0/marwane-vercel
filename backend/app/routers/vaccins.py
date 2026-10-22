from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.vaccin import Vaccin
from app.schemas.vaccin import VaccinPriceUpdate, VaccinRead
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/vaccins", tags=["Vaccins"])


@router.get("", response_model=list[VaccinRead])
def get_vaccins(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    return db.query(Vaccin).filter(Vaccin.est_actif.is_(True)).order_by(Vaccin.id_vaccin).all()


@router.put("/{id_vaccin}/prix", response_model=VaccinRead)
def update_vaccin_prix(
    id_vaccin: int,
    price_data: VaccinPriceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    vaccin = db.query(Vaccin).filter(
        Vaccin.id_vaccin == id_vaccin,
        Vaccin.est_actif.is_(True),
    ).first()
    if not vaccin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaccin introuvable")
    vaccin.prix_defaut = price_data.prix_defaut
    db.commit()
    db.refresh(vaccin)
    return vaccin
