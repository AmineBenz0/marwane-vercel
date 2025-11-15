"""
Modèles SQLAlchemy pour la base de données.
Tous les modèles doivent être importés ici pour être découverts par Alembic.
"""
from app.models.user import Utilisateur
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.audit import TransactionAudit, AuditConnexion

# Export de tous les modèles pour faciliter les imports
__all__ = [
    "Utilisateur",
    "Client",
    "Fournisseur",
    "Produit",
    "Transaction",
    "Caisse",
    "CaisseSoldeHistorique",
    "TransactionAudit",
    "AuditConnexion",
]
