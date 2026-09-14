"""Shared append-only financial ledger primitives."""

import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.financial_correction import CorrectionFinanciere
from app.models.user import Utilisateur


def _money(value) -> Decimal:
    return Decimal(str(value or 0))


def _opposite_movement_type(value: str) -> str:
    return "SORTIE" if value == "ENTREE" else "ENTREE"


def record_correction(
    db: Session,
    *,
    type_entite: str,
    id_entite: int,
    action: str,
    raison: str,
    current_user: Optional[Utilisateur],
    id_mouvement_original: Optional[int] = None,
    id_mouvement_inverse: Optional[int] = None,
    details: Optional[dict] = None,
) -> CorrectionFinanciere:
    """Append a correction event; this function never updates old events."""
    event = CorrectionFinanciere(
        type_entite=type_entite,
        id_entite=id_entite,
        action=action,
        id_mouvement_original=id_mouvement_original,
        id_mouvement_inverse=id_mouvement_inverse,
        raison=(raison or "Correction financière").strip()[:1000],
        details=json.dumps(details, ensure_ascii=False, default=str) if details else None,
        id_utilisateur=current_user.id_utilisateur if current_user else None,
    )
    db.add(event)
    db.flush()
    return event


def void_cash_movement(
    db: Session,
    movement: Caisse,
    *,
    raison: str,
    current_user: Optional[Utilisateur],
    create_reversal_record: bool = True,
) -> Optional[Caisse]:
    """Void a cash movement and optionally create an explicit voided inverse."""
    if not movement or movement.statut != "active":
        return None

    now = datetime.now(timezone.utc)
    reversal = None
    if create_reversal_record:
        reversal = Caisse(
            montant=movement.montant,
            type_mouvement=_opposite_movement_type(movement.type_mouvement),
            statut="annule",
            id_transaction=movement.id_transaction,
            id_paiement=movement.id_paiement,
            id_charge=movement.id_charge,
            date_mouvement=now,
            motif_annulation=raison[:1000],
            date_annulation=now,
            id_utilisateur_annulation=current_user.id_utilisateur if current_user else None,
        )
        db.add(reversal)
        db.flush()

    movement.statut = "annule"
    movement.motif_annulation = raison[:1000]
    movement.date_annulation = now
    movement.id_utilisateur_annulation = current_user.id_utilisateur if current_user else None
    if reversal:
        movement.id_mouvement_inverse = reversal.id_mouvement
        reversal.id_mouvement_inverse = movement.id_mouvement
    db.flush()

    record_correction(
        db,
        type_entite="caisse",
        id_entite=movement.id_mouvement,
        action="annulation",
        raison=raison,
        current_user=current_user,
        id_mouvement_original=movement.id_mouvement,
        id_mouvement_inverse=reversal.id_mouvement if reversal else None,
    )
    return reversal


def void_bank_movement(
    db: Session,
    movement: MouvementBancaire,
    *,
    raison: str,
    current_user: Optional[Utilisateur],
    create_reversal_record: bool = True,
) -> Optional[MouvementBancaire]:
    """Void a bank movement and restore its account balance exactly once."""
    if not movement or movement.statut != "active":
        return None

    account = db.query(CompteBancaire).filter(CompteBancaire.id_compte == movement.id_compte).with_for_update().first()
    if account:
        amount = _money(movement.montant)
        account.solde_actuel = _money(account.solde_actuel) + (
            amount if movement.type_mouvement == "SORTIE" else -amount
        )

    now = datetime.now(timezone.utc)
    reversal = None
    if create_reversal_record:
        reversal = MouvementBancaire(
            id_compte=movement.id_compte,
            montant=movement.montant,
            type_mouvement=_opposite_movement_type(movement.type_mouvement),
            source="reversal",
            reference=str(movement.id_mouvement),
            notes=raison[:255],
            statut="annule",
            id_paiement=movement.id_paiement,
            id_charge=movement.id_charge,
            date_mouvement=now,
            motif_annulation=raison[:1000],
            date_annulation=now,
            id_utilisateur_annulation=current_user.id_utilisateur if current_user else None,
        )
        db.add(reversal)
        db.flush()

    movement.statut = "annule"
    movement.motif_annulation = raison[:1000]
    movement.date_annulation = now
    movement.id_utilisateur_annulation = current_user.id_utilisateur if current_user else None
    if reversal:
        movement.id_mouvement_inverse = reversal.id_mouvement
        reversal.id_mouvement_inverse = movement.id_mouvement
    db.flush()

    record_correction(
        db,
        type_entite="banque",
        id_entite=movement.id_mouvement,
        action="annulation",
        raison=raison,
        current_user=current_user,
        id_mouvement_original=movement.id_mouvement,
        id_mouvement_inverse=reversal.id_mouvement if reversal else None,
    )
    return reversal
