"""Read-only integrity checks for financial and inventory ledgers."""

from dataclasses import asdict, dataclass
from decimal import Decimal

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.charge import Charge
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.inventory import MouvementStock
from app.models.paiement import Paiement
from app.models.produit import Produit
from app.models.transaction import Transaction


@dataclass
class IntegrityIssue:
    code: str
    severity: str
    entity: str
    entity_id: int | None
    message: str


def _money(value) -> Decimal:
    return Decimal(str(value or 0))


def run_integrity_check(db: Session) -> list[dict]:
    issues: list[IntegrityIssue] = []
    for transaction in db.query(Transaction).all():
        payment_total = sum((_money(payment.montant) for payment in transaction.paiements if payment.est_effectif), Decimal("0"))
        if abs(payment_total - transaction.montant_paye) > Decimal("0.01"):
            issues.append(IntegrityIssue("TRANSACTION_PAYMENT_MISMATCH", "high", "transaction", transaction.id_transaction, "Le total des paiements ne correspond pas à la projection de la transaction."))
        if transaction.date_echeance and transaction.date_echeance < transaction.date_transaction:
            issues.append(IntegrityIssue("INVALID_DUE_DATE", "medium", "transaction", transaction.id_transaction, "La date d'échéance est antérieure à la date de transaction."))
        for payment in transaction.paiements:
            if payment.date_paiement < transaction.date_transaction:
                issues.append(IntegrityIssue("INVALID_PAYMENT_DATE", "medium", "paiement", payment.id_paiement, "La date du paiement est antérieure à la date de la transaction."))

            active_cash_count = db.query(Caisse.id_mouvement).filter(
                Caisse.id_paiement == payment.id_paiement,
                Caisse.statut == "active",
            ).count()
            expected_cash_count = 1 if payment.est_effectif else 0
            if active_cash_count != expected_cash_count:
                issues.append(IntegrityIssue(
                    "PAYMENT_MOVEMENT_MISMATCH",
                    "high",
                    "paiement",
                    payment.id_paiement,
                    "Le nombre de mouvements de caisse actifs ne correspond pas à l'efficacité du paiement.",
                ))

    duplicate_lcs = db.query(Paiement.id_lc, func.count(Paiement.id_paiement)).filter(Paiement.id_lc.isnot(None), Paiement.statut != "annule").group_by(Paiement.id_lc).having(func.count(Paiement.id_paiement) > 1).all()
    for id_lc, _ in duplicate_lcs:
        issues.append(IntegrityIssue("LC_REUSED", "high", "lettre_credit", id_lc, "Une lettre de crédit active est liée à plusieurs paiements."))

    for movement in db.query(Caisse).filter(Caisse.statut == "active").all():
        if movement.id_transaction is None and movement.id_charge is None and movement.id_paiement is None:
            issues.append(IntegrityIssue("ORPHAN_CASH_MOVEMENT", "high", "caisse", movement.id_mouvement, "Mouvement de caisse sans source."))

    cash_balance = db.query(
        func.coalesce(
            func.sum(
                case(
                    (Caisse.type_mouvement == "ENTREE", Caisse.montant),
                    else_=-Caisse.montant,
                )
            ),
            0,
        )
    ).filter(Caisse.statut == "active").scalar()
    latest_cash_snapshot = db.query(CaisseSoldeHistorique).order_by(
        CaisseSoldeHistorique.date_snapshot.desc(),
        CaisseSoldeHistorique.id_historique.desc(),
    ).first()
    if latest_cash_snapshot and abs(_money(latest_cash_snapshot.solde) - _money(cash_balance)) > Decimal("0.01"):
        issues.append(IntegrityIssue(
            "CASH_BALANCE_SNAPSHOT_MISMATCH",
            "high",
            "caisse_solde_historique",
            latest_cash_snapshot.id_historique,
            "Le dernier snapshot de caisse ne correspond pas aux mouvements actifs.",
        ))

    for movement in db.query(MouvementBancaire).filter(MouvementBancaire.statut == "active").all():
        if not db.query(CompteBancaire.id_compte).filter(CompteBancaire.id_compte == movement.id_compte).first():
            issues.append(IntegrityIssue("ORPHAN_BANK_MOVEMENT", "high", "mouvement_bancaire", movement.id_mouvement, "Mouvement bancaire sans compte."))

    for account in db.query(CompteBancaire).all():
        calculated_balance = db.query(
            func.coalesce(
                func.sum(
                    case(
                        (MouvementBancaire.type_mouvement == "ENTREE", MouvementBancaire.montant),
                        else_=-MouvementBancaire.montant,
                    )
                ),
                0,
            )
        ).filter(
            MouvementBancaire.id_compte == account.id_compte,
            MouvementBancaire.statut == "active",
        ).scalar()
        if abs(_money(account.solde_actuel) - _money(calculated_balance)) > Decimal("0.01"):
            issues.append(IntegrityIssue(
                "BANK_BALANCE_MISMATCH",
                "high",
                "compte_bancaire",
                account.id_compte,
                "Le solde bancaire stocké ne correspond pas à la somme des mouvements actifs.",
            ))

    for charge in db.query(Charge).filter(Charge.statut == "active").all():
        cash_count = db.query(Caisse.id_mouvement).filter(Caisse.id_charge == charge.id_charge, Caisse.statut == "active").count()
        bank_count = db.query(MouvementBancaire.id_mouvement).filter(MouvementBancaire.id_charge == charge.id_charge, MouvementBancaire.statut == "active").count()
        if (cash_count + bank_count) != 1:
            issues.append(IntegrityIssue("CHARGE_MOVEMENT_MISMATCH", "high", "charge", charge.id_charge, "Une charge active doit avoir exactement un mouvement financier actif."))

    for movement in db.query(MouvementStock).all():
        if not db.query(Produit.id_produit).filter(Produit.id_produit == movement.id_produit).first():
            issues.append(IntegrityIssue("ORPHAN_STOCK_MOVEMENT", "high", "mouvement_stock", movement.id_mouvement_stock, "Mouvement de stock sans produit."))

    duplicate_stock_sources = db.query(
        MouvementStock.source_type,
        MouvementStock.source_id,
        MouvementStock.type_mouvement,
        MouvementStock.id_produit,
        func.count(MouvementStock.id_mouvement_stock),
    ).filter(
        MouvementStock.id_mouvement_inverse.is_(None),
        MouvementStock.source_id.isnot(None),
    ).group_by(
        MouvementStock.source_type,
        MouvementStock.source_id,
        MouvementStock.type_mouvement,
        MouvementStock.id_produit,
    ).having(func.count(MouvementStock.id_mouvement_stock) > 1).all()
    for source_type, source_id, movement_type, product_id, _ in duplicate_stock_sources:
        issues.append(IntegrityIssue(
            "DUPLICATE_STOCK_SOURCE",
            "high",
            "mouvement_stock",
            source_id,
            f"Plusieurs mouvements de stock actifs existent pour {source_type}/{movement_type}/{product_id}.",
        ))

    for product in db.query(Produit).filter(Produit.type_produit != "service").all():
        quantity = _money(db.query(func.sum(MouvementStock.quantite_delta)).filter(MouvementStock.id_produit == product.id_produit).scalar())
        if quantity < 0:
            issues.append(IntegrityIssue("NEGATIVE_STOCK", "high", "produit", product.id_produit, f"Le stock calculé est négatif ({quantity})."))

    return [asdict(issue) for issue in issues]
