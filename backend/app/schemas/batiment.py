from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class BatimentBase(BaseModel):
    nom: str = Field(..., max_length=50)
    description: Optional[str] = Field(None, max_length=255)
    est_actif: bool = True


class BatimentCreate(BatimentBase):
    pass


class BatimentRead(BatimentBase):
    id_batiment: int
    date_creation: datetime
    
    class Config:
        from_attributes = True
