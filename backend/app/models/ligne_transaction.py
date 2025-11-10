"""
Modèle SQLAlchemy pour la table Lignes_Transaction.
"""
from sqlalchemy import Column, Integer, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class LigneTransaction(Base):
    """
    Modèle représentant une ligne de détail d'une transaction.
    
    Attributs:
        id_ligne_transaction: Identifiant unique de la ligne (PK)
        id_transaction: ID de la transaction parente (FK, NOT NULL)
        id_produit: ID du produit concerné (FK, NOT NULL)
        quantite: Quantité du produit (NOT NULL, > 0)
    
    Contraintes:
        - La quantité doit être positive
    """
    __tablename__ = "lignes_transaction"
    
    id_ligne_transaction = Column(Integer, primary_key=True, index=True)
    id_transaction = Column(Integer, ForeignKey("transactions.id_transaction", ondelete="CASCADE"), nullable=False, index=True)
    id_produit = Column(Integer, ForeignKey("produits.id_produit"), nullable=False, index=True)
    quantite = Column(Integer, nullable=False)
    
    # Contraintes au niveau SQLAlchemy (seront aussi ajoutées via migrations)
    __table_args__ = (
        CheckConstraint('quantite > 0', name='check_quantite_positive'),
    )
    
    # Relations
    transaction = relationship("Transaction", back_populates="lignes_transaction")
    produit = relationship("Produit", back_populates="lignes_transaction")

