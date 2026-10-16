from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.vaccin import Vaccin
from app.schemas.vaccin import VaccinRead
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/vaccins", tags=["Vaccins"])


@router.get("", response_model=list[VaccinRead])
def get_vaccins(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    return db.query(Vaccin).filter(Vaccin.est_actif.is_(True)).order_by(Vaccin.id_vaccin).all()
