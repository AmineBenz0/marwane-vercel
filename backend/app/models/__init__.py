"""
Modèles SQLAlchemy pour la base de données.
Tous les modèles doivent être importés ici pour être découverts par Alembic.
"""
from app.models.user import Utilisateur
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.paiement import Paiement
from app.models.lettre_credit import LettreDeCredit
from app.models.cession_lc import CessionLC
from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.audit import TransactionAudit, AuditConnexion
from app.models.batiment import Batiment
from app.models.production import Production
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.charge import Charge
from app.models.transformation import Transformation, TransformationLigne
from app.models.task import Tache

# Export de tous les modèles pour faciliter les imports
__all__ = [
    "Utilisateur",
    "Client",
    "Fournisseur",
    "Produit",
    "Transaction",
    "Paiement",
    "LettreDeCredit",
    "CessionLC",
    "Caisse",
    "CaisseSoldeHistorique",
    "TransactionAudit",
    "AuditConnexion",
    "Batiment",
    "Production",
    "CompteBancaire",
    "MouvementBancaire",
    "Charge",
    "Transformation",
    "TransformationLigne",
    "Tache",
]
