"""Shared payment validation used by payment and transaction workflows."""

from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.lettre_credit import LettreDeCredit
from app.models.fournisseur import Fournisseur
from app.models.compte_bancaire import CompteBancaire
from app.models.paiement import Paiement
from app.models.lettre_credit_utilisation import LettreCreditUtilisation
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.utils.business_date import business_date


def resolve_payment_funding(db: Session, payment_data, transaction: Transaction) -> dict:
    """Capture supplier funding independently of the method; preserve client routing."""
    if payment_data.type_paiement in {'compensation', 'carte', 'autre'}:
        raise HTTPException(422, 'Choisissez un paiement par espèces, chèque, virement ou lettre de crédit.')
    if payment_data.type_paiement == "lc":
        # An LC transfers a non-cash asset. It must not consume the supplier's
        # preferred caisse/bank source or create a cash/bank debit.
        return {"source_reglement": None, "id_compte": None}
    account_id = payment_data.id_compte
    requested_source = payment_data.source_reglement
    if transaction.id_fournisseur is None:
        if requested_source is not None:
            raise HTTPException(status_code=400, detail="La source de règlement est réservée aux fournisseurs")
        if account_id is not None and payment_data.type_paiement != "virement":
            raise HTTPException(status_code=400, detail="Le compte bancaire client est réservé aux virements")
        source = None
    else:
        supplier = db.query(Fournisseur).filter(
            Fournisseur.id_fournisseur == transaction.id_fournisseur
        ).first()
        preference = supplier.mode_reglement_prefere if supplier else None
        if preference and requested_source and requested_source != preference:
            raise HTTPException(status_code=409, detail="La source de règlement du fournisseur a changé. Rechargez le formulaire.")
        source = preference or requested_source or (
            "banque" if payment_data.type_paiement == "virement" and account_id else "caisse"
        )
        if source == "banque" and not account_id:
            raise HTTPException(status_code=400, detail="Sélectionnez le compte bancaire à débiter pour ce fournisseur")
        if source == "caisse" and account_id is not None:
            raise HTTPException(status_code=400, detail="Ce fournisseur est réglé depuis la caisse, sans compte bancaire")
    if account_id is not None and not db.query(CompteBancaire).filter(
        CompteBancaire.id_compte == account_id
    ).first():
        raise HTTPException(status_code=404, detail="Compte bancaire introuvable")
    return {"source_reglement": source, "id_compte": account_id}


def validate_lc_payment(
    db: Session,
    paiement_data,
    transaction: Transaction,
    current_user: Optional[Utilisateur],
    existing_payment_id: Optional[int] = None,
) -> Optional[LettreDeCredit]:
    """Validate and reserve an LC inside the caller's DB transaction."""
    if (paiement_data.type_paiement or "").lower() != "lc":
        return None

    if not paiement_data.id_lc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'ID de la Lettre de Crédit est requis pour ce type de paiement",
        )

    lc = (
        db.query(LettreDeCredit)
        .filter(LettreDeCredit.id_lc == paiement_data.id_lc)
        .with_for_update()
        .first()
    )
    if not lc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lettre de Crédit avec l'ID {paiement_data.id_lc} introuvable",
        )
    if not lc.id_client_origine or not lc.date_reception:
        raise HTTPException(409, "L'origine ou la date de réception de cette LC doit être vérifiée avant utilisation.")

    role = "reception" if transaction.id_client is not None else "utilisation"
    linked_payment = db.query(Paiement).filter(
        Paiement.id_lc == lc.id_lc,
        Paiement.role_lc == role,
        Paiement.statut != "annule",
    ).first()
    is_same_payment = (
        existing_payment_id is not None
        and linked_payment is not None
        and linked_payment.id_paiement == existing_payment_id
    )

    if linked_payment and not is_same_payment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette LC est déjà utilisée par un autre paiement",
        )

    if role == "reception":
        if lc.statut_cycle != "detenue" or lc.statut != "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cette LC n'est plus détenue par l'entreprise.",
            )
        if lc.id_client_origine != transaction.id_client:
            raise HTTPException(400, "Cette LC n'a pas été reçue de ce client.")
    else:
        active_usage = db.query(LettreCreditUtilisation.id_utilisation).filter(
            LettreCreditUtilisation.id_lc == lc.id_lc,
            LettreCreditUtilisation.statut == "active",
        ).first()
        same_usage = existing_payment_id is not None and db.query(LettreCreditUtilisation.id_utilisation).filter(
            LettreCreditUtilisation.id_lc == lc.id_lc,
            LettreCreditUtilisation.id_paiement == existing_payment_id,
            LettreCreditUtilisation.statut == "active",
        ).first()
        if active_usage and not same_usage:
            raise HTTPException(400, "Cette LC a déjà une utilisation sortante active.")
        if not is_same_payment and (lc.statut_cycle != "detenue" or lc.statut != "active"):
            raise HTTPException(400, "Cette LC n'est pas détenue par l'entreprise.")

    if role == "utilisation" and not is_same_payment:
        if not lc.est_disponible and lc.date_disponibilite > business_date():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Cette LC ne sera disponible qu'à partir du "
                    f"{lc.date_disponibilite}"
                ),
            )

    if role == "utilisation" and paiement_data.date_paiement < lc.date_disponibilite:
        raise HTTPException(422, 'Le paiement ne peut pas précéder la disponibilité de la LC.')
    if Decimal(str(paiement_data.montant)) != Decimal(str(lc.montant)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Le montant du paiement ({paiement_data.montant} MAD) doit correspondre "
                f"au montant total de la LC ({lc.montant} MAD) car elle doit être utilisée en totalité."
            ),
        )

    if lc.date_reception and paiement_data.date_paiement < lc.date_reception:
        raise HTTPException(422, "Le règlement ne peut pas précéder la réception de la LC.")

    if not is_same_payment:
        lc.version_utilisation += 1
    if role == "reception":
        lc.statut = "active"
        lc.statut_cycle = "detenue"
    else:
        lc.statut = "utilisee"
        lc.statut_cycle = "transferee"
        lc.type_detenteur = "fournisseur"
        lc.id_client = None
        lc.id_fournisseur = transaction.id_fournisseur
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    return lc

