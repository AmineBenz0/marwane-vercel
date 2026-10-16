"""Shared cancellation primitive; the caller owns the transaction."""
from datetime import datetime, timezone
from fastapi import HTTPException, status
from app.models.caisse import Caisse
from app.models.compte_bancaire import MouvementBancaire
from app.services.financial_ledger import create_cash_snapshot
from app.services.ledger import record_correction, void_bank_movement, void_cash_movement


def cancel_charge(db, charge, raison, current_user):
    if charge.statut == "annule":
        raise HTTPException(status_code=400, detail="La dépense est déjà annulée")
    raison = raison.strip()
    if not raison:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La raison de l'annulation est obligatoire",
        )

    bank_mvmt = db.query(MouvementBancaire).filter(
        MouvementBancaire.id_charge == charge.id_charge,
        MouvementBancaire.statut == "active",
    ).first()
    correction_pairs = []
    if bank_mvmt:
        bank_reversal = void_bank_movement(
            db,
            bank_mvmt,
            raison=raison,
            current_user=current_user,
            create_reversal_record=True,
        )
        correction_pairs.append(
            (bank_mvmt.id_mouvement, bank_reversal.id_mouvement if bank_reversal else None, "banque")
        )

    caisse_mvmt = db.query(Caisse).filter(Caisse.id_charge == charge.id_charge, Caisse.statut == "active").first()
    if caisse_mvmt:
        caisse_reversal = void_cash_movement(
            db,
            caisse_mvmt,
            raison=raison,
            current_user=current_user,
            create_reversal_record=True,
        )
        correction_pairs.append(
            (caisse_mvmt.id_mouvement, caisse_reversal.id_mouvement if caisse_reversal else None, "caisse")
        )
        create_cash_snapshot(db, caisse_mvmt.id_mouvement)

    charge.statut = "annule"
    charge.motif_annulation = raison[:1000]
    charge.date_annulation = datetime.now(timezone.utc)
    charge.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    if correction_pairs:
        for original_id, reversal_id, movement_table in correction_pairs:
            record_correction(
                db,
                type_entite="charge",
                id_entite=charge.id_charge,
                action="annulation",
                raison=raison,
                current_user=current_user,
                id_mouvement_original=original_id,
                id_mouvement_inverse=reversal_id,
                details={"source": "charge", "movement_table": movement_table},
            )
    else:
        record_correction(
            db,
            type_entite="charge",
            id_entite=charge.id_charge,
            action="annulation",
            raison=raison,
            current_user=current_user,
            details={"source": "charge"},
        )
