"""
Router FastAPI pour la gestion des Charges / Dépenses.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.caisse import Caisse
from app.models.charge import Charge
from app.models.user import Utilisateur
from app.schemas.charge import ChargeCreate, ChargeRead, ChargeSummary, ChargeUpdate
from app.services.ledger import record_correction, void_bank_movement, void_cash_movement
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/charges", tags=["Charges / Dépenses"])


def _money(value) -> Decimal:
    return Decimal(str(value or 0))


def _apply_charge_impact(
    db: Session,
    charge: Charge,
    *,
    current_user: Optional[Utilisateur] = None,
    reason: str = "Synchronisation de la dépense",
):
    """Synchronise a charge through append-only movement replacement.

    A charge may affect either cash or one bank account. Existing movements
    are never deleted or rewritten: changed movements are voided and replaced,
    with a correction journal entry linking both records.
    """
    from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
    from app.routers.paiements import _create_caisse_snapshot

    active_cash = db.query(Caisse).filter(
        Caisse.id_charge == charge.id_charge,
        Caisse.statut == "active",
    ).first()
    active_bank = db.query(MouvementBancaire).filter(
        MouvementBancaire.id_charge == charge.id_charge,
        MouvementBancaire.statut == "active",
    ).first()
    movement_date = datetime.combine(charge.date_charge, datetime.min.time())

    if charge.id_compte:
        compte = db.query(CompteBancaire).filter(CompteBancaire.id_compte == charge.id_compte).with_for_update().first()
        if not compte:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Compte bancaire introuvable pour cette dépense",
            )

        if active_cash:
            original_id = active_cash.id_mouvement
            void_cash_movement(
                db, active_cash, raison=reason, current_user=current_user,
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

        if active_bank and (
            active_bank.id_compte == charge.id_compte
            and active_bank.montant == charge.montant
            and active_bank.date_mouvement == movement_date
            and active_bank.notes == charge.libelle
        ):
            return active_bank

        original_bank_id = active_bank.id_mouvement if active_bank else None
        if active_bank:
            void_bank_movement(
                db, active_bank, raison=reason, current_user=current_user,
                create_reversal_record=False,
            )

        compte.solde_actuel = _money(compte.solde_actuel) - _money(charge.montant)
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
            db, active_bank, raison=reason, current_user=current_user,
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
        active_cash.montant == charge.montant
        and active_cash.date_mouvement == movement_date
    ):
        return active_cash

    original_cash_id = active_cash.id_mouvement if active_cash else None
    if active_cash:
        void_cash_movement(
            db, active_cash, raison=reason, current_user=current_user,
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
    _create_caisse_snapshot(db, replacement.id_mouvement)
    return replacement


@router.get("", response_model=List[ChargeRead])
def get_charges(
    skip: int = 0,
    limit: int = 100,
    categorie: Optional[str] = None,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Récupère la liste des dépenses avec filtres."""
    query = db.query(Charge).filter(Charge.statut == "active")

    if categorie:
        query = query.filter(Charge.categorie == categorie)
    if date_debut:
        query = query.filter(Charge.date_charge >= date_debut)
    if date_fin:
        query = query.filter(Charge.date_charge <= date_fin)

    return query.order_by(Charge.date_charge.desc()).offset(skip).limit(limit).all()


@router.get("/summary", response_model=List[ChargeSummary])
def get_charges_summary(
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Résumé des dépenses par catégorie sur une période."""
    query = db.query(
        Charge.categorie,
        func.sum(Charge.montant).label("total"),
        func.count(Charge.id_charge).label("count"),
    ).filter(Charge.statut == "active")

    if date_debut:
        query = query.filter(Charge.date_charge >= date_debut)
    if date_fin:
        query = query.filter(Charge.date_charge <= date_fin)

    return query.group_by(Charge.categorie).all()


@router.get("/{id}", response_model=ChargeRead)
def get_charge(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Détails d'une dépense."""
    charge = db.query(Charge).filter(Charge.id_charge == id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Dépense introuvable")

    return charge


@router.post("", response_model=ChargeRead, status_code=status.HTTP_201_CREATED)
def create_charge(
    charge_data: ChargeCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Crée une nouvelle dépense et génère le mouvement financier associé."""
    new_charge = Charge(
        **charge_data.model_dump(),
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
    )
    db.add(new_charge)
    db.flush()

    _apply_charge_impact(
        db,
        new_charge,
        current_user=current_user,
        reason="Création de la dépense",
    )

    db.commit()
    db.refresh(new_charge)
    return new_charge


@router.put("/{id}", response_model=ChargeRead)
def update_charge(
    id: int,
    charge_data: ChargeUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Met à jour une dépense et son mouvement financier associé."""
    charge = db.query(Charge).filter(Charge.id_charge == id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Dépense introuvable")
    if charge.statut == "annule":
        raise HTTPException(status_code=400, detail="La dépense est déjà annulée")

    update_dict = charge_data.model_dump(exclude_unset=True)
    reason = update_dict.pop("raison", None) or "Correction opérationnelle de la dépense"
    changed_fields = list(update_dict)
    for key, value in update_dict.items():
        setattr(charge, key, value)

    charge.id_utilisateur_modification = current_user.id_utilisateur if current_user else None

    _apply_charge_impact(
        db,
        charge,
        current_user=current_user,
        reason=reason,
    )
    if changed_fields:
        record_correction(
            db,
            type_entite="charge",
            id_entite=charge.id_charge,
            action="modification",
            raison=reason,
            current_user=current_user,
            details={"champs": changed_fields},
        )

    db.commit()
    db.refresh(charge)
    return charge


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_charge(
    id: int,
    raison: str = "Annulation demandée par l'utilisateur",
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Supprime une dépense et son mouvement financier associé."""
    from app.models.compte_bancaire import MouvementBancaire

    charge = db.query(Charge).filter(Charge.id_charge == id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Dépense introuvable")
    if charge.statut == "annule":
        raise HTTPException(status_code=400, detail="La dépense est déjà annulée")

    bank_mvmt = db.query(MouvementBancaire).filter(
        MouvementBancaire.id_charge == charge.id_charge,
        MouvementBancaire.statut == "active",
    ).first()
    if bank_mvmt:
        void_bank_movement(
            db,
            bank_mvmt,
            raison=raison,
            current_user=current_user,
            create_reversal_record=True,
        )

    caisse_mvmt = db.query(Caisse).filter(Caisse.id_charge == charge.id_charge, Caisse.statut == "active").first()
    if caisse_mvmt:
        void_cash_movement(
            db,
            caisse_mvmt,
            raison=raison,
            current_user=current_user,
            create_reversal_record=True,
        )
        from app.routers.paiements import _create_caisse_snapshot
        _create_caisse_snapshot(db, caisse_mvmt.id_mouvement)

    charge.statut = "annule"
    charge.motif_annulation = raison[:1000]
    charge.date_annulation = datetime.now(timezone.utc)
    charge.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    record_correction(
        db,
        type_entite="charge",
        id_entite=charge.id_charge,
        action="annulation",
        raison=raison,
        current_user=current_user,
        details={"source": "charge"},
    )
    db.commit()
    return None
