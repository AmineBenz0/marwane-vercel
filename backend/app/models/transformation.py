"""
Modèles SQLAlchemy pour les Transformations de produits (BOM / Composition).
"""
from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Transformation(Base):
    """
    Représente une session de transformation ou production.
    Exemple: Consommer du grain + eau pour produire des œufs (indirectement) 
    ou Mélanger des types d'œufs pour un lot spécifique.
    """
    __tablename__ = "transformations"
    
    id_transformation = Column(Integer, primary_key=True, index=True)
    date_transformation = Column(Date, nullable=False, default=func.current_date())
    notes = Column(String(500), nullable=True)
    
    # Audit
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    id_utilisateur = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=True)
    
    # Relations
    lignes = relationship("TransformationLigne", back_populates="transformation", cascade="all, delete-orphan")
    utilisateur = relationship("Utilisateur")


class TransformationLigne(Base):
    """
    Détail des entrées (matières premières) et sorties (produit fini) d'une transformation.
    """
    __tablename__ = "transformation_lignes"
    
    id_ligne = Column(Integer, primary_key=True, index=True)
    id_transformation = Column(Integer, ForeignKey("transformations.id_transformation"), nullable=False, index=True)
    id_produit = Column(Integer, ForeignKey("produits.id_produit"), nullable=False, index=True)
    
    quantite = Column(Numeric(15, 2), nullable=False)
    
    # 'INPUT' (consommé) ou 'OUTPUT' (produit)
    type_ligne = Column(String(10), nullable=False, index=True) 
    
    # Relations
    transformation = relationship("Transformation", back_populates="lignes")
    produit = relationship("Produit")
