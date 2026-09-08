"""
Modèle SQLAlchemy pour les Comptes Bancaires.
"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, CheckConstraint, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class CompteBancaire(Base):
    """
    Modèle représentant un compte bancaire de l'entreprise.
    Sert à suivre les soldes pour les virements et chèques.
    """
    __tablename__ = "comptes_bancaires"
    
    id_compte = Column(Integer, primary_key=True, index=True)
    nom_banque = Column(String(100), nullable=False)
    numero_compte = Column(String(50), nullable=False, unique=True)
    solde_actuel = Column(Numeric(15, 2), nullable=False, default=0)
    
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relations
    mouvements = relationship("MouvementBancaire", back_populates="compte", cascade="all, delete-orphan")


class MouvementBancaire(Base):
    """
    Mouvements historiques sur un compte bancaire.
    """
    __tablename__ = "mouvements_bancaires"
    
    id_mouvement = Column(Integer, primary_key=True, index=True)
    id_compte = Column(Integer, ForeignKey("comptes_bancaires.id_compte"), nullable=False, index=True)
    
    date_mouvement = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    montant = Column(Numeric(15, 2), nullable=False)
    
    # ENTREE (Virement client, Chèque client encaissé)
    # SORTIE (Virement fournisseur, Chèque fournisseur, Frais bancaires)
    type_mouvement = Column(String(10), nullable=False) 
    
    source = Column(String(50), nullable=False) # virement, cheque, frais, initial
    reference = Column(String(100), nullable=True)
    notes = Column(String(255), nullable=True)
    statut = Column(String(20), nullable=False, default="active", index=True)
    cle_idempotence = Column(String(120), nullable=True, unique=True, index=True)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True, index=True)
    motif_annulation = Column(Text, nullable=True)
    date_annulation = Column(DateTime(timezone=True), nullable=True)
    id_utilisateur_annulation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    id_mouvement_inverse = Column(Integer, ForeignKey("mouvements_bancaires.id_mouvement"), nullable=True, index=True)
    
    # Lien optionnel vers un paiement ou une charge
    id_paiement = Column(Integer, ForeignKey("paiements.id_paiement"), nullable=True)
    id_charge = Column(Integer, ForeignKey("charges.id_charge"), nullable=True)
    
    # Relations
    compte = relationship("CompteBancaire", back_populates="mouvements")
    paiement = relationship("Paiement")
    charge = relationship("Charge")
    utilisateur_creation = relationship(
        "Utilisateur",
        foreign_keys=[id_utilisateur_creation],
        backref="mouvements_bancaires_crees",
    )

    __table_args__ = (
        CheckConstraint("montant > 0", name="check_mouvement_bancaire_montant_positif"),
        CheckConstraint("type_mouvement IN ('ENTREE', 'SORTIE')", name="check_type_mouvement_bancaire_valide"),
        CheckConstraint("statut IN ('active', 'annule')", name="check_statut_mouvement_bancaire_valide"),
    )
