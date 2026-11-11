"""Release 4 Phase 2 ledger acceptance on disposable native PostgreSQL only.

Never points at staging or production. Uses psycopg2 + rollback instead of
SQLAlchemy's db_session fixture (which creates/drops schema tables).
"""
import json
import os
from datetime import date, timedelta
from decimal import Decimal
from urllib.parse import urlsplit
from uuid import uuid4

import pytest

_target = urlsplit(os.getenv("TEST_DATABASE_URL", ""))
if not (
    _target.scheme.startswith("postgresql")
    and _target.hostname in {"localhost", "127.0.0.1"}
    and _target.path == "/comptabilite_db"
    and os.getenv("ENVIRONMENT") == "testing"
):
    pytest.skip("Release 4 ledger checks require disposable localhost PostgreSQL", allow_module_level=True)

import psycopg2


@pytest.fixture
def conn():
    db = psycopg2.connect(os.environ["TEST_DATABASE_URL"])
    db.autocommit = False
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def _sale(cur, *, amount="1500.00", sellable=False):
    unique = uuid4().hex[:14]
    cur.execute(
        "INSERT INTO public.utilisateurs(nom_utilisateur,email,mot_de_passe_hash,role,est_actif) "
        "VALUES ('Ledger QA',%s,'local-only-hash','admin',true) RETURNING id_utilisateur",
        (f"ledger-{unique}@example.invalid",),
    )
    user = cur.fetchone()[0]
    cur.execute(
        "INSERT INTO public.clients(nom_client) VALUES (%s) RETURNING id_client",
        (f"Ledger client {unique}",),
    )
    client = cur.fetchone()[0]
    if sellable:
        # The Phase 4 writer rejects non-egg products. Reuse the real
        # production catalog category, which is unique by product name.
        cur.execute(
            "INSERT INTO public.produits(nom_produit,type_produit,est_actif,pour_clients,pour_fournisseurs) "
            "VALUES ('Oeufs - Moyen','produit_fini',true,true,false) "
            "ON CONFLICT (nom_produit) DO UPDATE SET pour_clients=true,est_actif=true "
            "RETURNING id_produit"
        )
    else:
        cur.execute(
            "INSERT INTO public.produits(nom_produit,type_produit,est_actif,pour_clients,pour_fournisseurs) "
            "VALUES (%s,'produit_fini',true,true,true) RETURNING id_produit",
            (f"Ledger eggs {unique}",),
        )
    product = cur.fetchone()[0]
    cur.execute(
        "INSERT INTO public.batiments(nom) VALUES (%s) RETURNING id_batiment",
        (f"QA {unique[:10]}",),
    )
    building = cur.fetchone()[0]
    sold_on = date.today() - timedelta(days=10)
    cur.execute(
        "INSERT INTO public.transactions(date_transaction,id_produit,quantite,prix_unitaire,"
        "montant_total,est_actif,id_client,id_batiment,est_promesse,allocation_automatique,"
        "date_livraison_prevue,id_utilisateur_creation) "
        "VALUES (%s,%s,1000,1.50,%s,true,%s,%s,true,true,%s,%s) "
        "RETURNING id_transaction",
        (sold_on, product, Decimal(amount), client, building, date.today(), user),
    )
    return dict(user=user, client=client, tx=cur.fetchone()[0], amount=amount, sold_on=sold_on)


def _operation(cur, sale, quantity, cumulative, amount, date_effect=None, op_id=None):
    op_id = op_id or uuid4()
    date_effect = date_effect or date.today()
    request = {
        "kind": "deferred_avoir", "action": "cancel_unallocated",
        "transaction_id": sale["tx"], "cancel_quantity": quantity,
        "effective_date": date_effect.isoformat(),
    }
    result = {"adjustment_amount": f"{Decimal(amount):.2f}", "cumulative_canceled": cumulative}
    cur.execute(
        "INSERT INTO public.correction_operations("
        "operation_id,request_hash,id_utilisateur,reason,request_payload,result_payload) "
        "VALUES (%s,%s,%s,%s,%s::jsonb,%s::jsonb)",
        (str(op_id), "a" * 64, sale["user"], "Annulation du reliquat non livré",
         json.dumps(request), json.dumps(result)),
    )
    return op_id


