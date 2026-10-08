"""Bulk contact projections must obey the canonical financial ledger rules."""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.services.financial import contact_balances


@pytest.fixture(params=[("clients", Client, "id_client", "nom_client", "receivable"),
                        ("fournisseurs", Fournisseur, "id_fournisseur", "nom_fournisseur", "payable")])
def ledger(request, db_session, test_produit):
    endpoint, model, id_field, name_field, direction = request.param
    contacts = {name: model(**{name_field: f"Balance {name}", "est_actif": name != "inactive"})
                for name in ("partial", "settled", "empty", "advance", "inactive")}
    db_session.add_all(contacts.values())
    db_session.flush()

    def transaction(contact, total, active=True):
        row = Transaction(
            **{id_field: getattr(contacts[contact], id_field)},
            id_produit=test_produit.id_produit, date_transaction=date(2026, 10, 1),
            quantite=1, prix_unitaire=Decimal(total), montant_total=Decimal(total), est_actif=active,
        )
        db_session.add(row)
        db_session.flush()
        return row

    def payment(row, amount, kind="cash", status="valide", cheque=None):
        db_session.add(Paiement(
            id_transaction=row.id_transaction, date_paiement=date(2026, 10, 2),
            montant=Decimal(amount), type_paiement=kind, statut=status, statut_cheque=cheque,
        ))

    partial = transaction("partial", "100")
    payment(partial, "15")
    payment(partial, "7", "virement")
    payment(partial, "10", "cheque", cheque="encaisse")
    for status in ("annule", "rejete", "en_attente"):
        payment(partial, "90", status=status)
        payment(partial, "90", "cheque", status=status, cheque="encaisse")
    for cheque in (None, "emis", "a_encaisser", "rejete", "annule"):
        payment(partial, "90", "cheque", cheque=cheque)
    second = transaction("partial", "50")
    payment(second, "10")
    payment(second, "5")
    cancelled = transaction("partial", "999", active=False)
    payment(cancelled, "400")
    payment(transaction("settled", "100"), "100")
    payment(transaction("advance", "100"), "140")
    transaction("advance", "25")  # Net the advance across all active transactions.
    transaction("inactive", "12")

    # Identical IDs in the other contact table must never leak into this direction.
    other_model, other_id, other_name = (
        (Fournisseur, "id_fournisseur", "nom_fournisseur") if model is Client
        else (Client, "id_client", "nom_client")
    )
    other = other_model(**{other_id: getattr(contacts["partial"], id_field), other_name: "Other direction"})
    db_session.add(other)
    db_session.flush()
    db_session.add(Transaction(
        **{other_id: getattr(other, other_id)}, id_produit=test_produit.id_produit,
        date_transaction=date(2026, 10, 1), quantite=1, prix_unitaire=500, montant_total=500,
    ))
    db_session.commit()
    ids = {name: getattr(row, id_field) for name, row in contacts.items()}
    return endpoint, id_field, direction, ids


def test_bulk_balances_and_list_contract(client, db_session, ledger):
    endpoint, id_field, direction, ids = ledger
    expected = {ids["partial"]: Decimal("103"), ids["settled"]: Decimal("0"),
                ids["empty"]: Decimal("0"), ids["advance"]: Decimal("-15"), ids["inactive"]: Decimal("12")}
    assert contact_balances(db_session, direction=direction, contact_ids=list(ids.values())) == expected

    response = client.get(f"/api/v1/{endpoint}", params={"include_balance": True})
    assert response.status_code == 200, response.text
    assert {row[id_field]: Decimal(str(row["outstanding_balance"])) for row in response.json()} == expected
    default = client.get(f"/api/v1/{endpoint}")
    assert default.status_code == 200
    assert all("outstanding_balance" not in row for row in default.json())
    # Balance is a list projection, not a creation/edit/profile field.
    detail = client.get(f"/api/v1/{endpoint}/{ids['partial']}")
    assert detail.status_code == 200
    assert "outstanding_balance" not in detail.json()


def test_balance_opt_in_preserves_filters_and_pagination(client, ledger):
    endpoint, id_field, _, ids = ledger
    filters = {"est_actif": True, "recherche": "  BALANCE  ", "skip": 1, "limit": 2}
    default = client.get(f"/api/v1/{endpoint}", params=filters).json()
    enriched = client.get(f"/api/v1/{endpoint}", params={**filters, "include_balance": True}).json()
    assert len(enriched) == 2
    assert [row[id_field] for row in enriched] == [row[id_field] for row in default]
    assert all(row["est_actif"] for row in enriched)
    assert [{k: v for k, v in row.items() if k != "outstanding_balance"} for row in enriched] == default
    partial = client.get(f"/api/v1/{endpoint}", params={"recherche": " partial ", "include_balance": True}).json()
    assert len(partial) == 1
    assert partial[0][id_field] == ids["partial"]
    assert Decimal(str(partial[0]["outstanding_balance"])) == Decimal("103")
    inactive = client.get(f"/api/v1/{endpoint}", params={"est_actif": False, "include_balance": True}).json()
    assert [row[id_field] for row in inactive] == [ids["inactive"]]


def test_bulk_query_count_is_constant(client, db_session, ledger):
    endpoint, _, direction, ids = ledger
    statements = []

    def record(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        assert client.get(f"/api/v1/{endpoint}", params={"include_balance": True}).status_code == 200
        assert len(statements) == 2  # One contact page + one grouped balance query, regardless of page size.
        statements.clear()
        assert client.get(f"/api/v1/{endpoint}").status_code == 200
        assert len(statements) == 1
        statements.clear()
        assert client.get(f"/api/v1/{endpoint}", params={"recherche": "no match", "include_balance": True}).json() == []
        assert len(statements) == 1
        statements.clear()
        assert contact_balances(db_session, direction=direction, contact_ids=[]) == {}
        assert statements == []
        assert set(contact_balances(db_session, direction=direction, contact_ids=[ids["partial"]])) == {ids["partial"]}
        assert len(statements) == 1
    finally:
        event.remove(engine, "before_cursor_execute", record)


def test_balance_failure_does_not_become_zero(db_session, ledger, monkeypatch):
    _, _, direction, ids = ledger

    def unavailable(*_args, **_kwargs):
        raise RuntimeError("ledger unavailable")

    monkeypatch.setattr(db_session, "query", unavailable)
    with pytest.raises(RuntimeError, match="ledger unavailable"):
        contact_balances(db_session, direction=direction, contact_ids=list(ids.values()))
