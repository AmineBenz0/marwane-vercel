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
from sqlalchemy.orm import Session

from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.charge import Charge
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.services.ledger import record_correction, void_bank_movement, void_cash_movement


IMMEDIATE_PAYMENT_TYPES = frozenset(
    {"cash", "virement", "lc", "carte", "compensation", "autre"}
)


def _money(value) -> Decimal:
    return Decimal(str(value or 0))


def _source_datetime(source_date) -> datetime:
    """Represent a business date consistently in the UTC ledger."""
    return datetime.combine(source_date, time.min, tzinfo=timezone.utc)


def _same_datetime(left: Optional[datetime], right: datetime) -> bool:
    """Compare DB timestamps safely across timezone-aware/naive drivers."""
    if left is None:
        return False
    if left.tzinfo is None:
        left = left.replace(tzinfo=timezone.utc)
    return left == right


def validate_bank_idempotency(existing: MouvementBancaire, requested: dict) -> None:
    """Reject reuse of a bank idempotency key for another movement."""
    same_identity = (
        existing.id_compte == requested["id_compte"]
        and _money(existing.montant) == _money(requested["montant"])
        and existing.type_mouvement == requested["type_mouvement"]
        and existing.source == requested["source"]
        and existing.reference == requested.get("reference")
        and existing.id_paiement == requested.get("id_paiement")
        and existing.id_charge == requested.get("id_charge")
    )
    if not same_identity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La clé d'idempotence est déjà utilisée pour un autre mouvement bancaire",
        )


def record_bank_movement(
    db: Session,
    *,
    id_compte: int,
    montant: Decimal,
    type_mouvement: str,
    source: str,
    reference: Optional[str] = None,
    notes: Optional[str] = None,
    id_paiement: Optional[int] = None,
    id_charge: Optional[int] = None,
    cle_idempotence: Optional[str] = None,
    current_user: Optional[Utilisateur] = None,
    date_mouvement: Optional[datetime] = None,
) -> MouvementBancaire:
    """Append a bank movement and update its account atomically.

    All callers use this operation so account locking, Decimal arithmetic and
    replay protection are applied consistently.
    """
    amount = _money(montant)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant bancaire doit être supérieur à zéro")
    if type_mouvement not in {"ENTREE", "SORTIE"}:
        raise HTTPException(status_code=400, detail="type_mouvement doit être 'ENTREE' ou 'SORTIE'")

    account = db.query(CompteBancaire).filter(
        CompteBancaire.id_compte == id_compte,
    ).with_for_update().first()
    if not account:
        raise HTTPException(status_code=404, detail="Compte bancaire introuvable")

    if cle_idempotence:
        existing = db.query(MouvementBancaire).filter(
            MouvementBancaire.cle_idempotence == cle_idempotence,
        ).first()
        if existing:
            validate_bank_idempotency(existing, {
                "id_compte": id_compte,
                "montant": amount,
                "type_mouvement": type_mouvement,
                "source": source,
                "reference": reference,
                "id_paiement": id_paiement,
                "id_charge": id_charge,
            })
            return existing

    movement = MouvementBancaire(
        id_compte=account.id_compte,
        montant=amount,
        type_mouvement=type_mouvement,
        source=source,
        reference=reference,
        notes=notes,
        id_paiement=id_paiement,
        id_charge=id_charge,
        cle_idempotence=cle_idempotence,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
        date_mouvement=date_mouvement,
    )
    account.solde_actuel = _money(account.solde_actuel) + (
        amount if type_mouvement == "ENTREE" else -amount
    )
    db.add(movement)
    db.flush()
    return movement


def create_cash_snapshot(db: Session, movement_id: int) -> CaisseSoldeHistorique:
    """Append a point-in-time cash balance snapshot after a cash change."""
    balance = db.query(
        func.coalesce(
            func.sum(
                case(
                    (Caisse.type_mouvement == "ENTREE", Caisse.montant),
                    else_=-Caisse.montant,
                )
            ),
            0,
        )
    ).filter(Caisse.statut == "active").scalar() or Decimal("0.00")
    snapshot = CaisseSoldeHistorique(
        solde=balance,
        id_mouvement=movement_id,
        date_snapshot=datetime.now(timezone.utc),
    )
    db.add(snapshot)
    return snapshot


