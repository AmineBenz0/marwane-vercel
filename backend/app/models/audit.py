"""
Modèles SQLAlchemy pour les tables d'audit.
"""
from sqlalchemy import Column, Integer, DateTime, String, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class TransactionAudit(Base):
    """
    Modèle représentant l'audit des modifications de transactions.
    
    Cette table enregistre toutes les modifications apportées aux transactions
    via un trigger PostgreSQL (piste d'audit inviolable).
    
    Attributs:
        id_audit: Identifiant unique de l'audit (PK)
        id_transaction: ID de la transaction modifiée (FK, NOT NULL)
        id_utilisateur: ID de l'utilisateur responsable de la modification (FK, NOT NULL)
        date_changement: Date et heure du changement (NOT NULL)
        champ_modifie: Nom du champ modifié (nullable)
        ancienne_valeur: Valeur avant modification (nullable, TEXT)
        nouvelle_valeur: Valeur après modification (nullable, TEXT)
    """
    __tablename__ = "transactions_audit"
    
    id_audit = Column(Integer, primary_key=True, index=True)
    id_transaction = Column(Integer, ForeignKey("transactions.id_transaction"), nullable=False, index=True)
    id_utilisateur = Column(Integer, ForeignKey("utilisateurs.id_utilisateur"), nullable=False)
    date_changement = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    champ_modifie = Column(String(255), nullable=True)
    ancienne_valeur = Column(Text, nullable=True)
    nouvelle_valeur = Column(Text, nullable=True)
    
    # Relations
    transaction = relationship("Transaction", back_populates="audits")
    utilisateur = relationship("Utilisateur", back_populates="audits_transactions")


class AuditConnexion(Base):
    """
    Modèle représentant l'audit des tentatives de connexion.
    
    Cette table enregistre toutes les tentatives de connexion (réussies et échouées)
    pour renforcer la sécurité du système.
    
    Attributs:
        id_audit_connexion: Identifiant unique de l'audit de connexion (PK)
        email_utilisateur: Email de l'utilisateur qui a tenté de se connecter (NOT NULL)
        date_tentative: Date et heure de la tentative (NOT NULL)
        succes: Indique si la connexion a réussi (NOT NULL)
        adresse_ip: Adresse IP de la tentative (nullable)
        user_agent: User agent du navigateur/client (nullable, TEXT)
    """
    __tablename__ = "audit_connexions"
    
    id_audit_connexion = Column(Integer, primary_key=True, index=True)
    email_utilisateur = Column(String(255), nullable=False, index=True)
    date_tentative = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    succes = Column(Boolean, nullable=False)
    adresse_ip = Column(String(45), nullable=True)  # IPv6 peut être jusqu'à 45 caractères
    user_agent = Column(Text, nullable=True)

