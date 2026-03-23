"""
Modèle SQLAlchemy pour la table Caisse.
"""
from sqlalchemy import Column, Integer, DateTime, Numeric, String, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Caisse(Base):
    """
    Modèle représentant un mouvement de caisse.
    
    Attributs:
        id_mouvement: Identifiant unique du mouvement (PK)
        date_mouvement: Date et heure du mouvement (NOT NULL)
        montant: Montant du mouvement (NOT NULL, > 0)
        type_mouvement: Type de mouvement - 'ENTREE' ou 'SORTIE' (NOT NULL)
        id_transaction: ID de la transaction associée (FK, NOT NULL)
    
    Contraintes:
        - Le montant doit être positif
        - Le type_mouvement doit être 'ENTREE' ou 'SORTIE'
    """
    __tablename__ = "caisse"
    
    id_mouvement = Column(Integer, primary_key=True, index=True)
    date_mouvement = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    montant = Column(Numeric(15, 2), nullable=False)
    type_mouvement = Column(String(10), nullable=False)
    id_transaction = Column(Integer, ForeignKey("transactions.id_transaction"), nullable=True, index=True)
    id_paiement = Column(Integer, ForeignKey("paiements.id_paiement"), nullable=True, index=True)
    id_charge = Column(Integer, ForeignKey("charges.id_charge"), nullable=True, index=True)
    
    # Contraintes au niveau SQLAlchemy (seront aussi ajoutées via migrations)
    __table_args__ = (
        CheckConstraint('montant > 0', name='check_montant_caisse_positif'),
        CheckConstraint("type_mouvement IN ('ENTREE', 'SORTIE')", name='check_type_mouvement'),
        CheckConstraint(
            "(id_transaction IS NOT NULL) OR (id_charge IS NOT NULL)",
            name='check_caisse_origine'
        ),
    )
    
    # Relations
    transaction = relationship("Transaction", back_populates="mouvements_caisse")
    paiement = relationship("Paiement", backref="mouvement_caisse")
    charge = relationship("Charge", back_populates="mouvements_caisse")
    historiques_solde = relationship("CaisseSoldeHistorique", back_populates="mouvement")

