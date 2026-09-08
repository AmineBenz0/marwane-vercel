"""Persistent, idempotent in-app alert generation."""

from datetime import date

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.alert import Alerte
from app.models.transaction import Transaction
from app.utils.business_date import business_date


def create_overdue_alerts(db: Session, reference_date: date | None = None) -> int:
    """Create the overdue alert for each newly overdue transaction once."""
    reference_date = reference_date or business_date()
    transactions = db.query(Transaction).options(joinedload(Transaction.paiements)).filter(
        Transaction.est_actif.is_(True),
        Transaction.date_echeance.isnot(None),
        Transaction.date_echeance < reference_date,
    ).all()
    created = 0
    for transaction in transactions:
        if transaction.statut_paiement in {"paye", "surpaye"}:
            continue
        exists = db.query(Alerte.id_alerte).filter(
            Alerte.id_transaction == transaction.id_transaction,
            Alerte.type_alerte == "paiement_en_retard",
            Alerte.date_reference == transaction.date_echeance,
        ).first()
        if exists:
            continue
        try:
            # The unique database key is the concurrency boundary. A nested
            # transaction lets a concurrent cron invocation lose cleanly
            # without rolling back alerts already created in this run.
            with db.begin_nested():
                db.add(Alerte(
                    id_transaction=transaction.id_transaction,
                    type_alerte="paiement_en_retard",
                    titre="Paiement en retard",
                    message=f"La transaction #{transaction.id_transaction} est échue depuis le {transaction.date_echeance}.",
                    date_reference=transaction.date_echeance,
                ))
                db.flush()
            created += 1
        except IntegrityError:
            # Another worker inserted the same alert between the read and
            # insert. The unique key makes the operation idempotent.
            continue
    db.commit()
    return created
