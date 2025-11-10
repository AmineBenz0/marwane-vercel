"""
Schémas Pydantic pour la validation des données.
"""
from app.schemas.user import UserBase, UserCreate, UserRead, UserUpdate
from app.schemas.client import ClientBase, ClientCreate, ClientRead, ClientUpdate
from app.schemas.fournisseur import FournisseurBase, FournisseurCreate, FournisseurRead, FournisseurUpdate
from app.schemas.produit import ProduitBase, ProduitCreate, ProduitRead, ProduitUpdate
from app.schemas.transaction import (
    TransactionBase,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    LigneTransactionBase,
    LigneTransactionCreate,
    LigneTransactionRead,
)
from app.schemas.caisse import (
    MouvementCaisseBase,
    MouvementCaisseCreate,
    MouvementCaisseRead,
)

__all__ = [
    "UserBase",
    "UserCreate",
    "UserRead",
    "UserUpdate",
    "ClientBase",
    "ClientCreate",
    "ClientRead",
    "ClientUpdate",
    "FournisseurBase",
    "FournisseurCreate",
    "FournisseurRead",
    "FournisseurUpdate",
    "ProduitBase",
    "ProduitCreate",
    "ProduitRead",
    "ProduitUpdate",
    "TransactionBase",
    "TransactionCreate",
    "TransactionRead",
    "TransactionUpdate",
    "LigneTransactionBase",
    "LigneTransactionCreate",
    "LigneTransactionRead",
    "MouvementCaisseBase",
    "MouvementCaisseCreate",
    "MouvementCaisseRead",
]