def _adjust(cur, sale, op_id, *, before=0, quantity=400, before_amount="0.00", amount="600.00",
            cumulative=400, cumulative_amount="600.00", date_effect=None):
    cur.execute(
        "INSERT INTO public.avoirs_livraison_differee("
        "id_avoir,id_transaction,id_client,id_utilisateur_creation,date_effet,"
        "quantite_initiale,montant_initial,quantite_annulee_avant,quantite_annulee,"
        "quantite_annulee_cumulee,avoir_cumule_avant,montant_avoir,avoir_cumule)"
        " VALUES (%s,%s,%s,%s,%s,1000,%s,%s,%s,%s,%s,%s,%s)",
        (str(op_id), sale["tx"], sale["client"], sale["user"],
         date_effect or date.today(), Decimal(sale["amount"]), before, quantity,
         cumulative, Decimal(before_amount), Decimal(amount), Decimal(cumulative_amount)),
    )


def _reject(cur, action, contains):
    cur.execute("SAVEPOINT invalid_avoir")
    try:
        action()
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
    except psycopg2.Error as exc:
        message = str(exc).lower()
        cur.execute("ROLLBACK TO SAVEPOINT invalid_avoir")
        cur.execute("RELEASE SAVEPOINT invalid_avoir")
        assert contains.lower() in message, message
        return
    cur.execute("ROLLBACK TO SAVEPOINT invalid_avoir")
    cur.execute("RELEASE SAVEPOINT invalid_avoir")
    pytest.fail(f"Expected database to reject operation containing: {contains}")


def test_phase2_ledger_permissions_rls_and_immutability(conn):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT relrowsecurity FROM pg_class "
            "WHERE oid='public.avoirs_livraison_differee'::regclass"
        )
        assert cur.fetchone() == (True,)
        for permission, expected in {
            "SELECT": True, "INSERT": True, "UPDATE": False,
            "DELETE": False, "TRUNCATE": False,
        }.items():
            cur.execute(
                "SELECT has_table_privilege('app_runtime','public.avoirs_livraison_differee',%s)",
                (permission,),
            )
            assert cur.fetchone() == (expected,), permission
        cur.execute(
            "SELECT count(*) FROM pg_policies "
            "WHERE schemaname='public' AND tablename='avoirs_livraison_differee' "
            "AND roles @> ARRAY['app_runtime']::name[]"
        )
        assert cur.fetchone()[0] == 2
        for action in ("UPDATE", "DELETE", "TRUNCATE"):
            # A ledger row is inserted in a separate test; privileges are
            # checked here so no privileged direct mutation can be performed.
            cur.execute(
                "SELECT has_table_privilege('app_runtime','public.avoirs_livraison_differee',%s)",
                (action,),
            )
            assert cur.fetchone() == (False,)


def test_phase2_partial_and_final_cancellation_balances_and_history(conn):
    with conn.cursor() as cur:
        sale = _sale(cur)
        first = _operation(cur, sale, 100, 100, "150.00")
        cur.execute(
            "UPDATE public.transactions SET quantite_annulee=100,id_utilisateur_modification=%s "
            "WHERE id_transaction=%s", (sale["user"], sale["tx"]),
        )
        _adjust(cur, sale, first, quantity=100, amount="150.00",
                cumulative=100, cumulative_amount="150.00")
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cur.execute("SET CONSTRAINTS ALL DEFERRED")

        second = _operation(cur, sale, 300, 400, "450.00")
        cur.execute(
            "UPDATE public.transactions SET quantite_annulee=400,id_utilisateur_modification=%s "
            "WHERE id_transaction=%s", (sale["user"], sale["tx"]),
        )
        _adjust(cur, sale, second, before=100, quantity=300, before_amount="150.00",
                amount="450.00", cumulative=400, cumulative_amount="600.00")
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cur.execute(
            "SELECT t.montant_total,t.quantite_annulee,"
            "coalesce(sum(a.montant_avoir),0),coalesce(sum(a.quantite_annulee),0) "
            "FROM public.transactions t LEFT JOIN public.avoirs_livraison_differee a "
            "ON a.id_transaction=t.id_transaction WHERE t.id_transaction=%s "
            "GROUP BY t.montant_total,t.quantite_annulee", (sale["tx"],),
        )
        assert cur.fetchone() == (Decimal("1500.00"), 400, Decimal("600.00"), 400)
        cur.execute(
            "SELECT id_avoir FROM public.avoirs_livraison_differee "
            "WHERE id_transaction=%s ORDER BY quantite_annulee_cumulee",
            (sale["tx"],),
        )
        assert len(cur.fetchall()) == 2
        _reject(
            cur,
            lambda: cur.execute(
                "UPDATE public.avoirs_livraison_differee SET montant_avoir=1 "
                "WHERE id_avoir=%s", (str(first),),
            ),
            "append-only",
        )
        _reject(
            cur,
            lambda: cur.execute(
                "DELETE FROM public.avoirs_livraison_differee WHERE id_avoir=%s",
                (str(second),),
            ),
            "append-only",
        )


