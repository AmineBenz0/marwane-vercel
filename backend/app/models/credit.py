"""Party advances and explicit non-cash credit allocations."""
from decimal import Decimal
from sqlalchemy import Column, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Uuid, func
from sqlalchemy.orm import relationship
from app.database import Base


class Avance(Base):
    __tablename__ = 'avances'
    id_avance = Column(Uuid, ForeignKey('correction_operations.operation_id', deferrable=True, initially='DEFERRED'), primary_key=True)
    id_origine = Column(Uuid, ForeignKey('avances.id_avance', ondelete='RESTRICT'), index=True)
    nature = Column(String(20), nullable=False, default='avance', server_default='avance')
    id_client = Column(Integer, ForeignKey('clients.id_client'), index=True)
    id_fournisseur = Column(Integer, ForeignKey('fournisseurs.id_fournisseur'), index=True)
    date_effet = Column(Date, nullable=False, index=True)
    montant = Column(Numeric(15, 2), nullable=False)
    type_paiement = Column(String(20), nullable=False)
    id_compte = Column(Integer, ForeignKey('comptes_bancaires.id_compte'))
    reason = Column(Text, nullable=False)
    statut = Column(String(10), nullable=False, default='active', server_default='active')
    id_utilisateur_creation = Column(Integer, ForeignKey('utilisateurs.id_utilisateur'), nullable=False)
    date_creation = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    motif_annulation = Column(Text)
    date_annulation = Column(DateTime(timezone=True))
    id_utilisateur_annulation = Column(Integer, ForeignKey('utilisateurs.id_utilisateur'))
    allocations = relationship('AffectationCredit', foreign_keys='AffectationCredit.id_avance', lazy='selectin')
    retours = relationship('Avance', foreign_keys=[id_origine], lazy='selectin')
    __table_args__ = (
        CheckConstraint('montant > 0', name='check_avance_montant'),
        CheckConstraint("statut IN ('active','annule')", name='check_avance_statut'),
        CheckConstraint('(id_client IS NOT NULL AND id_fournisseur IS NULL) OR (id_client IS NULL AND id_fournisseur IS NOT NULL)', name='check_avance_party'),
        CheckConstraint("(nature='avance' AND id_origine IS NULL) OR (nature='retour_avance' AND id_origine IS NOT NULL)", name='check_avance_origine'),
        CheckConstraint("(type_paiement='cash' AND id_compte IS NULL) OR (type_paiement='virement' AND id_compte IS NOT NULL)", name='check_avance_compte'),
    )

    @property
    def montant_disponible(self):
        used = sum((a.montant for a in self.allocations if a.statut == 'active'), Decimal('0'))
        returned = sum((r.montant for r in self.retours if r.statut == 'active'), Decimal('0'))
        return self.montant - used - returned if self.statut == 'active' else Decimal('0')

    @property
    def ledger_direction(self):
        incoming = self.id_client is not None
        if self.nature == 'retour_avance':
            incoming = not incoming
        return 'ENTREE' if incoming else 'SORTIE'


class AffectationCredit(Base):
    __tablename__ = 'affectations_credit'
    id_affectation = Column(Uuid, ForeignKey('correction_operations.operation_id', deferrable=True, initially='DEFERRED'), primary_key=True)
    id_transaction_source = Column(Integer, ForeignKey('transactions.id_transaction', ondelete='RESTRICT'), index=True)
    id_avance = Column(Uuid, ForeignKey('avances.id_avance', ondelete='RESTRICT'), index=True)
    id_transaction_cible = Column(Integer, ForeignKey('transactions.id_transaction', ondelete='RESTRICT'), nullable=False, index=True)
    montant = Column(Numeric(15, 2), nullable=False)
    date_effet = Column(Date, nullable=False, index=True)
    reason = Column(Text, nullable=False)
    statut = Column(String(10), nullable=False, default='active', server_default='active')
    id_utilisateur_creation = Column(Integer, ForeignKey('utilisateurs.id_utilisateur'), nullable=False)
    date_creation = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    motif_annulation = Column(Text)
    date_annulation = Column(DateTime(timezone=True))
    id_utilisateur_annulation = Column(Integer, ForeignKey('utilisateurs.id_utilisateur'))
    __table_args__ = (
        CheckConstraint('(id_transaction_source IS NOT NULL AND id_avance IS NULL) OR (id_transaction_source IS NULL AND id_avance IS NOT NULL)', name='check_affectation_source'),
        CheckConstraint('id_transaction_source IS NULL OR id_transaction_source <> id_transaction_cible', name='check_affectation_distinct'),
        CheckConstraint('montant > 0', name='check_affectation_montant'),
        CheckConstraint("statut IN ('active','annule')", name='check_affectation_statut'),
    )
