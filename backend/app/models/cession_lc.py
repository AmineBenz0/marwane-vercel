"""
Modèle SQLAlchemy pour la table Cessions de LC.
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class CessionLC(Base):
    """
    Modèle représentant un transfert (cession) d'une Lettre de Crédit entre deux entités.
    """
    __tablename__ = "cessions_lc"
    
    id_cession = Column(Integer, primary_key=True, index=True)
    id_lc = Column(Integer, ForeignKey("lettres_credit.id_lc"), nullable=False, index=True)
    
    # Cédant (celui qui donne la LC)
    type_cedant = Column(String(20), nullable=False) # client ou fournisseur
    id_cedant_client = Column(Integer, ForeignKey("clients.id_client"), nullable=True)
    id_cedant_fournisseur = Column(Integer, ForeignKey("fournisseurs.id_fournisseur"), nullable=True)
    
    # Cessionnaire (celui qui reçoit la LC)
    type_cessionnaire = Column(String(20), nullable=False) # client ou fournisseur
    id_cessionnaire_client = Column(Integer, ForeignKey("clients.id_client"), nullable=True)
    id_cessionnaire_fournisseur = Column(Integer, ForeignKey("fournisseurs.id_fournisseur"), nullable=True)
    
    date_cession = Column(Date, nullable=False, index=True)
    motif = Column(Text, nullable=True)
    
    # Métadonnées
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    
    # Relations
    lettre_credit = relationship("LettreDeCredit", back_populates="cessions")
    
    cedant_client = relationship("Client", foreign_keys=[id_cedant_client])
    cedant_fournisseur = relationship("Fournisseur", foreign_keys=[id_cedant_fournisseur])
    
    cessionnaire_client = relationship("Client", foreign_keys=[id_cessionnaire_client])
    cessionnaire_fournisseur = relationship("Fournisseur", foreign_keys=[id_cessionnaire_fournisseur])
    
    utilisateur_creation = relationship(
        "Utilisateur", 
        foreign_keys=[id_utilisateur_creation],
        backref="cessions_lc_crees"
    )
