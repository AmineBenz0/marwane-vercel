"""Coordinate an audited, atomic cancellation of a used letter of credit."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.compte_bancaire import MouvementBancaire
from app.models.cession_lc import CessionLC
from app.models.lettre_credit import LettreDeCredit
from app.models.paiement import Paiement
from app.models.user import Utilisateur
from app.services.financial_ledger import void_payment
from app.services.ledger import record_correction, void_bank_movement
from app.utils.business_date import business_date


def cancel_letter_credit(
    db: Session,
    id_lc: int,
    *,
    current_user: Utilisateur | None,
    reason: str,
) -> LettreDeCredit:
    """Reverse an LC's active effects while preserving linked audit history."""
    reason = reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="La raison de l'annulation est obligatoire")

    lc = db.query(LettreDeCredit).filter(
        LettreDeCredit.id_lc == id_lc,
    ).with_for_update().first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Cr�dit introuvable")
    if lc.statut == "annulee":
        raise HTTPException(status_code=400, detail="Cette LC est d�j� annul�e")
    if lc.statut not in {"utilisee", "cedee"}:
        raise HTTPException(status_code=400, detail="Seule une LC utilis�e peut �tre annul�e")

    linked_payments = db.query(Paiement).filter(
        Paiement.id_lc == id_lc,
        Paiement.statut != "annule",
    ).order_by(Paiement.id_paiement).with_for_update().all()
    linked_cessions = db.query(CessionLC).filter(
        CessionLC.id_lc == id_lc,
        CessionLC.statut == "active",
    ).order_by(
        CessionLC.date_creation.desc(),
        CessionLC.id_cession.desc(),
    ).with_for_update().all()
    bank_movement = db.query(MouvementBancaire).filter(
        MouvementBancaire.cle_idempotence == f"lc-bank-deposit-{id_lc}",
        MouvementBancaire.statut == "active",
    ).with_for_update().first()

    previous_status = lc.statut
    for payment in linked_payments:
        void_payment(db, payment, current_user=current_user, reason=reason)

    reversal = None
    if bank_movement:
        reversal = void_bank_movement(
            db,
            bank_movement,
            raison=reason,
            current_user=current_user,
            create_reversal_record=True,
        )

    for cession in linked_cessions:
        reversal_cession = CessionLC(
            id_lc=cession.id_lc,
            type_cedant=cession.type_cessionnaire,
            id_cedant_client=cession.id_cessionnaire_client,
            id_cedant_fournisseur=cession.id_cessionnaire_fournisseur,
            type_cessionnaire=cession.type_cedant,
            id_cessionnaire_client=cession.id_cedant_client,
            id_cessionnaire_fournisseur=cession.id_cedant_fournisseur,
            date_cession=business_date(),
            motif=f"Contrepassation de la cession #{cession.id_cession}: {reason}",
            id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
        )
        db.add(reversal_cession)
        db.flush()

        now = datetime.now(timezone.utc)
        cession.statut = "annulee"
        cession.motif_annulation = reason[:1000]
        cession.date_annulation = now
        cession.id_utilisateur_annulation = current_user.id_utilisateur if current_user else None
        cession.id_cession_inverse = reversal_cession.id_cession
        reversal_cession.id_cession_inverse = cession.id_cession

        # Reverse in newest-first order to restore the original LC holder.
        lc.type_detenteur = cession.type_cedant
        lc.id_client = cession.id_cedant_client
        lc.id_fournisseur = cession.id_cedant_fournisseur

        record_correction(
            db,
            type_entite="cession_lc",
            id_entite=cession.id_cession,
            action="annulation",
            raison=reason,
            current_user=current_user,
            details={
                "id_lc": lc.id_lc,
                "id_cession_inverse": reversal_cession.id_cession,
            },
        )

    lc.statut = "annulee"
    lc.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    record_correction(
        db,
        type_entite="lettre_credit",
        id_entite=lc.id_lc,
        action="annulation",
        raison=reason,
        current_user=current_user,
        id_mouvement_original=bank_movement.id_mouvement if bank_movement else None,
        id_mouvement_inverse=reversal.id_mouvement if reversal else None,
        details={"numero_reference": lc.numero_reference, "statut_precedent": previous_status},
    )
    db.commit()
    db.refresh(lc)
    return lc
