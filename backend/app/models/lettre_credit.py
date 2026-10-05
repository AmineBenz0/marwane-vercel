"""
Mod�le SQLAlchemy pour la table Lettres de Cr�dit (LC).
"""
from sqlalchemy import Column, Integer, String, Date, Numeric, DateTime, ForeignKey, CheckConstraint, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class LettreDeCredit(Base):
    """
    Mod�le repr�sentant une Lettre de Cr�dit (LC).
    
    Une LC est un instrument financier utilis� comme mode de paiement.
    Elle est toujours d�tenue par un client et peut �tre c�d�e (transf�r�e).
    """
    __tablename__ = "lettres_credit"
    
    id_lc = Column(Integer, primary_key=True, index=True)
    numero_reference = Column(String(50), nullable=False, unique=True, index=True)
    numero_serie = Column(String(50), nullable=True, index=True) # Num�ro de s�rie interne ou suppl�mentaire
    banque_emettrice = Column(String(100), nullable=True)  # Rendu optionnel
    montant = Column(Numeric(15, 2), nullable=False)
    
    date_emission = Column(Date, nullable=False)
    date_disponibilite = Column(Date, nullable=False, index=True)
    # date_expiration supprim�
    
    # active (available) or utilisee. A canceled use returns the LC to active.
    statut = Column(String(20), nullable=False, default='active', index=True)
    version_utilisation = Column(Integer, nullable=False, default=0, server_default='0')
    
    # Toujours 'client' - le champ est conserv� pour compatibilit� des donn�es existantes
    type_detenteur = Column(String(20), nullable=False, default='client', index=True)
    id_client = Column(Integer, ForeignKey("clients.id_client"), nullable=True, index=True)
    id_fournisseur = Column(Integer, ForeignKey("fournisseurs.id_fournisseur"), nullable=True, index=True)
    
    notes = Column(Text, nullable=True)
    
    # M�tadonn�es de tra�abilit�
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    id_utilisateur_modification = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    
    # Contraintes
    __table_args__ = (
        CheckConstraint('montant > 0', name='check_lc_montant_positif'),
        CheckConstraint(
            "statut IN ('active', 'utilisee')",
            name='check_lc_statut_valide'
        ),
        CheckConstraint(
            "type_detenteur IN ('client', 'fournisseur')",
            name='check_lc_type_detenteur_valide'
        ),
        CheckConstraint(
            "(id_client IS NOT NULL AND id_fournisseur IS NULL) OR (id_fournisseur IS NOT NULL AND id_client IS NULL)",
            name='check_lc_detenteur_unifie'
        ),
    )
    
    # Relations
    client = relationship("Client", backref="lettres_credit")
    fournisseur = relationship("Fournisseur", backref="lettres_credit")
    paiements = relationship("Paiement", back_populates="lettre_credit")
    cessions = relationship("CessionLC", back_populates="lettre_credit", cascade="all, delete-orphan")
    
    utilisateur_creation = relationship(
        "Utilisateur", 
        foreign_keys=[id_utilisateur_creation],
        backref="lettres_credit_crees"
    )
    utilisateur_modification = relationship(
        "Utilisateur", 
        foreign_keys=[id_utilisateur_modification],
        backref="lettres_credit_modifies"
    )

    @property
    def est_disponible(self):
        """V�rifie si la LC peut �tre utilis�e comme paiement."""
        from app.utils.business_date import business_date
        today = business_date()
        return (
            self.statut == 'active' and 
            self.date_disponibilite <= today
        )
