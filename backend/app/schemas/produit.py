"""
Schémas Pydantic pour la validation des données produits.
"""
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Literal, Optional

ProductUsage = Literal['vendu', 'achete']
ProductType = Literal['matiere_premiere', 'produit_fini', 'service']


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
        False,
        description="Indique si le produit peut être utilisé pour des transactions clients"
    )
    pour_fournisseurs: bool = Field(
        True,
        description="Indique si le produit peut être utilisé pour des transactions fournisseurs"
    )
    type_produit: ProductType = Field(
        'produit_fini',
        description="Type de produit"
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
    usage: Optional[ProductUsage] = None

    @model_validator(mode='before')
    @classmethod
    def apply_usage(cls, data):
        if isinstance(data, dict) and data.get('usage') in ('vendu', 'achete'):
            data = dict(data)
            sold = data['usage'] == 'vendu'
            if (
                ('pour_clients' in data and data['pour_clients'] != sold)
                or ('pour_fournisseurs' in data and data['pour_fournisseurs'] != (not sold))
            ):
                raise ValueError("Le produit doit être soit vendu, soit acheté")
            data['pour_clients'] = sold
            data['pour_fournisseurs'] = not sold
            data.setdefault('type_produit', 'produit_fini' if sold else 'matiere_premiere')
        return data

    @model_validator(mode='after')
    def validate_single_usage(self):
        if self.pour_clients == self.pour_fournisseurs:
            raise ValueError("Le produit doit être soit vendu, soit acheté")
        return self

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
    usage: Optional[ProductUsage] = None

    @model_validator(mode='before')
    @classmethod
    def apply_usage(cls, data):
        if isinstance(data, dict) and data.get('usage') in ('vendu', 'achete'):
            data = dict(data)
            sold = data['usage'] == 'vendu'
            if (
                ('pour_clients' in data and data['pour_clients'] != sold)
                or ('pour_fournisseurs' in data and data['pour_fournisseurs'] != (not sold))
            ):
                raise ValueError("Le produit doit être soit vendu, soit acheté")
            data['pour_clients'] = sold
            data['pour_fournisseurs'] = not sold
        return data

    nom_produit: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Nom du produit (doit être unique)"
    )
    type_produit: Optional[ProductType] = Field(
        None,
        description="Type de produit"
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

    usage: ProductUsage

    @model_validator(mode='before')
    @classmethod
    def read_single_usage(cls, data):
        if not isinstance(data, dict):
            usage = data.usage
            return {
                'id_produit': data.id_produit,
                'nom_produit': data.nom_produit,
                'est_actif': data.est_actif,
                'type_produit': data.type_produit,
                'usage': usage,
                'pour_clients': usage == 'vendu',
                'pour_fournisseurs': usage == 'achete',
            }
        return data

    model_config = ConfigDict(from_attributes=True)  # Permet la conversion depuis un modèle SQLAlchemy

