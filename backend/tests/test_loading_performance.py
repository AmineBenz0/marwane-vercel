"""Regression checks for bounded query counts and request-local diagnostics."""
from datetime import date, timedelta
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool

from app import database
from app.middleware.logging_middleware import LoggingMiddleware
from app.models.batiment import Batiment
from app.models.client import Client
from app.models.lettre_credit import LettreDeCredit
from app.models.paiement import Paiement
from app.models.production import Production
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.utils.request_timing import instrument_engine, request_timing


def test_transaction_list_query_count_does_not_grow_with_rows(client, db_session):
    customer = Client(nom_client="Performance customer")
    product = Produit(nom_produit="Performance product", pour_clients=True, pour_fournisseurs=False)
    building = Batiment(nom="Performance building")
    db_session.add_all([customer, product, building])
    db_session.flush()
    for i in range(12):
        production = Production(
            date_production=date.today(), id_batiment=building.id_batiment,
            type_oeuf="normal", nombre_oeufs=100, nombre_cartons=4, grammage=55,
        )
        credit = LettreDeCredit(
            numero_reference=f"PERF-{i}", montant=100, type_detenteur="client",
            id_client=customer.id_client, date_emission=date.today(),
            date_disponibilite=date.today(), statut="active",
        )
        db_session.add_all([production, credit])
        db_session.flush()
        transaction = Transaction(
            date_transaction=date.today(), date_echeance=date.today() + timedelta(days=10),
            id_client=customer.id_client, id_produit=product.id_produit,
            id_batiment=building.id_batiment, id_production=production.id_production,
            quantite=10, prix_unitaire=Decimal("10"), montant_total=Decimal("100"),
        )
        db_session.add(transaction)
        db_session.flush()
        db_session.add(Paiement(
            id_transaction=transaction.id_transaction, montant=25,
            date_paiement=date.today(), type_paiement="lc", statut="valide",
            id_lc=credit.id_lc,
        ))
    db_session.commit()
    counts = []
    statements = []

    def record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        for limit in (1, 12):
            db_session.expunge_all()
            statements.clear()
            response = client.get("/api/v1/transactions", params={"limit": limit})
            assert response.status_code == 200, response.text
            rows = response.json()
            assert len(rows) == limit
            assert all(Decimal(row["montant_paye"]) == 25 for row in rows)
            assert all(Decimal(row["montant_restant"]) == 75 for row in rows)
            assert all(row["date_production"] == date.today().isoformat() for row in rows)
            assert all(row["nom_batiment_source"] == "Performance building" for row in rows)
            assert all(row["paiements"][0]["numero_reference_lc"].startswith("PERF-") for row in rows)
            counts.append(len(statements))
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert counts[0] == counts[1]
    assert counts[1] <= 3


def test_timings_are_isolated_across_concurrent_requests(monkeypatch, caplog):
    engine = create_engine("sqlite://", poolclass=NullPool, connect_args={"check_same_thread": False})
    instrument_engine(engine)
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setenv("VERCEL_REGION", "cdg1")
    application = FastAPI()
    application.add_middleware(LoggingMiddleware)

    @application.get("/timed/{count}")
    def timed(count: int, db: Session = Depends(database.get_db)):
        for _ in range(count):
            db.execute(text("SELECT 1"))
        return {"ok": True}

    @application.get("/live")
    def live():
        return {"ok": True}

    with TestClient(application) as test_client, caplog.at_level("INFO"):
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda n: test_client.get(f"/timed/{n}"), (1, 4)))
        no_db = test_client.get("/live")
    for response in responses:
        assert response.status_code == 200
        assert response.headers["x-app-region"] == "cdg1"
        assert "db_acquire;dur=" in response.headers["server-timing"]
    assert "sql;dur=0.00" in no_db.headers["server-timing"]
    records = [r for r in caplog.records if getattr(r, "endpoint", "").startswith("/timed/")]
    assert {r.endpoint: r.sql_count for r in records} == {"/timed/1": 1, "/timed/4": 4}
    assert all(r.db_acquire_ms >= 0 and r.sql_ms >= 0 for r in records)
    assert request_timing.get() is None
    engine.dispose()
