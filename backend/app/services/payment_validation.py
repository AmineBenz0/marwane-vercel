"""Shared payment validation used by payment and transaction workflows."""

from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.lettre_credit import LettreDeCredit
from app.models.fournisseur import Fournisseur
from app.models.compte_bancaire import CompteBancaire
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.utils.business_date import business_date


def resolve_payment_funding(db: Session, payment_data, transaction: Transaction) -> dict:
    """Capture supplier funding independently of the method; preserve client routing."""
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

    linked_payment = db.query(Paiement).filter(
        Paiement.id_lc == lc.id_lc,
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

    if not is_same_payment:
        if lc.statut != "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La Lettre de Crédit n'est pas active (Statut: {lc.statut})",
            )
        if not lc.est_disponible and lc.date_disponibilite > business_date():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Cette LC ne sera disponible qu'à partir du "
                    f"{lc.date_disponibilite}"
                ),
            )

    if Decimal(str(paiement_data.montant)) != Decimal(str(lc.montant)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Le montant du paiement ({paiement_data.montant} MAD) doit correspondre "
                f"au montant total de la LC ({lc.montant} MAD) car elle doit être utilisée en totalité."
            ),
        )

    if transaction.id_client and (
        lc.type_detenteur != "client" or lc.id_client != transaction.id_client
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette LC n'appartient pas au client de cette transaction",
        )
    if transaction.id_fournisseur and (
        lc.type_detenteur != "fournisseur" or lc.id_fournisseur != transaction.id_fournisseur
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette LC n'appartient pas au fournisseur de cette transaction",
        )

    if not is_same_payment:
        lc.version_utilisation += 1
    lc.statut = "utilisee"
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    return lc