def sync_payment_cash_movement(
    db: Session,
    payment: Paiement,
    transaction: Transaction,
    *,
    current_user: Optional[Utilisateur] = None,
    reason: str = "Synchronisation du mouvement de caisse",
) -> Optional[Caisse]:
    """Synchronize a payment's effective cash impact append-only.

    A changed movement is voided and replaced by a new row. A movement that
    ceases to be effective is voided with an explicit inverse audit row.
    """
    should_create = payment.est_effectif and (
        payment.type_paiement in IMMEDIATE_PAYMENT_TYPES
        or payment.type_paiement == "cheque"
    )

    existing = db.query(Caisse).filter(
        Caisse.id_paiement == payment.id_paiement,
        Caisse.statut == "active",
    ).first()

    if not should_create:
        if existing:
            void_cash_movement(
                db,
                existing,
                raison=reason,
                current_user=current_user,
                create_reversal_record=True,
            )
            create_cash_snapshot(db, existing.id_mouvement)
        return None

    movement_type = "ENTREE" if transaction.id_client is not None else "SORTIE"
    expected_date = _source_datetime(payment.date_paiement)
    if existing and (
        _money(existing.montant) == _money(payment.montant)
        and existing.type_mouvement == movement_type
        and _same_datetime(existing.date_mouvement, expected_date)
    ):
        return existing

    original_id = existing.id_mouvement if existing else None
    if existing:
        void_cash_movement(
            db,
            existing,
            raison=reason,
            current_user=current_user,
            create_reversal_record=False,
        )

    replacement = Caisse(
        montant=payment.montant,
        type_mouvement=movement_type,
        id_transaction=transaction.id_transaction,
        id_paiement=payment.id_paiement,
        date_mouvement=expected_date,
    )
    db.add(replacement)
    db.flush()
    if original_id is not None:
        original = db.query(Caisse).filter(Caisse.id_mouvement == original_id).first()
        if original:
            original.id_mouvement_inverse = replacement.id_mouvement
            replacement.id_mouvement_inverse = original.id_mouvement
        record_correction(
            db,
            type_entite="paiement",
            id_entite=payment.id_paiement,
            action="remplacement_mouvement",
            raison=reason,
            current_user=current_user,
            id_mouvement_original=original_id,
            id_mouvement_inverse=replacement.id_mouvement,
            details={"table": "caisse"},
        )
    create_cash_snapshot(db, replacement.id_mouvement)
    return replacement


def apply_charge_impact(
    db: Session,
    charge: Charge,
    *,
    current_user: Optional[Utilisateur] = None,
    reason: str = "Synchronisation de la dépense",
) -> Caisse | MouvementBancaire:
    """Synchronize a charge through append-only movement replacement."""
    active_cash = db.query(Caisse).filter(
        Caisse.id_charge == charge.id_charge,
        Caisse.statut == "active",
    ).first()
    active_bank = db.query(MouvementBancaire).filter(
        MouvementBancaire.id_charge == charge.id_charge,
        MouvementBancaire.statut == "active",
    ).first()
    movement_date = _source_datetime(charge.date_charge)

    if charge.id_compte:
        account = db.query(CompteBancaire).filter(
            CompteBancaire.id_compte == charge.id_compte
        ).with_for_update().first()
        if not account:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Compte bancaire introuvable pour cette dépense",
            )

        if active_cash:
            original_id = active_cash.id_mouvement
            void_cash_movement(
                db,
                active_cash,
                raison=reason,
                current_user=current_user,
                create_reversal_record=False,
            )
            record_correction(
                db,
                type_entite="charge",
                id_entite=charge.id_charge,
                action="remplacement_mouvement",
                raison=reason,
                current_user=current_user,
                id_mouvement_original=original_id,
                details={"original_table": "caisse", "replacement_table": "mouvements_bancaires"},
            )
            create_cash_snapshot(db, original_id)

        if active_bank and (
            active_bank.id_compte == charge.id_compte
            and _money(active_bank.montant) == _money(charge.montant)
            and _same_datetime(active_bank.date_mouvement, movement_date)
            and active_bank.notes == charge.libelle
        ):
            return active_bank

        original_bank_id = active_bank.id_mouvement if active_bank else None
        if active_bank:
            void_bank_movement(
                db,
                active_bank,
                raison=reason,
                current_user=current_user,
                create_reversal_record=False,
            )

        account.solde_actuel = _money(account.solde_actuel) - _money(charge.montant)
        replacement = MouvementBancaire(
            id_compte=charge.id_compte,
            id_charge=charge.id_charge,
            montant=charge.montant,
            type_mouvement="SORTIE",
            source="frais",
            notes=charge.libelle,
            date_mouvement=movement_date,
        )
        db.add(replacement)
        db.flush()
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
        record_correction(
            db,
            type_entite="charge",
            id_entite=charge.id_charge,
            action="remplacement_mouvement",
            raison=reason,
            current_user=current_user,
            id_mouvement_original=original_id,
            details={"original_table": "mouvements_bancaires", "replacement_table": "caisse"},
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
