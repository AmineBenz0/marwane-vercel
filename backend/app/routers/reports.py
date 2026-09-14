"""Canonical backend monthly reporting."""

from calendar import monthrange
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.caisse import Caisse
from app.models.charge import Charge
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.inventory import MouvementStock
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.schemas.report import BankBalance, MonthlyReport, RankedTotal
from app.services.financial import payment_total_as_of
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/reports", tags=["Reports"])


def _money(value) -> Decimal:
    return Decimal(str(value or 0))


@router.get("/monthly", response_model=MonthlyReport)
def monthly_report(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    try:
        year, month_number = (int(part) for part in month.split("-"))
        date_debut = date(year, month_number, 1)
        date_fin = date(year, month_number, monthrange(year, month_number)[1])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="month doit être au format YYYY-MM") from exc
    transactions = db.query(Transaction).filter(Transaction.est_actif.is_(True), Transaction.date_transaction.between(date_debut, date_fin)).all()
    sales = [row for row in transactions if row.id_client is not None]
    purchases = [row for row in transactions if row.id_fournisseur is not None]
    charge_total = db.query(func.sum(Charge.montant)).filter(Charge.statut == "active", Charge.date_charge.between(date_debut, date_fin)).scalar()
    cash_rows = db.query(Caisse).filter(Caisse.statut == "active", func.date(Caisse.date_mouvement).between(date_debut, date_fin)).all()
    bank_rows = db.query(MouvementBancaire).filter(MouvementBancaire.statut == "active", func.date(MouvementBancaire.date_mouvement).between(date_debut, date_fin)).all()
    # Outstanding balances are point-in-time values at month end. The period
    # filters remain appropriate for activity totals above, but excluding
    # prior transactions would understate receivables and payables.
    historical_transactions = db.query(Transaction).options(
        joinedload(Transaction.paiements),
    ).filter(
        Transaction.est_actif.is_(True),
        Transaction.date_transaction <= date_fin,
    ).all()
    receivables = [row for row in historical_transactions if row.id_client is not None]
    payables = [row for row in historical_transactions if row.id_fournisseur is not None]
    inventory_count, inventory_quantity_delta = db.query(
        func.count(MouvementStock.id_mouvement_stock),
        func.coalesce(func.sum(MouvementStock.quantite_delta), 0),
    ).filter(
        func.date(MouvementStock.date_mouvement).between(date_debut, date_fin)
    ).one()
    cash_balance = db.query(
        func.coalesce(func.sum(
            case(
                (Caisse.type_mouvement == "ENTREE", Caisse.montant),
                else_=-Caisse.montant,
            )
        ), 0)
    ).filter(Caisse.statut == "active").scalar()
    bank_balances = []
    for account in db.query(CompteBancaire).order_by(CompteBancaire.nom_banque.asc()).all():
        balance = db.query(
            func.coalesce(func.sum(
                case(
                    (MouvementBancaire.type_mouvement == "ENTREE", MouvementBancaire.montant),
                    else_=-MouvementBancaire.montant,
                )
            ), 0)
        ).filter(
            MouvementBancaire.id_compte == account.id_compte,
            MouvementBancaire.statut == "active",
        ).scalar()
        bank_balances.append(BankBalance(
            id_compte=account.id_compte,
            nom_banque=account.nom_banque,
            numero_compte=account.numero_compte,
            solde=_money(balance),
        ))

    def ranked(rows, relation, label):
        totals = {}
        labels = {}
        for row in rows:
            key = getattr(row, relation)
            if not key:
                continue
            key_id = getattr(row, f"id_{relation}")
            totals[key_id] = totals.get(key_id, Decimal("0")) + _money(row.montant_total)
            labels[key_id] = getattr(key, label)
        return [RankedTotal(id=key, label=labels[key], total=value) for key, value in sorted(totals.items(), key=lambda item: item[1], reverse=True)[:10]]

    return MonthlyReport(
        month=month,
        date_debut=date_debut,
        date_fin=date_fin,
        ventes=sum((_money(row.montant_total) for row in sales), Decimal("0")),
        achats=sum((_money(row.montant_total) for row in purchases), Decimal("0")),
        charges=_money(charge_total),
        caisse_entrees=sum((_money(row.montant) for row in cash_rows if row.type_mouvement == "ENTREE"), Decimal("0")),
        caisse_sorties=sum((_money(row.montant) for row in cash_rows if row.type_mouvement == "SORTIE"), Decimal("0")),
        solde_caisse=_money(cash_balance),
        banques_entrees=sum((_money(row.montant) for row in bank_rows if row.type_mouvement == "ENTREE"), Decimal("0")),
        banques_sorties=sum((_money(row.montant) for row in bank_rows if row.type_mouvement == "SORTIE"), Decimal("0")),
        soldes_bancaires=bank_balances,
        creances=sum((_money(row.montant_total) - payment_total_as_of(row, date_fin) for row in receivables), Decimal("0")),
        dettes=sum((_money(row.montant_total) - payment_total_as_of(row, date_fin) for row in payables), Decimal("0")),
        top_clients=ranked(sales, "client", "nom_client"),
        top_fournisseurs=ranked(purchases, "fournisseur", "nom_fournisseur"),
        top_produits=ranked(transactions, "produit", "nom_produit"),
        inventory_movements=int(inventory_count or 0),
        inventory_quantity_delta=_money(inventory_quantity_delta),
    )
