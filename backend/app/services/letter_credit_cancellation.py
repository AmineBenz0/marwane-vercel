"""Coordinate an audited, atomic cancellation of a used letter of credit."""

from fastapi import HTTPException
from sqlalchemy.orm import Session, aliased

from app.models.compte_bancaire import MouvementBancaire
from app.models.cession_lc import CessionLC
from app.models.caisse import Caisse
from app.models.lettre_credit import LettreDeCredit
from app.models.lettre_credit_utilisation import LettreCreditUtilisation
from app.models.paiement import Paiement
from app.models.user import Utilisateur
from app.services.financial_ledger import void_payment
from app.services.ledger import record_correction, void_bank_movement, void_cash_movement
from app.utils.business_date import business_date


def cancel_letter_credit(
    db: Session,
    id_lc: int,
    *,
    current_user: Utilisateur | None,
    reason: str,
    version_utilisation: int,
) -> LettreDeCredit:
    """Reverse an LC's active effects while preserving linked audit history."""
    reason = reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="La raison de l'annulation est obligatoire")

    lc = db.query(LettreDeCredit).filter(
        LettreDeCredit.id_lc == id_lc,
    ).with_for_update().first()
    if not lc:
        raise HTTPException(status_code=404, detail="Lettre de Crédit introuvable")
    if lc.statut != "utilisee":
        raise HTTPException(status_code=400, detail="Seule une LC utilisée peut être annulée")
    if lc.version_utilisation != version_utilisation:
        raise HTTPException(
            status_code=409,
            detail="Cette LC a été réutilisée depuis l'ouverture de la confirmation. Actualisez la page.",
        )

    linked_payments = db.query(Paiement).filter(
        Paiement.id_lc == id_lc,
        Paiement.role_lc == "utilisation",
        Paiement.statut != "annule",
    ).order_by(Paiement.id_paiement).with_for_update().all()
    source_cession = aliased(CessionLC)
    reversal_cession = aliased(CessionLC)
    has_reversal = db.query(reversal_cession.id_cession).filter(
        reversal_cession.id_cession_origine == source_cession.id_cession,
    ).exists()
    linked_cessions = db.query(source_cession).filter(
        source_cession.id_lc == id_lc,
        source_cession.id_cession_origine.is_(None),
        ~has_reversal,
    ).order_by(
        source_cession.date_creation.desc(),
        source_cession.id_cession.desc(),
    ).with_for_update().all()
    deposits = db.query(MouvementBancaire).filter(
        MouvementBancaire.id_paiement.is_(None), MouvementBancaire.source == 'lc',
        MouvementBancaire.statut == 'active',
        (MouvementBancaire.cle_idempotence.like(f'lc-bank-deposit-{id_lc}-%') |
         (MouvementBancaire.cle_idempotence == f'lc-bank-deposit-{id_lc}')),
    ).order_by(MouvementBancaire.id_mouvement).with_for_update().all()
    if len(deposits) > 1:
        raise HTTPException(409, 'Réconciliez les versements multiples de cette LC avant son annulation.')
    bank_movement = deposits[0] if deposits else None
    if not linked_payments and not linked_cessions and not bank_movement:
        raise HTTPException(status_code=409, detail="Aucune utilisation active de cette LC n'est à annuler.")

    previous_status = lc.statut
    for payment in linked_payments:
        void_payment(db, payment, current_user=current_user, reason=reason, release_lc=False)

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
            id_cession_origine=cession.id_cession,
            motif=f"Contrepassation de la cession #{cession.id_cession}: {reason}",
            id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
        )
        db.add(reversal_cession)
        db.flush()


        for cash_movement in db.query(Caisse).filter(
            Caisse.id_cession == cession.id_cession,
            Caisse.statut == "active",
        ).with_for_update().all():
            void_cash_movement(
                db,
                cash_movement,
                raison=reason,
                current_user=current_user,
                create_reversal_record=True,
            )

        # Reverse in newest-first order to restore the original LC holder.
        lc.type_detenteur = "client"
        lc.id_client = lc.id_client_origine
        lc.id_fournisseur = None

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

    db.query(LettreCreditUtilisation).filter(
        LettreCreditUtilisation.id_lc == id_lc,
        LettreCreditUtilisation.statut == "active",
    ).update({"statut": "annulee", "motif_annulation": reason[:1000]}, synchronize_session=False)
    lc.statut = "active"
    lc.statut_cycle = "detenue" if lc.id_client_origine is not None else "a_verifier"
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
        details={
            "numero_reference": lc.numero_reference,
            "version_utilisation": version_utilisation,
            "statut_precedent": previous_status,
        },
    )
    db.commit()
    db.refresh(lc)
    return lc

