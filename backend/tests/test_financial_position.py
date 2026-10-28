"""Dated cross-method debt and ledger regression scenarios."""
from datetime import date, datetime
from decimal import Decimal

import pytest

from app.models.caisse import Caisse
from app.models.caisse_solde_historique import CaisseSoldeHistorique
from app.models.client import Client
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.services.financial import bank_ledgers_as_of, cash_ledger_as_of, contact_balances, financial_position_as_of


@pytest.fixture
def balances(db_session, test_produit):
    customer = Client(nom_client="Balance customer")
    supplier = Fournisseur(nom_fournisseur="Balance supplier")
    account = CompteBancaire(nom_banque="Balance bank", numero_compte="BAL-001", solde_actuel=5400)
    db_session.add_all([customer, supplier, account])
    db_session.flush()
    sale = Transaction(id_client=customer.id_client, id_produit=test_produit.id_produit,
        date_transaction=date(2026, 1, 31), quantite=1, prix_unitaire=1000, montant_total=1000)
    purchase = Transaction(id_fournisseur=supplier.id_fournisseur, id_produit=test_produit.id_produit,
        date_transaction=date(2026, 1, 31), quantite=1, prix_unitaire=500, montant_total=500)
    cancelled = Transaction(id_client=customer.id_client, id_produit=test_produit.id_produit,
        date_transaction=date(2026, 1, 31), quantite=1, prix_unitaire=900, montant_total=900, est_actif=False)
    db_session.add_all([sale, purchase, cancelled])
    db_session.flush()
    def payment(tx, amount, day, kind="cash", **extra):
        row = Paiement(id_transaction=tx.id_transaction, montant=amount,
            date_paiement=day, type_paiement=kind, **extra)
        db_session.add(row)
        db_session.flush()
        return row
    cash = payment(sale, 100, date(2026, 1, 31))
    bank = payment(sale, 600, date(2026, 2, 2), "virement", id_compte=account.id_compte)
    cheque = payment(sale, 100, date(2026, 1, 31), "cheque", statut_cheque="encaisse",
        date_encaissement_effective=date(2026, 2, 3))
    paid_supplier = payment(purchase, 200, date(2026, 2, 2), "virement", id_compte=account.id_compte)
    invalid = [payment(sale, 50, date(2026, 1, 31), statut=status)
               for status in ("annule", "rejete", "en_attente")]
    invalid += [payment(sale, 50, date(2026, 1, 31), "cheque", statut_cheque="a_encaisser"),
                payment(cancelled, 50, date(2026, 1, 31))]
    for entry in [cash, cheque, *invalid]:
        db_session.add(Caisse(id_paiement=entry.id_paiement, montant=entry.montant,
            type_mouvement="ENTREE", date_mouvement=datetime.combine(entry.date_paiement, datetime.min.time())))
    db_session.add(CaisseSoldeHistorique(date_snapshot=datetime(2026, 1, 31), solde=9999))
    db_session.add(MouvementBancaire(id_compte=account.id_compte, montant=5000,
        type_mouvement="ENTREE", source="initial", date_mouvement=datetime(2026, 1, 1)))
    for entry, direction in [(bank, "ENTREE"), (paid_supplier, "SORTIE"),
                             *[(entry, "ENTREE") for entry in invalid]]:
        db_session.add(MouvementBancaire(id_compte=account.id_compte, montant=entry.montant,
            id_paiement=entry.id_paiement, type_mouvement=direction, source="virement",
            date_mouvement=datetime.combine(entry.date_paiement, datetime.min.time())))
    db_session.add(MouvementBancaire(id_compte=account.id_compte, montant=800,
        type_mouvement="ENTREE", source="autre", statut="annule", date_mouvement=datetime(2026, 1, 1)))
    db_session.add(MouvementBancaire(id_compte=account.id_compte, montant=700,
        type_mouvement="ENTREE", source="autre", date_mouvement=datetime(2026, 3, 1)))
    db_session.commit()
    return customer, supplier, account


