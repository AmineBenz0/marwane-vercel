"""Shared payment validation used by payment and transaction workflows."""

from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.lettre_credit import LettreDeCredit
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.utils.business_date import business_date


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
