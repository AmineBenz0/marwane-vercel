"""Native PostgreSQL Phase 8 release gate; NEVER run against staging or production.

The fixture deliberately commits synthetic records because two independent
connections need to see the same row. It is restricted to the disposable,
localhost PostgreSQL database created by the GitHub migration-validation job.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from threading import Barrier
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import event, func
from sqlalchemy.engine.url import make_url

from tests.conftest import TEST_DB_URL, TestingSessionLocal
from app.models.client import Client
from app.models.correction_operation import CorrectionOperation, EntityRevision
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand
from app.services.correction_commands import apply_correction, preview_correction

pytestmark = pytest.mark.skipif(
    os.environ.get("PHASE8_DISPOSABLE_DB") != "true",
    reason="Requires the explicitly enabled disposable Phase 8 CI PostgreSQL fixture",
)


@pytest.fixture(autouse=True)
def never_connect_to_a_live_database():
    url = make_url(TEST_DB_URL)
    if (
        not url.drivername.startswith("postgresql")
        or url.host not in {"localhost", "127.0.0.1"}
        or url.database != "comptabilite_db"
        or url.username != "postgres"
    ):
        pytest.fail("Phase 8 concurrency checks refuse non-disposable database targets")


def create_case():
    """Commit only to the isolated CI database, never to a live environment."""
    marker = uuid4().hex[:12]
    with TestingSessionLocal() as db:
        user = Utilisateur(
            nom_utilisateur=f"Phase8 {marker}",
            email=f"phase8-{marker}@example.invalid",
            mot_de_passe_hash="not-a-login-credential",
            role="admin", est_actif=True,
        )
        client = Client(nom_client=f"Phase8 client {marker}", est_actif=True)
        product = Produit(
            nom_produit=f"Phase8 service {marker}", type_produit="service",
            pour_clients=True, pour_fournisseurs=False, est_actif=True,
        )
        db.add_all([user, client, product])
        db.flush()
        tx = Transaction(
            date_transaction=date.today(),
            date_echeance=date.today() + timedelta(days=3),
            id_client=client.id_client,
            id_produit=product.id_produit,
            quantite=1, prix_unitaire=Decimal("10.00"),
            montant_total=Decimal("10.00"),
            est_actif=True,
            id_utilisateur_creation=user.id_utilisateur,
        )
        db.add(tx)
        db.commit()
        return tx.id_transaction, user.id_utilisateur


def prepare(tx_id, new_due, *, operation_id=None):
    with TestingSessionLocal() as db:
        row = db.get(Transaction, tx_id)
        cmd = CorrectionCommand(
            operation_id=operation_id or uuid4(),
            reason="Phase 8 concurrent due-date correction",
            target={
                "entity_type": "transaction",
                "entity_id": tx_id,
                "expected_version": row.row_version,
            },
            changes={"date_echeance": new_due},
        )
        preview = preview_correction(db, cmd)
        return CorrectionApplyCommand(
            **cmd.model_dump(exclude_unset=True),
            dependency_fingerprint=preview["dependency_fingerprint"],
        )


def run_pair(commands, actor_id):
    """Start separate DB connections together, each owning its own commit."""
    gate = Barrier(2)

    def worker(command):
        with TestingSessionLocal() as db:
            gate.wait(timeout=10)
            try:
                response = apply_correction(db, command, SimpleNamespace(id_utilisateur=actor_id))
                return ("replay" if response.get("replayed") else "apply", response)
            except HTTPException as exc:
                db.rollback()
                return ("conflict" if exc.status_code == 409 else f"http-{exc.status_code}", None)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker, command) for command in commands]
        return [future.result(timeout=30) for future in futures]


def assert_once(tx_id, operation_ids):
    with TestingSessionLocal() as db:
        row = db.get(Transaction, tx_id)
        revisions = db.query(EntityRevision).filter_by(
            entity_type="transaction", entity_id=tx_id,
        ).order_by(EntityRevision.revision).all()
        operations = db.query(CorrectionOperation).filter(
            CorrectionOperation.operation_id.in_(operation_ids),
        ).all()
        assert len(operations) == 1
        assert row.row_version == 2
        assert [r.revision for r in revisions] == [1, 2]


def test_distinct_parallel_corrections_accept_only_one_version():
    tx_id, actor_id = create_case()
    due = date.today() + timedelta(days=4)
    command1 = prepare(tx_id, due)
    command2 = prepare(tx_id, due)
    statuses = [name for name, _ in run_pair([command1, command2], actor_id)]
    assert sorted(statuses) == ["apply", "conflict"]
    assert_once(tx_id, [command1.operation_id, command2.operation_id])


def test_same_operation_uuid_concurrent_retry_is_idempotent():
    tx_id, actor_id = create_case()
    command = prepare(tx_id, date.today() + timedelta(days=4))
    responses = run_pair([command, command], actor_id)
    assert sorted(name for name, _ in responses) == ["apply", "replay"]
    first = next(result for name, result in responses if name == "apply")
    retry = next(result for name, result in responses if name == "replay")
    assert first["record"] == retry["record"]
    assert_once(tx_id, [command.operation_id])


def test_late_database_error_rolls_back_operation_revision_and_target():
    tx_id, actor_id = create_case()
    command = prepare(tx_id, date.today() + timedelta(days=4))
    with TestingSessionLocal() as db:
        before = db.get(Transaction, tx_id).date_echeance
        original_count = db.query(EntityRevision).filter_by(
            entity_type="transaction", entity_id=tx_id,
        ).count()

    with pytest.raises(RuntimeError, match="Phase 8 injected late failure"):
        with TestingSessionLocal() as db:
            flushes = {"count": 0}

            def fail_after_second_flush(session, _context):
                flushes["count"] += 1
                if flushes["count"] == 2:
                    raise RuntimeError("Phase 8 injected late failure")

            event.listen(db, "after_flush", fail_after_second_flush)
            apply_correction(db, command, SimpleNamespace(id_utilisateur=actor_id))

    with TestingSessionLocal() as db:
        row = db.get(Transaction, tx_id)
        assert row.date_echeance == before
        assert row.row_version == 1
        assert db.query(CorrectionOperation).filter_by(operation_id=command.operation_id).count() == 0
        assert db.query(EntityRevision).filter_by(
            entity_type="transaction", entity_id=tx_id,
        ).count() == original_count
