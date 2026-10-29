"""Serialize financial writers on the parent transaction before its payments."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.paiement import Paiement
from app.models.transaction import Transaction


def lock_transaction(db: Session, transaction_id: int) -> Transaction:
    transaction = db.query(Transaction).filter(
        Transaction.id_transaction == transaction_id,
    ).populate_existing().with_for_update().one_or_none()
    if transaction is None:
        raise HTTPException(404, f"Transaction {transaction_id} introuvable")
    # Refresh collections too if a caller loaded them before waiting for a lock.
    db.expire(transaction, ["paiements", "allocations"])
    return transaction


def lock_payment(db: Session, payment_id: int) -> tuple[Paiement, Transaction]:
    transaction_id = db.query(Paiement.id_transaction).filter(
        Paiement.id_paiement == payment_id,
    ).scalar()
    if transaction_id is None:
        raise HTTPException(404, f"Paiement {payment_id} introuvable")
    transaction = lock_transaction(db, transaction_id)
    payment = db.query(Paiement).filter(
        Paiement.id_paiement == payment_id,
    ).populate_existing().with_for_update().one_or_none()
    if payment is None:
        raise HTTPException(404, f"Paiement {payment_id} introuvable")
    return payment, transaction
