"""
Schémas Pydantic pour la validation des données produits.
"""
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional


class ProduitBase(BaseModel):
    """
    Schéma de base pour un produit.
    Contient les champs communs à tous les schémas produit.
    """
    nom_produit: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Nom du produit (doit être unique)"
    )
    est_actif: bool = Field(
        True,
        description="Indique si le produit est actif (soft delete)"
    )
    pour_clients: bool = Field(
        True,
        description="Indique si le produit peut être utilisé pour des transactions clients"
    )
    pour_fournisseurs: bool = Field(
        True,
        description="Indique si le produit peut être utilisé pour des transactions fournisseurs"
    )
    
    @model_validator(mode='after')
    def validate_au_moins_un_type(self):
        """Valide qu'au moins un type est sélectionné."""
        if not self.pour_clients and not self.pour_fournisseurs:
            raise ValueError("Un produit doit être utilisable au moins pour les clients OU les fournisseurs")
        return self


class ProduitCreate(ProduitBase):
    """
    Schéma pour créer un nouveau produit.
    """
    @field_validator('nom_produit')
    @classmethod
    def validate_nom_produit(cls, v: str) -> str:
        """
        Valide que le nom du produit n'est pas vide après trim.
        L'unicité est garantie par la contrainte unique au niveau de la base de données.
        """
        v = v.strip()
        if not v:
            raise ValueError("Le nom du produit ne peut pas être vide")
        return v


class ProduitUpdate(BaseModel):
    """
    Schéma pour mettre à jour un produit.
    Tous les champs sont optionnels pour permettre des mises à jour partielles.
    """
    nom_produit: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Nom du produit (doit être unique)"
    )
    est_actif: Optional[bool] = Field(
        None,
        description="Indique si le produit est actif (soft delete)"
    )
    pour_clients: Optional[bool] = Field(
        None,
        description="Indique si le produit peut être utilisé pour des transactions clients"
    )
    pour_fournisseurs: Optional[bool] = Field(
        None,
        description="Indique si le produit peut être utilisé pour des transactions fournisseurs"
    )

    @field_validator('nom_produit')
    @classmethod
    def validate_nom_produit(cls, v: Optional[str]) -> Optional[str]:
        """Valide le nom du produit si fourni."""
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom du produit ne peut pas être vide")
        return v
    
    # Note: Validation "au moins un type" will be done at the router level
    # since we need to check against existing values in the database


class ProduitRead(ProduitBase):
    """
    Schéma pour lire un produit.
    Inclut les champs générés automatiquement (id).
    """
    id_produit: int = Field(..., description="Identifiant unique du produit")

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy

