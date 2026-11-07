"""Parallel deferred egg allocation must never double-reserve a production row.

This native PostgreSQL race test is restricted to the disposable local CI
database. No requests or write tests target staging or production.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy.engine.url import make_url

from tests.conftest import TEST_DB_URL, TestingSessionLocal
from tests.test_phase8_postgres_concurrency import create_case
from tests.lot_test_helpers import add_lot_cycle
from app.models.batiment import Batiment
from app.models.client import Client
from app.models.egg_allocation import EggAllocation
from app.models.production import Production
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.services.egg_sales import assign_pending_promises

pytestmark = pytest.mark.skipif(
    os.environ.get("PHASE8_DISPOSABLE_DB") != "true",
    reason="Explicitly enabled disposable local PostgreSQL only",
)


@pytest.fixture(autouse=True)
def refuse_live_database():
    target = make_url(TEST_DB_URL)
    assert (
        target.drivername.startswith("postgresql")
        and target.host in {"localhost", "127.0.0.1"}
        and target.database == "comptabilite_db"
        and target.username == "postgres"
    ), "No live database may be used for this concurrency test"


def _create_two_promises_and_five_eggs():
    _, actor_id = create_case()
    marker = uuid4().hex[:8]
    with TestingSessionLocal() as db:
        building = Batiment(nom="Phase8 " + marker, est_actif=True)
        client = Client(nom_client="Phase8 réservations " + marker, est_actif=True)
        product = db.query(Produit).filter_by(nom_produit="Oeufs - Gros").first()
        if not product:
            product = Produit(nom_produit="Oeufs - Gros", type_produit="produit_fini",
                              pour_clients=True, pour_fournisseurs=False, est_actif=True)
        db.add_all([building, client, product])
        db.commit()
        lot, cycle = add_lot_cycle(
            db, building, name="Lot Phase8 " + marker,
            date_debut=date.today() - timedelta(days=4),
            effectif_initial=100, duree_semaines=30,
        )
        source = Production(
            id_batiment=building.id_batiment, id_cycle=cycle.id_cycle,
            date_production=date.today() - timedelta(days=1),
            type_oeuf="normal", calibre="gros", nombre_oeufs=5,
            grammage=Decimal("60"), nombre_cartons=1, est_actif=True,
        )
        db.add(source)
        old = datetime.now(timezone.utc) - timedelta(days=2)
        promises = [
            Transaction(
                date_transaction=date.today(),
                date_creation=old + timedelta(days=offset),
                id_client=client.id_client,
                id_produit=product.id_produit,
                id_batiment=building.id_batiment,
                quantite=5, prix_unitaire=Decimal("1.00"),
                montant_total=Decimal("5.00"),
                est_actif=True, est_promesse=True, allocation_automatique=True,
                date_livraison_prevue=date.today()+timedelta(days=2),
                id_utilisateur_creation=actor_id,
            )
            for offset in (0, 1)
        ]
        db.add_all(promises)
        db.commit()
        return building.id_batiment, source.id_production, [t.id_transaction for t in promises]


def test_parallel_allocation_keeps_fifo_priority_and_never_double_reserves():
    building_id, source_id, (older_id, newer_id) = _create_two_promises_and_five_eggs()
    gate = Barrier(2)

    def allocate():
        with TestingSessionLocal() as db:
            gate.wait(timeout=15)
            allocations = assign_pending_promises(db, building_id=building_id)
            db.commit()
            return allocations

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [f.result(timeout=45) for f in [pool.submit(allocate), pool.submit(allocate)]]

    with TestingSessionLocal() as db:
        rows = db.query(EggAllocation).filter_by(id_production=source_id).all()
        assert len(rows) == 1, "A production source must never be allocated twice"
        assert rows[0].id_transaction == older_id, "Oldest pending sale has first priority"
        assert rows[0].quantite == 5
        assert sum(a.quantite for a in rows) <= db.get(Production, source_id).nombre_oeufs
        assert db.query(EggAllocation).filter_by(id_transaction=newer_id).count() == 0
        assert sum(x["quantite"] for batch in results for x in batch) == 5
