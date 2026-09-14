"""
Schémas Pydantic pour la validation des données.
"""
from app.schemas.user import UserBase, UserCreate, UserRead, UserUpdate
from app.schemas.paiement import (
    PaiementCreate, PaiementUpdate, PaiementRead,
    StatutPaiementTransaction, PaiementSummary
)
from app.schemas.lettre_credit import (
    LettreCreditCreate, LettreCreditUpdate, LettreCreditRead, LettreCreditSummary
)
from app.schemas.cession_lc import (
    CessionLCCreate, CessionLCRead
)
from app.schemas.client import ClientBase, ClientCreate, ClientRead, ClientUpdate, ClientProfile, ClientProfileStats
from app.schemas.fournisseur import FournisseurBase, FournisseurCreate, FournisseurRead, FournisseurUpdate, FournisseurProfile, FournisseurProfileStats
from app.schemas.produit import ProduitBase, ProduitCreate, ProduitRead, ProduitUpdate
from app.schemas.transaction import (
    TransactionBase,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    TransactionAuditRead,
)
from app.schemas.caisse import (
    MouvementCaisseBase,
    MouvementCaisseCreate,
    MouvementCaisseRead,
)

# Reconstruire ClientProfile et FournisseurProfile après l'import de TransactionRead
from app.schemas.client import _rebuild_client_profile
from app.schemas.fournisseur import _rebuild_fournisseur_profile
_rebuild_client_profile()
_rebuild_fournisseur_profile()

__all__ = [
    "UserBase",
    "UserCreate",
    "UserRead",
    "UserUpdate",
    "PaiementRead",
    "StatutPaiementTransaction",
    "PaiementSummary",
    "LettreCreditCreate",
    "LettreCreditUpdate",
    "LettreCreditRead",
    "LettreCreditSummary",
    "CessionLCCreate",
    "CessionLCRead",
    "ClientBase",
    "ClientCreate",
    "ClientRead",
    "ClientUpdate",
    "FournisseurBase",
    "FournisseurCreate",
    "FournisseurRead",
    "FournisseurUpdate",
    "FournisseurProfile",
    "FournisseurProfileStats",
    "ProduitBase",
    "ProduitCreate",
    "ProduitRead",
    "ProduitUpdate",
    "TransactionBase",
    "TransactionCreate",
    "TransactionRead",
    "TransactionUpdate",
    "TransactionAuditRead",
    "MouvementCaisseBase",
    "MouvementCaisseCreate",
    "MouvementCaisseRead",
]

