"""Business operations for the cash and bank financial ledgers.

Routers are intentionally thin: request validation lives at the API boundary,
while movement replacement, balance updates, snapshots, and correction links
are kept in this service so every workflow follows the same append-only rules.
"""

from datetime import datetime, time, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session, aliased

from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.charge import Charge
from app.models.cession_lc import CessionLC
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.lettre_credit import LettreDeCredit
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.model…3450 tokens truncated…      raison=reason,
                current_user=current_user,
                id_mouvement_original=original_id,
                id_mouvement_inverse=replacement.id_mouvement,
                details={"original_table": "caisse", "replacement_table": "mouvements_bancaires"},
            )
        if original_bank_id is not None:
            original = db.query(MouvementBancaire).filter(
                MouvementBancaire.id_mouvement == original_bank_id
            ).first()
            if original:
                original.id_mouvement_inverse = replacement.id_mouvement
                replacement.id_mouvement_inverse = original.id_mouvement
            record_correction(
                db,
                type_entite="charge",
                id_entite=charge.id_charge,
                action="remplacement_mouvement",
                raison=reason,
                current_user=current_user,
                id_mouvement_original=original_bank_id,
                id_mouvement_inverse=replacement.id_mouvement,
                details={"table": "mouvements_bancaires"},
            )
        return replacement

    if active_bank:
        original_id = active_bank.id_mouvement
        void_bank_movement(
            db,
            active_bank,
            raison=reason,
            current_user=current_user,
            create_reversal_record=False,
        )

    if active_cash and (
        _money(active_cash.montant) == _money(charge.montant)
        and _same_datetime(active_cash.date_mouvement, movement_date)
    ):
        return active_cash

    original_cash_id = active_cash.id_mouvement if active_cash else None
    if active_cash:
        void_cash_movement(
            db,
            active_cash,
            raison=reason,
            current_user=current_user,
            create_reversal_record=False,
        )
    replacement = Caisse(
        montant=charge.montant,
        type_mouvement="SORTIE",
        id_charge=charge.id_charge,
        date_mouvement=movement_date,
    )
    db.add(replacement)
    db.flush()
    if active_bank:
        original = db.query(MouvementBancaire).filter(
            MouvementBancaire.id_mouvement == original_id
        ).first()
        if original:
            original.id_mouvement_inverse = replacement.id_mouvement
            replacement.id_mouvement_inverse = original.id_mouvement
        record_correction(
            db,
            type_entite="charge",
            id_entite=charge.id_charge,
            action="remplacement_mouvement",
            raison=reason,
            current_user=current_user,
            id_mouvement_original=original_id,
            id_mouvement_inverse=replacement.id_mouvement,
            details={"original_table": "mouvements_bancaires", "replacement_table": "caisse"},
        )
    if original_cash_id is not None:
        original = db.query(Caisse).filter(Caisse.id_mouvement == original_cash_id).first()
        if original:
            original.id_mouvement_inverse = replacement.id_mouvement
            replacement.id_mouvement_inverse = original.id_mouvement
        record_correction(
            db,
            type_entite="charge",
            id_entite=charge.id_charge,
            action="remplacement_mouvement",
            raison=reason,
            current_user=current_user,
            id_mouvement_original=original_cash_id,
            id_mouvement_inverse=replacement.id_mouvement,
            details={"table": "caisse"},
        )
    db.flush()
    create_cash_snapshot(db, replacement.id_mouvement)
    return replacement