def test_phase2_no_stock_only_or_avoir_only_orphan(conn):
    with conn.cursor() as cur:
        sale = _sale(cur)
        _reject(
            cur,
            lambda: cur.execute(
                "UPDATE public.transactions SET quantite_annulee=400 "
                "WHERE id_transaction=%s", (sale["tx"],),
            ),
            "post atomically",
        )

        def only_avoir():
            op = _operation(cur, sale, 400, 400, "600.00")
            _adjust(cur, sale, op)
        _reject(cur, only_avoir, "post atomically")


def test_phase2_rejects_unlinked_incorrect_or_duplicate_operations(conn):
    with conn.cursor() as cur:
        sale = _sale(cur)
        _reject(
            cur,
            lambda: _adjust(cur, sale, uuid4()),
            "audited cancellation operation",
        )

        def wrong_value():
            op = _operation(cur, sale, 400, 400, "599.00")
            _adjust(cur, sale, op, amount="599.00", cumulative_amount="599.00")
        _reject(cur, wrong_value, "cumulative rounding")

        op = _operation(cur, sale, 400, 400, "600.00")
        cur.execute(
            "UPDATE public.transactions SET quantite_annulee=400 "
            "WHERE id_transaction=%s", (sale["tx"],),
        )
        _adjust(cur, sale, op)
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
        _reject(
            cur,
            lambda: _operation(cur, sale, 400, 400, "600.00", op_id=op),
            "duplicate key",
        )
        _reject(
            cur,
            lambda: _adjust(cur, sale, op),
            "already recorded",
        )


def test_phase2_prevents_backdating_adjustments_out_of_order(conn):
    with conn.cursor() as cur:
        sale = _sale(cur)
        first = _operation(cur, sale, 100, 100, "150.00")
        cur.execute(
            "UPDATE public.transactions SET quantite_annulee=100 "
            "WHERE id_transaction=%s", (sale["tx"],),
        )
        _adjust(cur, sale, first, quantity=100, amount="150.00",
                cumulative=100, cumulative_amount="150.00")
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cur.execute("SET CONSTRAINTS ALL DEFERRED")

        def backdated():
            older_date = date.today() - timedelta(days=1)
            op = _operation(cur, sale, 300, 400, "450.00", date_effect=older_date)
            _adjust(
                cur, sale, op, before=100, quantity=300, before_amount="150.00",
                amount="450.00", cumulative=400, cumulative_amount="600.00",
                date_effect=older_date,
            )
        _reject(cur, backdated, "before an earlier cancellation date")


def test_phase2_locks_sale_pricing_after_ledger_posted(conn):
    with conn.cursor() as cur:
        sale = _sale(cur, amount="1200.00")
        op = _operation(cur, sale, 400, 400, "480.00")
        cur.execute(
            "UPDATE public.transactions SET quantite_annulee=400 "
            "WHERE id_transaction=%s", (sale["tx"],),
        )
        _adjust(cur, sale, op, amount="480.00", cumulative_amount="480.00")
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
        _reject(
            cur,
            lambda: cur.execute(
                "UPDATE public.transactions SET montant_total=1500 "
                "WHERE id_transaction=%s", (sale["tx"],),
            ),
            "post atomically",
        )
        # A one-cent change still rounds to the same avoir; the saved original
        # negotiated total must remain an exact, immutable snapshot.
        _reject(
            cur,
            lambda: cur.execute(
                "UPDATE public.transactions SET montant_total=1200.01 "
                "WHERE id_transaction=%s", (sale["tx"],),
            ),
            "post atomically",
        )
        _reject(
            cur,
            lambda: cur.execute(
                "UPDATE public.transactions SET est_actif=false "
                "WHERE id_transaction=%s", (sale["tx"],),
            ),
            "post atomically",
        )
        _reject(
            cur,
            lambda: cur.execute(
                "UPDATE public.transactions SET date_transaction=%s "
                "WHERE id_transaction=%s", (date.today() + timedelta(days=1), sale["tx"]),
            ),
            "post atomically",
        )


