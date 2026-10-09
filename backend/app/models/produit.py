"""
Modèle SQLAlchemy pour la table Produits.
"""
from sqlalchemy import Column, Integer, String, Boolean, CheckConstraint, and_, case
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property
from app.database import Base


class Produit(Base):
    """
    Modèle représentant un produit.
    
    Attributs:
        id_produit: Identifiant unique du produit (PK)
        nom_produit: Nom du produit (UNIQUE, NOT NULL)
        est_actif: Indique si le produit est actif (soft delete, DEFAULT true)
        pour_clients: Indique si le produit peut être utilisé dans des transactions clients (DEFAULT true)
        pour_fournisseurs: Indique si le produit peut être utilisé dans des transactions fournisseurs (DEFAULT true)
    """
    __tablename__ = "produits"
    
    id_produit = Column(Integer, primary_key=True, index=True)
    nom_produit = Column(String(255), unique=True, nullable=False)
    
    # produit_fini, matiere_premiere, or service
    type_produit = Column(String(20), nullable=False, default='produit_fini', index=True)
    
    est_actif = Column(Boolean, default=True, nullable=False)
    
    # Type flags: at least one must be true
    pour_clients = Column(Boolean, default=True, nullable=False, index=True)
    pour_fournisseurs = Column(Boolean, default=True, nullable=False, index=True)
    
    __table_args__ = (
        CheckConstraint(
            'pour_clients = true OR pour_fournisseurs = true',
            name='check_au_moins_un_type'
        ),
        CheckConstraint(
            "type_produit IN ('matiere_premiere', 'produit_fini', 'service')",
            name='check_type_produit_valide'
        ),
    )
    
    @hybrid_property
    def usage(self):
        """One business usage, including deterministic legacy dual-flag rows."""
        if self.pour_clients and (
            not self.pour_fournisseurs or self.type_produit == "produit_fini"
        ):
            return "vendu"
        return "achete"

    @usage.expression
    def usage(cls):
        return case(
            (
                and_(
                    cls.pour_clients.is_(True),
                    (cls.pour_fournisseurs.is_(False) | (cls.type_produit == "produit_fini")),
                ),
                "vendu",
            ),
            else_="achete",
        )

    # Relations
    transactions = relationship("Transaction", back_populates="produit")

