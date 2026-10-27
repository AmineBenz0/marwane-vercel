"""Persist the exact production quantities consumed by an egg sale."""
from sqlalchemy import Column, Integer, ForeignKey, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class EggAllocation(Base):
    __tablename__ = 'egg_sale_allocations'
    id = Column(Integer, primary_key=True)
    id_transaction = Column(Integer, ForeignKey('transactions.id_transaction', ondelete='CASCADE'), nullable=False, index=True)
    id_production = Column(Integer, ForeignKey('productions.id_production', ondelete='RESTRICT'), nullable=False, index=True)
    quantite = Column(Integer, nullable=False)
    quantite_livree = Column(Integer, nullable=False, default=0, server_default="0")
    production = relationship('Production', lazy='joined')
    __table_args__ = (
        CheckConstraint('quantite > 0', name='egg_allocation_positive'),
        CheckConstraint('quantite_livree >= 0 AND quantite_livree <= quantite', name='egg_allocation_delivered_bounded'),
        UniqueConstraint('id_transaction', 'id_production', name='egg_allocation_source_unique'),
    )
