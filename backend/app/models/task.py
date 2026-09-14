"""
Modèle SQLAlchemy pour la table Tâches.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Tache(Base):
    """
    Modèle représentant une tâche ou un événement dans le calendrier.
    
    Attributs:
        id_tache: Identifiant unique de la tâche (PK)
        titre: Titre de la tâche (NOT NULL)
        description: Description détaillée (nullable)
        date_debut: Date et heure de début (NOT NULL)
        date_fin: Date et heure de fin (nullable)
        est_toute_la_journee: Indique si c'est un événement sur toute la journée
        statut: Statut de la tâche (en_attente, en_cours, complete, annule)
        priorite: Niveau de priorité (basse, moyenne, haute)
        categorie: Catégorie pour coloration (travail, personnel, rdv, etc.)
        
        # Métadonnées
        id_utilisateur: ID de l'utilisateur propriétaire (FK, NOT NULL)
        date_creation: Date de création
        date_modification: Date de dernière modification
    """
    __tablename__ = "taches"
    
    id_tache = Column(Integer, primary_key=True, index=True)
    titre = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    date_debut = Column(DateTime(timezone=True), nullable=False, index=True)
    date_fin = Column(DateTime(timezone=True), nullable=True, index=True)
    est_toute_la_journee = Column(Boolean, default=False, nullable=False)
    
    statut = Column(String(20), default='en_attente', nullable=False)  # en_attente, en_cours, complete, annule
    priorite = Column(String(20), default='moyenne', nullable=False)  # basse, moyenne, haute
    categorie = Column(String(50), nullable=True)
    
    # Métadonnées
    id_utilisateur = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=False, index=True)
    date_creation = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    date_modification = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Contraintes
    __table_args__ = (
        CheckConstraint(
            "statut IN ('en_attente', 'en_cours', 'complete', 'annule')",
            name='check_statut_tache_valide'
        ),
        CheckConstraint(
            "priorite IN ('basse', 'moyenne', 'haute')",
            name='check_priorite_tache_valide'
        ),
    )
    
    # Relations
    utilisateur = relationship("Utilisateur", back_populates="taches")