@pytest.mark.parametrize("cutoff,receivable,payable,cash,bank", [
    (date(2025, 12, 31), 0, 0, 0, 0),
    (date(2026, 1, 31), 900, 500, 100, 5000),
    (date(2026, 2, 2), 300, 300, 100, 5400),
    (date(2026, 2, 3), 200, 300, 200, 5400),
])
def test_cutoffs_invalid_payments_and_opening_once(db_session, balances, cutoff, receivable, payable, cash, bank):
    customer, supplier, account = balances
    assert financial_position_as_of(db_session, cutoff) == {"receivables": Decimal(receivable), "payables": Decimal(payable)}
    assert cash_ledger_as_of(db_session, cutoff)["balance"] == cash
    assert bank_ledgers_as_of(db_session, cutoff)[account.id_compte] == bank
    assert contact_balances(db_session, direction="receivable", contact_ids=[customer.id_client], as_of=cutoff)[customer.id_client] == receivable
    assert contact_balances(db_session, direction="payable", contact_ids=[supplier.id_fournisseur], as_of=cutoff)[supplier.id_fournisseur] == payable


def test_public_endpoints_reconcile_current_and_month_end(client, balances, monkeypatch):
    _, _, account = balances
    monkeypatch.setattr("app.routers.reports.business_date", lambda: date(2026, 2, 3))
    cutoff = {"date_as_of": "2026-02-03"}
    response = client.get("/api/v1/caisse/solde/complet", params=cutoff)
    assert response.status_code == 200, response.text
    data = response.json()
    assert Decimal(data["creances_clients"]) == 200
    assert Decimal(data["dettes_fournisseurs"]) == 300
    assert Decimal(data["solde_caisse"]) == 200
    assert data["date_soldes"] == "2026-02-03"
    response = client.get("/api/v1/caisse/solde", params=cutoff)
    assert response.status_code == 200, response.text
    assert Decimal(response.json()["solde_actuel"]) == 200
    response = client.get("/api/v1/comptes-bancaires", params=cutoff)
    assert response.status_code == 200, response.text
    assert Decimal(response.json()[0]["solde_actuel"]) == 5400
    assert response.json()[0]["date_soldes"] == "2026-02-03"
    response = client.get(f"/api/v1/comptes-bancaires/{account.id_compte}/solde-calcule", params=cutoff)
    assert response.status_code == 200, response.text
    assert Decimal(response.json()["solde_calcule"]) == 5400
    response = client.get("/api/v1/reports/monthly", params={"month": "2026-01"})
    assert response.status_code == 200, response.text
    data = response.json()
    for field, value in {"creances": 900, "dettes": 500, "solde_caisse_historique": 100,
        "creances_actuelles": 200, "dettes_actuelles": 300, "solde_caisse": 200,
        "caisse_entrees": 100, "caisse_sorties": 0, "banques_entrees": 5000, "banques_sorties": 0}.items():
        assert Decimal(data[field]) == value, field
    assert Decimal(data["soldes_bancaires_historiques"][0]["solde"]) == 5000
    assert Decimal(data["soldes_bancaires"][0]["solde"]) == 5400
    assert data["date_soldes_historiques"] == "2026-01-31"
    assert data["date_soldes_actuels"] == "2026-02-03"


@pytest.mark.parametrize("method", ["cash", "virement", "carte", "compensation", "lc", "autre", "cheque"])
def test_all_valid_methods_reduce_customer_and_supplier_debt(db_session, test_produit, method):
    customer = Client(nom_client="All methods")
    supplier = Fournisseur(nom_fournisseur="All methods")
    db_session.add_all([customer, supplier])
    db_session.flush()
    for key, value in [("id_client", customer.id_client), ("id_fournisseur", supplier.id_fournisseur)]:
        tx = Transaction(**{key: value}, id_produit=test_produit.id_produit,
            date_transaction=date(2026, 1, 1), quantite=1, prix_unitaire=100, montant_total=100)
        db_session.add(tx)
        db_session.flush()
        db_session.add(Paiement(id_transaction=tx.id_transaction, montant=25,
            type_paiement=method, statut="valide", date_paiement=date(2026, 1, 2),
            statut_cheque="encaisse" if method == "cheque" else None))
    db_session.commit()
    assert financial_position_as_of(db_session, date(2026, 1, 31)) == {"receivables": Decimal(75), "payables": Decimal(75)}


