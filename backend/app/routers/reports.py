"""Canonical backend monthly reporting."""

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.business_date import business_date
from app.models.charge import Charge
from app.models.compte_bancaire import CompteBancaire
from app.models.inventory import MouvementStock
from app.models.transaction import Transaction
from app.models.paiement import Paiement
from app.models.client import Client
from app.models.produit import Produit
from app.services.reporting_commercial import period_commercial_adjustments, sum_period_adjustments
from app.models.user import Utilisateur
from app.schemas.report import BankBalance, MonthlyReport, RankedTotal
from app.services.financial import (
    bank_activity_as_of,
    bank_ledgers_as_of,
    cash_ledger_as_of,
    financial_position_as_of,
)
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
    current_date = business_date()
    transactions = db.query(Transaction).filter(Transaction.est_actif.is_(True), Transaction.date_transaction.between(date_debut, date_fin)).all()
    sales = [row for row in transactions if row.id_client is not None]
    purchases = [row for row in transactions if row.id_fournisseur is not None]
    # An avoir belongs to its own accounting month, even if the original
    # sale was in an earlier period. This query is independent from payment
    # JOINs so neither 2 payments nor 2 credits can multiply each other.
    adjustments = period_commercial_adjustments(db, date_debut, date_fin)
    credit_total = sum_period_adjustments(adjustments)
    gross_sales = sum((_money(row.montant_total) for row in sales), Decimal("0.00"))
    refunds = db.query(func.sum(Paiement.montant)).join(
        Transaction, Transaction.id_transaction == Paiement.id_transaction,
    ).filter(
        Transaction.est_actif.is_(True), Transaction.id_client.isnot(None),
        Paiement.nature == "remboursement", Paiement.statut == "valide",
        Paiement.date_paiement.between(date_debut, date_fin),
    ).scalar()
    charge_total = db.query(func.sum(Charge.montant)).filter(Charge.statut == "active", Charge.date_charge.between(date_debut, date_fin)).scalar()
    previous_day = date_debut - timedelta(days=1)
    cash_end = cash_ledger_as_of(db, date_fin)
    cash_start = cash_ledger_as_of(db, previous_day)
    cash_current = cash_ledger_as_of(db, current_date)
    bank_end = bank_ledgers_as_of(db, date_fin)
    bank_current = bank_ledgers_as_of(db, current_date)
    bank_activity_end = bank_activity_as_of(db, date_fin)
    bank_activity_start = bank_activity_as_of(db, previous_day)
    historical_position = financial_position_as_of(db, date_fin)
    current_position = financial_position_as_of(db, current_date)
    inventory_count, inventory_quantity_delta = db.query(
        func.count(MouvementStock.id_mouvement_stock),
        func.coalesce(func.sum(MouvementStock.quantite_delta), 0),
    ).filter(
        func.date(MouvementStock.date_mouvement).between(date_debut, date_fin)
    ).one()
    bank_balances = []
    historical_bank_balances = []
    for account in db.query(CompteBancaire).order_by(CompteBancaire.nom_banque.asc()).all():
        bank_balances.append(BankBalance(
            id_compte=account.id_compte,
            nom_banque=account.nom_banque,
            numero_compte=account.numero_compte,
            solde=bank_current.get(account.id_compte, Decimal("0")),
        ))
        historical_bank_balances.append(BankBalance(
            id_compte=account.id_compte,
            nom_banque=account.nom_banque,
            numero_compte=account.numero_compte,
            solde=bank_end.get(account.id_compte, Decimal("0")),
        ))

    def ranked(rows, relation, label, *, adjust=False):
        totals = {}
        labels = {}
        for row in rows:
            key = getattr(row, relation)
            if not key:
                continue
            key_id = getattr(row, f"id_{relation}")
            totals[key_id] = totals.get(key_id, Decimal("0.00")) + _money(row.montant_total)
            labels[key_id] = getattr(key, label)
        if adjust:
            index = 0 if relation == "client" else 1
            for customer, product, amount in adjustments:
                key_id = (customer, product)[index]
                totals[key_id] = totals.get(key_id, Decimal("0.00")) - amount
            # A credit may be issued for a sale from an earlier month.
            # Resolve its original contact/product name instead of dropping it.
            absent = set(totals) - set(labels)
            if absent:
                model = Client if relation == "client" else Produit
                key = Client.id_client if relation == "client" else Produit.id_produit
                for item in db.query(model).filter(key.in_(absent)).all():
                    labels[getattr(item, key.key)] = getattr(item, label)
        return [
            RankedTotal(id=key, label=labels[key], total=value)
            for key, value in sorted(totals.items(), key=lambda item: (-item[1], item[0]))[:10]
            if key in labels
        ]

    return MonthlyReport(
        month=month,
        date_debut=date_debut,
        date_fin=date_fin,
        date_soldes_actuels=current_date,
        date_soldes_historiques=date_fin,
        creances_actuelles=current_position["receivables"],
        dettes_actuelles=current_position["payables"],
        ventes=gross_sales,
        avoirs_commerciaux=credit_total,
        ventes_nettes=gross_sales - credit_total,
        remboursements_clients=_money(refunds),
        achats=sum((_money(row.montant_total) for row in purchases), Decimal("0")),
        charges=_money(charge_total),
        caisse_entrees=cash_end["inflows"] - cash_start["inflows"],
        caisse_sorties=cash_end["outflows"] - cash_start["outflows"],
        solde_caisse=cash_current["balance"],
        solde_caisse_historique=cash_end["balance"],
        banques_entrees=bank_activity_end["inflows"] - bank_activity_start["inflows"],
        banques_sorties=bank_activity_end["outflows"] - bank_activity_start["outflows"],
        soldes_bancaires=bank_balances,
        soldes_bancaires_historiques=historical_bank_balances,
        creances=historical_position["receivables"],
        dettes=historical_position["payables"],
        top_clients=ranked(sales, "client", "nom_client", adjust=True),
        top_fournisseurs=ranked(purchases, "fournisseur", "nom_fournisseur"),
        top_produits=ranked(transactions, "produit", "nom_produit", adjust=True),
        inventory_movements=int(inventory_count or 0),
        inventory_quantity_delta=_money(inventory_quantity_delta),
    )
