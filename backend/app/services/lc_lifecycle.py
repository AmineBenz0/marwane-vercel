"""Write explicit LC lifecycle links alongside the existing payment ledgers."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.lettre_credit_utilisation import LettreCreditUtilisation
from app.models.lettre_credit import LettreDeCredit
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.models.user import Utilisateur


def payment_lc_role(transaction: Transaction, type_paiement: str | None) -> str | None:
    if (type_paiement or "").lower() != "lc":
        return None
    return "reception" if transaction.id_client is not None else "utilisation"


def record_lc_payment_event(
    db: Session,
    payment: Paiement,
    transaction: Transaction,
    *,
    current_user: Utilisateur | None = None,
) -> LettreCreditUtilisation | None:
    """Persist the outgoing use; incoming receipt remains the payment row itself."""
    if payment.id_lc is None:
        return None
    role = payment_lc_role(transaction, payment.type_paiement)
    payment.role_lc = role
    lc = db.query(LettreDeCredit).filter(LettreDeCredit.id_lc == payment.id_lc).with_for_update().one()
    if role == "reception":
        return None

    existing = db.query(LettreCreditUtilisation).filter(
        LettreCreditUtilisation.id_lc == lc.id_lc,
        LettreCreditUtilisation.id_paiement == payment.id_paiement,
        LettreCreditUtilisation.statut == "active",
    ).one_or_none()
    if existing:
        return existing
    active = db.query(LettreCreditUtilisation.id_utilisation).filter(
        LettreCreditUtilisation.id_lc == lc.id_lc,
        LettreCreditUtilisation.statut == "active",
    ).first()
    if active:
        raise HTTPException(409, "Cette LC a déjà une utilisation sortante active.")
    if transaction.id_fournisseur is None:
        raise HTTPException(422, "Une utilisation sortante de LC doit être liée à un fournisseur.")

    usage = LettreCreditUtilisation(
        id_lc=lc.id_lc,
        type_utilisation="fournisseur",
        date_utilisation=payment.date_paiement,
        id_fournisseur=transaction.id_fournisseur,
        id_paiement=payment.id_paiement,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
    )
    db.add(usage)
    return usage


def record_lc_non_payment_use(
    db: Session,
    lc: LettreDeCredit,
    *,
    type_utilisation: str,
    date_utilisation,
    current_user: Utilisateur | None = None,
    id_fournisseur: int | None = None,
    id_compte: int | None = None,
    id_cession: int | None = None,
    id_mouvement_bancaire: int | None = None,
) -> LettreCreditUtilisation:
    active = db.query(LettreCreditUtilisation.id_utilisation).filter(
        LettreCreditUtilisation.id_lc == lc.id_lc,
        LettreCreditUtilisation.statut == "active",
    ).first()
    if active:
        raise HTTPException(409, "Cette LC a déjà une utilisation sortante active.")
    usage = LettreCreditUtilisation(
        id_lc=lc.id_lc,
        type_utilisation=type_utilisation,
        date_utilisation=date_utilisation,
        id_fournisseur=id_fournisseur,
        id_compte=id_compte,
        id_cession=id_cession,
        id_mouvement_bancaire=id_mouvement_bancaire,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
    )
    db.add(usage)
    lc.statut_cycle = "deposee" if type_utilisation == "banque" else "transferee"
    return usage