def test_cancelled_expenses_and_lc_cessions_do_not_change_cash(client, db_session, balances):
    from app.models.charge import Charge
    from app.models.cession_lc import CessionLC
    from app.models.lettre_credit import LettreDeCredit

    customer, supplier, account = balances
    cutoff = date(2026, 2, 3)
    for bank in (False, True):
        for status, amount in (("active", 25), ("annule", 50)):
            charge = Charge(libelle="Expense", montant=amount, date_charge=cutoff,
                categorie="divers", statut=status, id_compte=account.id_compte if bank else None)
            db_session.add(charge)
            db_session.flush()
            fields = dict(id_charge=charge.id_charge, montant=amount,
                type_mouvement="SORTIE", statut="active", date_mouvement=datetime(2026, 2, 3))
            movement = MouvementBancaire(id_compte=account.id_compte, source="charge", **fields) if bank else Caisse(**fields)
            db_session.add(movement)
    lc = LettreDeCredit(numero_reference="BAL-LC", montant=400, id_client=customer.id_client,
        date_emission=cutoff, date_disponibilite=cutoff)
    db_session.add(lc)
    db_session.flush()
    cession = CessionLC(id_lc=lc.id_lc, type_cedant="client", id_cedant_client=customer.id_client,
        type_cessionnaire="fournisseur", id_cessionnaire_fournisseur=supplier.id_fournisseur, date_cession=cutoff)
    db_session.add(cession)
    db_session.flush()
    db_session.add(Caisse(id_cession=cession.id_cession, montant=400, type_mouvement="SORTIE",
        date_mouvement=datetime(2026, 2, 3)))
    db_session.commit()
    assert cash_ledger_as_of(db_session, cutoff)["balance"] == 175
    assert bank_ledgers_as_of(db_session, cutoff)[account.id_compte] == 5375
    response = client.get('/api/v1/caisse/mouvements', params={'date_fin': cutoff.isoformat()})
    assert response.status_code == 200, response.text
    rows = response.json()
    assert len(rows) == 3  # Two effective client payments and one valid cash expense.
    assert all(row['id_cession'] is None for row in rows)
    assert sum(Decimal(row['montant']) * (1 if row['type_mouvement'] == 'ENTREE' else -1) for row in rows) == 175


@pytest.mark.parametrize("opening", ["1234.56", "-1234.56"])
def test_account_opening_record_counts_once_through_api(client, opening):
    response = client.post("/api/v1/comptes-bancaires", json={
        "nom_banque": "Opening test", "numero_compte": "OPENING-1", "solde_initial": opening})
    assert response.status_code == 201, response.text
    accounts = client.get("/api/v1/comptes-bancaires")
    assert accounts.status_code == 200, accounts.text
    assert Decimal(accounts.json()[0]["solde_actuel"]) == Decimal(opening)
    account_id = response.json()["id_compte"]
    movements = client.get(f"/api/v1/comptes-bancaires/{account_id}/mouvements")
    assert movements.status_code == 200, movements.text
    assert len(movements.json()) == 1
    assert movements.json()[0]["source"] == "initial"


def test_bank_settlements_through_payment_api_reduce_debt_without_cash(client, db_session, test_produit):
    from app.utils.business_date import business_date

    today = business_date()
    account = client.post("/api/v1/comptes-bancaires", json={
        "nom_banque": "Settlement bank", "numero_compte": "SETTLE-001", "solde_initial": "2000"})
    assert account.status_code == 201, account.text
    account_id = account.json()["id_compte"]
    customer = Client(nom_client="Bank customer")
    supplier = Fournisseur(nom_fournisseur="Bank supplier", mode_reglement_prefere="banque")
    db_session.add_all([customer, supplier])
    db_session.flush()
    sale = Transaction(id_client=customer.id_client, id_produit=test_produit.id_produit,
        date_transaction=today, quantite=1, prix_unitaire=1000, montant_total=1000)
    purchase = Transaction(id_fournisseur=supplier.id_fournisseur, id_produit=test_produit.id_produit,
        date_transaction=today, quantite=1, prix_unitaire=500, montant_total=500)
    db_session.add_all([sale, purchase])
    db_session.commit()
    for tx, amount in [(sale, 600), (purchase, 200)]:
        response = client.post("/api/v1/paiements", json={
            "id_transaction": tx.id_transaction, "date_paiement": today.isoformat(),
            "montant": amount, "type_paiement": "virement", "id_compte": account_id})
        assert response.status_code == 201, response.text
    response = client.get("/api/v1/caisse/solde/complet")
    assert response.status_code == 200, response.text
    data = response.json()
    assert Decimal(data["creances_clients"]) == 400
    assert Decimal(data["dettes_fournisseurs"]) == 300
    assert Decimal(data["solde_caisse"]) == 0
    accounts = client.get("/api/v1/comptes-bancaires")
    assert accounts.status_code == 200, accounts.text
    assert Decimal(accounts.json()[0]["solde_actuel"]) == 2400
