"""
Schémas Pydantic pour la validation des données des Cessions de LC.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, date


class CessionLCBase(BaseModel):
    """
    Schéma de base pour une cession de LC.
    """
    id_lc: int = Field(..., description="ID de la Lettre de Crédit à céder")
    type_cedant: str = Field(..., description="Type du cédant (client ou fournisseur)")
    id_cedant_client: Optional[int] = Field(None)
    id_cedant_fournisseur: Optional[int] = Field(None)
    
    type_cessionnaire: str = Field(..., description="Type du cessionnaire (client ou fournisseur)")
    id_cessionnaire_client: Optional[int] = Field(None)
    id_cessionnaire_fournisseur: Optional[int] = Field(None)
    
    date_cession: date = Field(..., description="Date de la cession")
    motif: Optional[str] = Field(None, description="Motif de la cession")


class CessionLCCreate(CessionLCBase):
    """
    Schéma pour créer une nouvelle cession.
    """
    version_utilisation: int = Field(..., ge=0, description="Version de la LC affichée au moment de l'action")


class CessionLCRead(CessionLCBase):
    """
    Schéma pour lire une cession.
    """
    id_cession: int
    date_creation: datetime
    id_utilisateur_creation: Optional[int]
    id_cession_origine: Optional[int] = None
    
    # Noms pour l'affichage
    nom_cedant: Optional[str] = None
    nom_cessionnaire: Optional[str] = None
    numero_reference_lc: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
