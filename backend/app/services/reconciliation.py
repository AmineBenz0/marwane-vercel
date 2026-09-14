"""Read-only integrity checks for financial and inventory ledgers."""

from collections import defaultdict
from dataclasses import asdict, dataclass
from decimal import Decimal

from sqlalchemy import case, func
from sqlalchemy.orm import Session, selectinload

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
    transactions = db.query(Transaction).options(selectinload(Transaction.paiements)).all()
    transaction_by_id = {transaction.id_transaction: transaction for transaction in transactions}
    payments = db.query(Paiement).all()
    payment_by_id = {payment.id_paiement: payment for payment in payments}
    charges = db.query(Charge).all()
    charge_by_id = {charge.id_charge: charge for charge in charges}
    products = db.query(Produit).all()
    product_by_id = {product.id_produit: product for product in products}
    accounts = db.query(CompteBancaire).all()
    account_by_id = {account.id_compte: account for account in accounts}

    active_cash_movements = db.query(Caisse).filter(Caisse.statut == "active").all()
    active_bank_movements = db.query(MouvementBancaire).filter(
        MouvementBancaire.statut == "active"
    ).all()
    cash_by_payment: dict[int, list[Caisse]] = defaultdict(list)
    bank_by_payment: dict[int, list[MouvementBancaire]] = defaultdict(list)
    cash_by_charge: dict[int, list[Caisse]] = defaultdict(list)
    bank_by_charge: dict[int, list[MouvementBancaire]] = defaultdict(list)

    for movement in active_cash_movements:
        if movement.id_paiement is not None:
            cash_by_payment[movement.id_paiement].append(movement)
        if movement.id_charge is not None:
            cash_by_charge[movement.id_charge].append(movement)
        if movement.id_transaction is not None and movement.id_transaction not in transaction_by_id:
            issues.append(IntegrityIssue(
                "ORPHAN_CASH_MOVEMENT",
                "high",
                "caisse",
                movement.id_mouvement,
                "Mouvement de caisse lié à une transaction inexistante.",
            ))
        if movement.id_paiement is not None and movement.id_paiement not in payment_by_id:
            issues.append(IntegrityIssue(
                "ORPHAN_CASH_MOVEMENT",
                "high",
                "caisse",
                movement.id_mouvement,
                "Mouvement de caisse lié à un paiement inexistant.",
            ))
        elif movement.id_paiement is not None and movement.id_transaction is not None:
            payment = payment_by_id[movement.id_paiement]
            if payment.id_transaction != movement.id_transaction:
                issues.append(IntegrityIssue(
                    "PAYMENT_TRANSACTION_LINK_MISMATCH",
                    "high",
                    "caisse",
                    movement.id_mouvement,
                    "Le mouvement de caisse ne référence pas la transaction du paiement.",
                ))
        if movement.id_transaction is None and movement.id_charge is None and movement.id_paiement is None:
            issues.append(IntegrityIssue("ORPHAN_CASH_MOVEMENT", "high", "caisse", movement.id_mouvement, "Mouvement de caisse sans source."))

    for movement in active_bank_movements:
        if movement.id_paiement is not None:
            bank_by_payment[movement.id_paiement].append(movement)
        if movement.id_charge is not None:
            bank_by_charge[movement.id_charge].append(movement)
        if movement.id_compte not in account_by_id:
            issues.append(IntegrityIssue("ORPHAN_BANK_MOVEMENT", "high", "mouvement_bancaire", movement.id_mouvement, "Mouvement bancaire sans compte."))
        if movement.id_paiement is not None and movement.id_paiement not in payment_by_id:
            issues.append(IntegrityIssue("ORPHAN_BANK_MOVEMENT", "high", "mouvement_bancaire", movement.id_mouvement, "Mouvement bancaire lié à un paiement inexistant."))
        if movement.id_charge is not None and (
            movement.id_charge not in charge_by_id
            or charge_by_id[movement.id_charge].statut != "active"
        ):
            issues.append(IntegrityIssue("ORPHAN_BANK_MOVEMENT", "high", "mouvement_bancaire", movement.id_mouvement, "Mouvement bancaire lié à une charge inexistante ou annulée."))

    for movement in active_cash_movements:
        if movement.id_charge is not None and (
            movement.id_charge not in charge_by_id
            or charge_by_id[movement.id_charge].statut != "active"
        ):
            issues.append(IntegrityIssue("ORPHAN_CASH_MOVEMENT", "high", "caisse", movement.id_mouvement, "Mouvement de caisse lié à une charge inexistante ou annulée."))

    for transaction in transactions:
        payment_total = sum(
            (_money(item.montant) for item in transaction.paiements if item.est_effectif),
            Decimal("0"),
        )
        if abs(payment_total - transaction.montant_paye) > Decimal("0.01"):
            issues.append(IntegrityIssue("TRANSACTION_PAYMENT_MISMATCH", "high", "transaction", transaction.id_transaction, "Le total des paiements ne correspond pas à la projection de la transaction."))
        if transaction.date_echeance and transaction.date_echeance < transaction.date_transaction:
            issues.append(IntegrityIssue("INVALID_DUE_DATE", "medium", "transaction", transaction.id_transaction, "La date d'échéance est antérieure à la date de transaction."))

    for payment in payments:
        transaction = transaction_by_id.get(payment.id_transaction)
        if transaction is None:
            issues.append(IntegrityIssue("ORPHAN_PAYMENT", "high", "paiement", payment.id_paiement, "Paiement sans transaction."))
            continue

        if payment.date_paiement < transaction.date_transaction:
            issues.append(IntegrityIssue("INVALID_PAYMENT_DATE", "medium", "paiement", payment.id_paiement, "La date du paiement est antérieure à la date de la transaction."))

        linked_movements = cash_by_payment.get(payment.id_paiement, []) + bank_by_payment.get(payment.id_paiement, [])
        expected_movement_count = 1 if payment.est_effectif else 0
        if len(linked_movements) != expected_movement_count:
            issues.append(IntegrityIssue(
                "PAYMENT_MOVEMENT_MISMATCH",
                "high",
                "paiement",
                payment.id_paiement,
                "Le nombre de mouvements financiers actifs ne correspond pas à l'efficacité du paiement.",
            ))
        if len(linked_movements) == 1:
            movement = linked_movements[0]
            if abs(_money(movement.montant) - _money(payment.montant)) > Decimal("0.01"):
                issues.append(IntegrityIssue(
                    "PAYMENT_MOVEMENT_AMOUNT_MISMATCH",
                    "high",
                    "paiement",
                    payment.id_paiement,
                    "Le montant du mouvement financier ne correspond pas au paiement.",
                ))
            expected_direction = "ENTREE" if transaction.id_client is not None else "SORTIE"
            if movement.type_mouvement != expected_direction:
                issues.append(IntegrityIssue(
                    "PAYMENT_MOVEMENT_DIRECTION_MISMATCH",
                    "high",
                    "paiement",
                    payment.id_paiement,
                    "Le sens du mouvement financier ne correspond pas à la transaction.",
                ))

    for charge in charges:
        if charge.statut != "active":
            continue
        linked_movements = cash_by_charge.get(charge.id_charge, []) + bank_by_charge.get(charge.id_charge, [])
        if len(linked_movements) != 1:
            issues.append(IntegrityIssue("CHARGE_MOVEMENT_MISMATCH", "high", "charge", charge.id_charge, "Une charge active doit avoir exactement un mouvement financier actif."))
        elif abs(_money(linked_movements[0].montant) - _money(charge.montant)) > Decimal("0.01") or linked_movements[0].type_mouvement != "SORTIE":
            issues.append(IntegrityIssue("CHARGE_MOVEMENT_VALUE_MISMATCH", "high", "charge", charge.id_charge, "Le montant ou le sens du mouvement ne correspond pas à la charge."))

    duplicate_lcs = db.query(Paiement.id_lc, func.count(Paiement.id_paiement)).filter(Paiement.id_lc.isnot(None), Paiement.statut != "annule").group_by(Paiement.id_lc).having(func.count(Paiement.id_paiement) > 1).all()
    for id_lc, _ in duplicate_lcs:
        issues.append(IntegrityIssue("LC_REUSED", "high", "lettre_credit", id_lc, "Une lettre de crédit active est liée à plusieurs paiements."))

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

    bank_balances = dict(db.query(
        MouvementBancaire.id_compte,
        func.coalesce(
            func.sum(
                case(
                    (MouvementBancaire.type_mouvement == "ENTREE", MouvementBancaire.montant),
                    else_=-MouvementBancaire.montant,
                )
            ),
            0,
        ),
    ).filter(MouvementBancaire.statut == "active").group_by(MouvementBancaire.id_compte).all())
    for account in accounts:
        calculated_balance = bank_balances.get(account.id_compte, 0)
        if abs(_money(account.solde_actuel) - _money(calculated_balance)) > Decimal("0.01"):
            issues.append(IntegrityIssue(
                "BANK_BALANCE_MISMATCH",
                "high",
                "compte_bancaire",
                account.id_compte,
                "Le solde bancaire stocké ne correspond pas à la somme des mouvements actifs.",
            ))

    for movement in db.query(MouvementStock).all():
        if movement.id_produit not in product_by_id:
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

    for product in products:
        if product.type_produit not in {"matiere_premiere", "produit_fini", "service"}:
            issues.append(IntegrityIssue("INVALID_PRODUCT_TYPE", "high", "produit", product.id_produit, "Le type de produit ne fait pas partie des valeurs autorisées."))
        if not product.pour_clients and not product.pour_fournisseurs:
            issues.append(IntegrityIssue("PRODUCT_ACCESS_FLAGS_EMPTY", "high", "produit", product.id_produit, "Le produit n'est utilisable ni pour les clients ni pour les fournisseurs."))
        elif product.type_produit == "matiere_premiere" and not product.pour_fournisseurs:
            issues.append(IntegrityIssue("PRODUCT_TYPE_FLAG_REVIEW", "low", "produit", product.id_produit, "Une matière première n'est pas activée pour les fournisseurs; vérifier le drapeau historique."))
        elif product.type_produit == "produit_fini" and not product.pour_clients:
            issues.append(IntegrityIssue("PRODUCT_TYPE_FLAG_REVIEW", "low", "produit", product.id_produit, "Un produit fini n'est pas activé pour les clients; vérifier le drapeau historique."))

    for product in (product for product in products if product.type_produit != "service"):
        quantity = _money(db.query(func.sum(MouvementStock.quantite_delta)).filter(MouvementStock.id_produit == product.id_produit).scalar())
        if quantity < 0:
            issues.append(IntegrityIssue("NEGATIVE_STOCK", "high", "produit", product.id_produit, f"Le stock calculé est négatif ({quantity})."))

    return [asdict(issue) for issue in issues]
