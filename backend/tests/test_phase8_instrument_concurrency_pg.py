"""Phase 8: real two-connection LC and cheque settlement races on disposable PostgreSQL.

Never execute against staging or production. This module uses the localhost
CI database and separately committed synthetic records to simulate a race.
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
from sqlalchemy.engine.url import make_url

from tests.conftest import TEST_DB_URL, TestingSessionLocal
from tests.test_phase8_postgres_concurrency import create_case, run_pair
from app.models.caisse import Caisse
from app.models.correction_operation import CorrectionOperation
from app.models.lettre_credit import LettreDeCredit
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand
from app.schemas.lc_correction import LCCorrectionCommand
from app.services.correction_commands import apply_correction, preview_correction
from app.services.lc_corrections import apply_lc_correction, preview_lc_correction

pytestmark = pytest.mark.skipif(
    os.environ.get("PHASE8_DISPOSABLE_DB") != "true",
    reason="Requires disposable native PostgreSQL CI database",
)


@pytest.fixture(autouse=True)
def refuse_live_targets():
    url = make_url(TEST_DB_URL)
    assert (
        url.drivername.startswith("postgresql")
        and url.host in {"localhost", "127.0.0.1"}
        and url.database == "comptabilite_db"
        and url.username == "postgres"
    ), "The Phase 8 race gate must never use a live database."


def _actor(user_id):
    return SimpleNamespace(id_utilisateur=user_id)


def _make_lc():
    tx_id, user_id = create_case()
    with TestingSessionLocal() as db:
        tx = db.get(Transaction, tx_id)
        lc = LettreDeCredit(
            numero_reference="PHASE8-LC-" + uuid4().hex[:12],
            montant=Decimal("5.00"),
            date_emission=date.today() - timedelta(days=2),
            date_disponibilite=date.today() - timedelta(days=1),
            date_reception=date.today() - timedelta(days=1),
            id_client_origine=tx.id_client,
            id_client=tx.id_client,
            type_detenteur="client",
            statut="active",
            statut_cycle="detenue",
            version_utilisation=0,
            id_utilisateur_creation=user_id,
        )
        db.add(lc)
        db.commit()
        return lc.id_lc, user_id


def _lc_command(lc_id, text, operation_id=None):
    with TestingSessionLocal() as db:
        lc = db.get(LettreDeCredit, lc_id)
        cmd = LCCorrectionCommand(
            operation_id=operation_id or uuid4(),
            id_lc=lc_id,
            expected_version=lc.version_utilisation,
            reason="Phase 8 double modification de la LC",
            changes={"notes": text},
        )
        fingerprint = preview_lc_correction(db, cmd)["dependency_fingerprint"]
        return cmd, fingerprint


def _run_lc_pair(commands, actor_id):
    barrier = Barrier(2)

    def worker(item):
        command, fingerprint = item
        with TestingSessionLocal() as db:
            barrier.wait(timeout=15)
            try:
                result = apply_lc_correction(db, command, fingerprint, _actor(actor_id))
                return ("replay" if result.get("replayed") else "apply", result)
            except HTTPException as e:
                db.rollback()
                return ("conflict" if e.status_code == 409 else f"http-{e.status_code}", None)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker, c) for c in commands]
        return [f.result(timeout=40) for f in futures]


def test_parallel_lc_metadata_edits_commit_only_one_version():
    lc_id, actor_id = _make_lc()
    first = _lc_command(lc_id, "Correction A")
    second = _lc_command(lc_id, "Correction B")
    results = _run_lc_pair([first, second], actor_id)
    assert sorted(name for name, _ in results) == ["apply", "conflict"]
    with TestingSessionLocal() as db:
        lc = db.get(LettreDeCredit, lc_id)
        assert lc.version_utilisation == 1
        assert lc.notes in {"Correction A", "Correction B"}
        operations = db.query(CorrectionOperation).filter(
            CorrectionOperation.operation_id.in_([first[0].operation_id, second[0].operation_id]),
        ).all()
        assert len(operations) == 1


def test_same_lc_operation_replayed_concurrently_without_second_write():
    lc_id, actor_id = _make_lc()
    command = _lc_command(lc_id, "Correction idempotente")
    results = _run_lc_pair([command, command], actor_id)
    assert sorted(name for name, _ in results) == ["apply", "replay"]
    with TestingSessionLocal() as db:
        lc = db.get(LettreDeCredit, lc_id)
        assert lc.version_utilisation == 1
        assert lc.notes == "Correction idempotente"
        assert db.query(CorrectionOperation).filter_by(operation_id=command[0].operation_id).count() == 1


def _make_uncleared_cheque():
    tx_id, actor_id = create_case()
    with TestingSessionLocal() as db:
        payment = Paiement(
            id_transaction=tx_id,
            montant=Decimal("5.00"),
            date_paiement=date.today(),
            type_paiement="cheque",
            statut="en_attente",
            statut_cheque="a_encaisser",
            numero_cheque="PHASE8-" + uuid4().hex[:10],
            id_utilisateur_creation=actor_id,
        )
        db.add(payment)
        db.commit()
        return tx_id, payment.id_paiement, actor_id


def _cheque_command(payment_id):
    with TestingSessionLocal() as db:
        payment = db.get(Paiement, payment_id)
        cmd = CorrectionCommand(
            operation_id=uuid4(),
            reason="Phase 8 double encaissement du chèque",
            target={
                "entity_type": "paiement",
                "entity_id": payment_id,
                "expected_version": payment.row_version,
            },
            changes={
                "statut_cheque": "encaisse",
                "date_encaissement_effective": date.today(),
            },
        )
        preview = preview_correction(db, cmd)
        return CorrectionApplyCommand(
            **cmd.model_dump(exclude_unset=True),
            dependency_fingerprint=preview["dependency_fingerprint"],
        )


def test_parallel_cheque_clearing_creates_one_ledger_entry():
    tx_id, payment_id, actor_id = _make_uncleared_cheque()
    a, b = _cheque_command(payment_id), _cheque_command(payment_id)
    results = run_pair([a, b], actor_id)
    assert sorted(name for name, _ in results) == ["apply", "conflict"]
    with TestingSessionLocal() as db:
        payment = db.get(Paiement, payment_id)
        assert payment.row_version == 2
        assert payment.statut == "valide"
        assert payment.statut_cheque == "encaisse"
        active = db.query(Caisse).filter(
            Caisse.id_paiement == payment_id, Caisse.statut == "active",
        ).all()
        assert len(active) == 1
        assert active[0].montant == Decimal("5.00")
        assert active[0].type_mouvement == "ENTREE"
        assert db.query(CorrectionOperation).filter(
            CorrectionOperation.operation_id.in_([a.operation_id, b.operation_id]),
        ).count() == 1
