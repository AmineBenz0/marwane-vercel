"""One contact's credit must not reduce what the other contacts owe (or are owed)."""
from datetime import date
from decimal import Decimal

import pytest

from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.services.financial import financial_position_as_of, summarize_financial_transactions

DAY = date(2026, 10, 1)


@pytest.fixture
def suppliers(db_session, test_produit):
    def supplier(name):
        row = Fournisseur(nom_fournisseur=name, est_actif=True)
        db_session.add(row)
        db_session.flush()
        return row

    def purchase(who, total, paid=None):
        row = Transaction(
            id_fournisseur=who.id_fournisseur, id_produit=test_produit.id_produit, date_transaction=DAY,
            quantite=1, prix_unitaire=Decimal(total), montant_total=Decimal(total),
        )
        db_session.add(row)
        db_session.flush()
        if paid:
            db_session.add(Paiement(id_transaction=row.id_transaction, date_paiement=DAY,
                                    montant=Decimal(paid), type_paiement="cash", statut="valide"))
        return row

    owed = supplier("ZZ netting owed")          # we owe 765
    purchase(owed, "765")
    credit = supplier("ZZ netting credit")      # paid 720 for 600: 120 credit with this supplier
    purchase(credit, "600", paid="720")
    mixed = supplier("ZZ netting mixed")        # 300 owed and 100 credit with the same supplier: 200 owed
    purchase(mixed, "300")
    purchase(mixed, "400", paid="500")
    db_session.commit()
    return owed, credit, mixed


def test_dated_position_does_not_net_across_suppliers(db_session, suppliers):
    position = financial_position_as_of(db_session, date(2026, 12, 31), include_pending=True)
    assert position["payables"] == Decimal("965.00")          # 765 + 200, not 765 + 200 - 120
    assert position["payables_credits"] == Decimal("120.00")


def test_payables_summary_keeps_credits_apart(db_session, suppliers):
    summary = summarize_financial_transactions(db_session, direction="payable", recherche="ZZ netting")
    assert summary["reste"] == Decimal("965.00")
    assert summary["credit"] == Decimal("120.00")
