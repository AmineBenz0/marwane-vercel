"""
Modèle SQLAlchemy pour la table Productions.
"""
from sqlalchemy import Column, Integer, Date, Numeric, String, ForeignKey, DateTime, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from decimal import Decimal
import math


class Production(Base):
    """
    Modèle représentant la production quotidienne par bâtiment.
    """
    __tablename__ = "productions"
    
    id_production = Column(Integer, primary_key=True, index=True)
    date_production = Column(Date, nullable=False, index=True)
    id_batiment = Column(Integer, ForeignKey("batiments.id_batiment"), nullable=False, index=True)
    
    # Types d'œufs: normal, double_jaune, casse, blanc, perdu
    type_oeuf = Column(String(50), nullable=False, index=True)
    
    # Calibres: demarrage, moyen, gros (Uniquement pour type_oeuf='normal')
    calibre = Column(String(50), nullable=True, index=True)
    
    nombre_oeufs = Column(Integer, nullable=False)
    grammage = Column(Numeric(10, 2), nullable=False) # Poids moyen en grammes
    
    # On stocke le nombre de cartons calculé pour garder une trace historique
    nombre_cartons = Column(Integer, nullable=False)
    
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    id_utilisateur_creation = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    id_utilisateur_modification = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    
    # Contraintes
    __table_args__ = (
        CheckConstraint('nombre_oeufs >= 0', name='check_nombre_oeufs_positif'),
        CheckConstraint('grammage >= 0', name='check_grammage_positif'),
    )
    
    # Relations
    batiment = relationship("Batiment", back_populates="productions")
    utilisateur_creation = relationship("Utilisateur", foreign_keys=[id_utilisateur_creation])
    utilisateur_modification = relationship("Utilisateur", foreign_keys=[id_utilisateur_modification])

    @staticmethod
    def calculer_cartons(nombre_oeufs: int, type_oeuf: str) -> int:
        """
        Calcule le nombre de cartons selon les règles métier :
        - 1 carton = 30 œufs
        - Normal: 10 cartons = 1 carton en plus (sécurité à la base de la pile)
        - Double Jaune: 2 fois plus de cartons + 1
        """
        if nombre_oeufs <= 0:
            return 0
            
        # Nombre de cartons pleins
        nb_pleins = math.ceil(nombre_oeufs / 30)
        
        if type_oeuf.lower() in ['double_jaune', 'double_jaune_demarrage']:
            # "Quand double jaune utilisé, 2 fois plus de carton + 1"
            return (nb_pleins * 2) + 1
        else:
            # "Calcul carton tout les 10 cartons = 1 carton en plus"
            # On ajoute 1 carton de sécurité pour chaque pile de 10 (ou fraction de 10)
            nb_securite = math.ceil(nb_pleins / 10)
            return nb_pleins + nb_securite