def test_phase2_rejects_schema_replay_prerequisites_and_public_write_grants(conn):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM pg_trigger WHERE tgrelid="
            "'public.avoirs_livraison_differee'::regclass "
            "AND tgname IN ('trg_deferred_avoir_immutable',"
            "'trg_deferred_avoir_no_truncate','trg_deferred_avoir_validate',"
            "'trg_deferred_avoir_parity') AND tgenabled IN ('O','A')"
        )
        assert cur.fetchone()[0] == 4
        cur.execute(
            "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.transactions'::regclass "
            "AND tgname='trg_deferred_transaction_parity' AND tgenabled IN ('O','A')"
        )
        assert cur.fetchone()[0] == 1
        for role in ("anon", "authenticated"):
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (role,))
            if cur.fetchone():
                cur.execute(
                    "SELECT has_table_privilege(%s,'public.avoirs_livraison_differee','INSERT')",
                    (role,),
                )
                assert cur.fetchone() == (False,)


def test_phase3_native_sql_and_python_projections_share_cutoff(conn):
    """Projection test on actual migrated PostgreSQL, not permissive SQLite."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.transaction import Transaction
    from app.services.financial import (
        contact_balances, financial_position_as_of, net_sale_amount_as_of,
        query_financial_transactions, remaining_amount_as_of,
        summarize_financial_transactions,
    )

    with conn.cursor() as cur:
        sale = _sale(cur)
        op = _operation(cur, sale, 400, 400, "600.00", date_effect=date.today())
        cur.execute(
            "UPDATE public.transactions SET quantite_annulee=400 "
            "WHERE id_transaction=%s", (sale["tx"],),
        )
        _adjust(cur, sale, op)
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
    # The database is a dedicated disposable CI instance; commit the fixture
    # so SQLAlchemy can verify visibility from a different connection.
    conn.commit()
    engine = create_engine(os.environ["TEST_DATABASE_URL"])
    try:
        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            assert tx.montant_total == Decimal("1500.00")
            assert tx.montant_avoir == Decimal("600.00")
            assert tx.montant_net == Decimal("900.00")
            assert tx.montant_restant == Decimal("900.00")
            earlier = date.today() - timedelta(days=1)
            assert net_sale_amount_as_of(tx, earlier) == Decimal("1500.00")
            assert remaining_amount_as_of(tx, earlier) == Decimal("1500.00")
            assert net_sale_amount_as_of(tx, date.today()) == Decimal("900.00")
            assert contact_balances(
                db, direction="receivable", contact_ids=[sale["client"]],
                as_of=earlier,
            )[sale["client"]] == Decimal("1500.00")
            assert contact_balances(
                db, direction="receivable", contact_ids=[sale["client"]],
                as_of=date.today(),
            )[sale["client"]] == Decimal("900.00")
            assert financial_position_as_of(db, earlier)["receivables"] == Decimal("1500.00")
            assert financial_position_as_of(db, date.today())["receivables"] == Decimal("900.00")
            current = summarize_financial_transactions(
                db, direction="receivable", id_tiers=sale["client"],
            )
            assert (current["total_brut"], current["total_avoirs"], current["total"],
                    current["reste"], current["count"]) == (
                Decimal("1500.00"), Decimal("600.00"), Decimal("900.00"),
                Decimal("900.00"), 1,
            )
            result = query_financial_transactions(
                db, direction="receivable", id_tiers=sale["client"],
            )
            assert len(result) == 1
            assert result[0].montant_net == Decimal("900.00")
    finally:
        engine.dispose()



def _phase4_payload(tx, operation_id=None):
    from app.schemas.transaction import DeferredSaleRemainderClose
    return DeferredSaleRemainderClose(
        operation_id=operation_id or uuid4(),
        expected_version=tx.row_version,
        quantite_en_attente_attendue=tx.quantite_en_attente,
    )


def test_phase4_native_stock_and_avoir_commit_then_idempotent_replay(conn):
    """Verify actual PostgreSQL deferred parity, revision audit and replay."""
    from types import SimpleNamespace
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.transaction import Transaction
    from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
    from app.models.correction_operation import CorrectionOperation, EntityRevision
    from app.services.deferred_cancellation import cancel_deferred_sale_remainder
    from app.services.financial import contact_balances

    with conn.cursor() as cur:
        sale = _sale(cur, amount="1200.00", sellable=True)
    conn.commit()
    engine = create_engine(os.environ["TEST_DATABASE_URL"])
    actor = SimpleNamespace(id_utilisateur=sale["user"], est_actif=True)
    try:
        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            payload = _phase4_payload(tx)
            original_version = tx.row_version
            result = cancel_deferred_sale_remainder(
                db, transaction_id=sale["tx"], payload=payload, actor=actor,
            )
            assert result["montant_avoir"] == "1200.00"
            assert result["montant_net"] == "0.00"
            assert result["quantite_en_attente"] == 0
            assert result["credit_client"] == "0.00"
            db.commit()

        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            assert tx.row_version == original_version + 1
            assert tx.quantite_annulee == 1000
            assert tx.quantite_en_attente == 0
            assert tx.montant_total == Decimal("1200.00")
            assert tx.montant_net == Decimal("0.00")
            assert db.query(DeferredSaleAdjustment).filter_by(id_transaction=tx.id_transaction).count() == 1
            op = db.get(CorrectionOperation, payload.operation_id)
            assert op.result_payload["montant_avoir"] == "1200.00"
            assert op.result_payload["cumulative_canceled"] == 1000
            assert db.query(EntityRevision).filter_by(
                entity_type="transaction", entity_id=tx.id_transaction,
                operation_id=payload.operation_id,
            ).count() >= 1
            assert contact_balances(
                db, direction="receivable", contact_ids=[sale["client"]],
            )[sale["client"]] == Decimal("0.00")
            replay = cancel_deferred_sale_remainder(
                db, transaction_id=sale["tx"], payload=payload, actor=actor,
            )
            assert replay["rejoue"] is True
            assert replay["id_avoir"] == str(payload.operation_id)
            db.commit()
            assert db.query(DeferredSaleAdjustment).filter_by(id_transaction=tx.id_transaction).count() == 1

            from fastapi import HTTPException
            with pytest.raises(HTTPException) as e:
                cancel_deferred_sale_remainder(
                    db, transaction_id=sale["tx"],
                    payload=payload.model_copy(update={"operation_id": uuid4()}), actor=actor,
                )
            assert e.value.status_code == 409
            db.rollback()
    finally:
        engine.dispose()


@pytest.mark.parametrize("same_id", [True, False])
def test_phase4_native_concurrent_double_submit_is_serialized(conn, same_id):
    """Two PostgreSQL connections race: identical requests replay, different IDs conflict."""
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from types import SimpleNamespace
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from fastapi import HTTPException
    from app.models.transaction import Transaction
    from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
    from app.services.deferred_cancellation import cancel_deferred_sale_remainder

    with conn.cursor() as cur:
        sale = _sale(cur, sellable=True)
    conn.commit()
    engine = create_engine(os.environ["TEST_DATABASE_URL"], pool_size=2, max_overflow=2)
    actor = SimpleNamespace(id_utilisateur=sale["user"], est_actif=True)
    with Session(engine) as db:
        snapshot = db.get(Transaction, sale["tx"])
        version = snapshot.row_version
        pending = snapshot.quantite_en_attente
    one_id = uuid4()
    barrier = Barrier(2)

    def submit(op_id):
        from app.schemas.transaction import DeferredSaleRemainderClose
        payload = DeferredSaleRemainderClose(
            operation_id=op_id, expected_version=version,
            quantite_en_attente_attendue=pending,
        )
        with Session(engine) as db:
            barrier.wait(timeout=15)
            try:
                result = cancel_deferred_sale_remainder(
                    db, transaction_id=sale["tx"], payload=payload, actor=actor,
                )
                db.commit()
                return result
            except HTTPException as exc:
                db.rollback()
                return exc.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(submit, one_id)
            second = executor.submit(submit, one_id if same_id else uuid4())
            outcomes = [first.result(timeout=30), second.result(timeout=30)]
        if same_id:
            assert all(isinstance(outcome, dict) for outcome in outcomes)
            assert sorted(outcome["rejoue"] for outcome in outcomes) == [False, True]
        else:
            assert sum(isinstance(outcome, dict) for outcome in outcomes) == 1
            assert outcomes.count(409) == 1
        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            assert tx.quantite_annulee == 1000
            assert tx.montant_net == Decimal("0.00")
            assert db.query(DeferredSaleAdjustment).filter_by(id_transaction=tx.id_transaction).count() == 1
    finally:
        engine.dispose()


def test_phase4_native_rollback_removes_stock_and_avoir_together(conn):
    from types import SimpleNamespace
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.transaction import Transaction
    from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
    from app.models.correction_operation import CorrectionOperation
    from app.services.deferred_cancellation import cancel_deferred_sale_remainder

    with conn.cursor() as cur:
        sale = _sale(cur, sellable=True)
    conn.commit()
    engine = create_engine(os.environ["TEST_DATABASE_URL"])
    actor = SimpleNamespace(id_utilisateur=sale["user"], est_actif=True)
    try:
        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            receipt = cancel_deferred_sale_remainder(
                db, transaction_id=sale["tx"], payload=_phase4_payload(tx), actor=actor,
            )
            assert receipt["montant_avoir"] == "1500.00"
            db.rollback()  # Simulate failure before the database commits.
        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            assert tx.quantite_annulee == 0
            assert tx.montant_net == Decimal("1500.00")
            assert db.query(DeferredSaleAdjustment).filter_by(id_transaction=tx.id_transaction).count() == 0
            assert db.query(CorrectionOperation).filter(
                CorrectionOperation.request_payload["transaction_id"].as_integer() == tx.id_transaction,
            ).count() == 0
    finally:
        engine.dispose()



def test_phase5_native_cancel_then_explicit_refund_no_second_cash(conn):
    """Committed real cash payment -> atomic avoir -> one explicit refund.

    This scenario exercises the actual migrated PostgreSQL constraints, not
    SQLite's permissive in-memory model. The cancellation itself never makes
    an outgoing cash/bank movement; the signed refund does exactly once.
    """
    from types import SimpleNamespace
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models.transaction import Transaction
    from app.models.paiement import Paiement
    from app.models.caisse import Caisse
    from app.models.credit import Avance
    from app.models.deferred_sale_adjustment import DeferredSaleAdjustment
    from app.schemas.refund import RefundCommand, RefundApplyCommand
    from app.services.refunds import preview_refund, apply_refund
    from app.services.financial_ledger import sync_payment_cash_movement
    from app.services.deferred_cancellation import cancel_deferred_sale_remainder

    with conn.cursor() as cur:
        sale = _sale(cur, sellable=True)
    conn.commit()
    engine = create_engine(os.environ["TEST_DATABASE_URL"])
    actor = SimpleNamespace(id_utilisateur=sale["user"], est_actif=True)
    try:
        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            payment = Paiement(
                id_transaction=tx.id_transaction, date_paiement=tx.date_transaction,
                montant=Decimal("1500.00"), type_paiement="cash", nature="paiement",
                statut="valide", id_utilisateur_creation=sale["user"],
            )
            db.add(payment)
            db.flush()
            sync_payment_cash_movement(db, payment, tx, current_user=actor)
            db.commit()

        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            receipt = cancel_deferred_sale_remainder(
                db, transaction_id=sale["tx"], payload=_phase4_payload(tx), actor=actor,
            )
            db.commit()
            assert receipt["montant_net"] == "0.00"
            assert receipt["credit_client"] == "1500.00"
            assert db.query(Caisse).filter(Caisse.statut == "active", Caisse.id_transaction == sale["tx"]).count() == 1
            assert db.query(Avance).count() == 0
            assert db.query(DeferredSaleAdjustment).filter_by(id_transaction=sale["tx"]).count() == 1

        with Session(engine) as db:
            tx = db.get(Transaction, sale["tx"])
            command = RefundCommand(
                operation_id=uuid4(), id_transaction=tx.id_transaction,
                date_paiement=date.today(), montant=Decimal("1500.00"),
                type_paiement="cash", reason="Restitution explicite de la vente annulée",
            )
            preview = preview_refund(db, command)
            assert preview["available_credit"] == "1500.00"
            assert preview["montant_avoirs"] == "1500.00"
            apply = RefundApplyCommand(
                **command.model_dump(), dependency_fingerprint=preview["dependency_fingerprint"],
            )
            result = apply_refund(db, apply, actor)
            assert result["replayed"] is False
            db.expire_all()
            tx = db.get(Transaction, sale["tx"])
            assert tx.montant_paye == Decimal("0.00")
            assert tx.montant_net == Decimal("0.00")
            assert tx.montant_restant == Decimal("0.00")
            assert db.query(Caisse).filter(Caisse.statut == "active", Caisse.id_transaction == sale["tx"]).count() == 2
            assert db.query(Avance).count() == 0
            assert db.query(DeferredSaleAdjustment).filter_by(id_transaction=sale["tx"]).count() == 1
            replay = apply_refund(db, apply, actor)
            assert replay["replayed"] is True
            assert db.query(Caisse).filter(Caisse.statut == "active", Caisse.id_transaction == sale["tx"]).count() == 2
            assert db.query(Paiement).filter(Paiement.nature == "remboursement", Paiement.id_transaction == sale["tx"]).count() == 1
    finally:
        engine.dispose()
