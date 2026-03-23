"""
Modèle SQLAlchemy pour la table Charges (Dépenses standalone).
"""
from sqlalchemy import Column, Integer, String, Date, Numeric, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Charge(Base):
    """
    Modèle représentant une charge ou dépense standalone (non liée à un achat spécifique).
    Exemples: Électricité, loyer, salaires, entretien, etc.
    """
    __tablename__ = "charges"
    
    id_charge = Column(Integer, primary_key=True, index=True)
    libelle = Column(String(200), nullable=False)
    montant = Column(Numeric(15, 2), nullable=False)
    date_charge = Column(Date, nullable=False, index=True)
    
    # fixe, variable, divers, etc.
    categorie = Column(String(50), nullable=False, index=True)
    
    notes = Column(Text, nullable=True)
    
    # Métadonnées de traçabilité
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    id_utilisateur_modification = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    
    # Lien optionnel avec un compte bancaire (si payé par virement/chèque)
    id_compte = Column(Integer, ForeignKey("comptes_bancaires.id_compte"), nullable=True)
    
    # Relations
    compte_bancaire = relationship("CompteBancaire", backref="charges")
    utilisateur_creation = relationship(
        "Utilisateur", 
        foreign_keys=[id_utilisateur_creation],
        backref="charges_crees"
    )
    utilisateur_modification = relationship(
        "Utilisateur", 
        foreign_keys=[id_utilisateur_modification],
        backref="charges_modifies"
    )
    
    # Lien avec la caisse (une charge génère toujours une sortie de caisse)
    mouvements_caisse = relationship("Caisse", back_populates="charge", cascade="all, delete-orphan")
