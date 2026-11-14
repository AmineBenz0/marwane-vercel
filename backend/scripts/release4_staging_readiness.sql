-- Release 4 Phase 8 — READ-ONLY readiness gate.
--
-- Execute after the candidate migrations, before enabling ANY cancellation
-- flag. No DDL/DML. Safe to evaluate against staging: a failed check raises
-- an exception without changing data. Never substitute this for complete
-- authenticated browser, DB-role and payment validation.
--
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/release4_staging_readiness.sql
DO $release4$
DECLARE
  blockers text[] := ARRAY[]::text[];
  role_name text;
BEGIN
  IF to_regclass('public.transactions') IS NULL OR
     to_regclass('public.paiements') IS NULL OR
     to_regclass('public.egg_sale_allocations') IS NULL THEN
    RAISE EXCEPTION 'R4 PRECHECK BLOCKED: core sale/payment/egg allocation schema missing';
  END IF;

  IF to_regclass('public.avoirs_livraison_differee') IS NULL THEN
    blockers := array_append(blockers, 'immutable commercial avoir table missing');
  END IF;
  IF to_regclass('public.correction_operations') IS NULL THEN
    blockers := array_append(blockers, 'idempotency correction journal missing');
  END IF;
  IF to_regprocedure('public.credit_transaction_capacity(integer,date,boolean)') IS NULL
    OR to_regprocedure('public.refund_monetary_capacity(integer,date)') IS NULL
    OR to_regprocedure('public.protect_refund_settlement()') IS NULL THEN
    blockers := array_append(blockers, 'dated net-credit/refund guard functions missing');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions'
      AND column_name='row_version'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions'
      AND column_name='quantite_annulee'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='egg_sale_allocations'
      AND column_name='quantite_livree'
  ) THEN
    blockers := array_append(blockers, 'deferred sale version/canceled/delivered schema missing');
  END IF;

  -- Do not blanket-block ordinary egg sales: their older reserved-but-
  -- undelivered stock is outside the deferred-cancellation operation and
  -- must remain intact. A *deferred promise* with such stock is unsafe.
  IF EXISTS (
    SELECT 1 FROM public.egg_sale_allocations a
    JOIN public.transactions t ON t.id_transaction=a.id_transaction
    WHERE t.est_actif IS TRUE AND t.est_promesse IS TRUE
      AND t.allocation_automatique IS TRUE
      AND a.quantite>coalesce(a.quantite_livree,0)
  ) THEN
    blockers := array_append(blockers, 'active deferred-sale reserved-but-undelivered eggs require model reconciliation');
  END IF;

  -- A pre-Release-4, inactive, unpaid, manually audited closure is NOT an
  -- issued commercial credit. Require an immutable baseline for it; never
  -- invent an avoir or retroactive cash adjustment for older staging tests.
  IF to_regclass('public.legacy_deferred_cancellations') IS NULL THEN
    blockers := array_append(blockers, 'immutable historic cancellation baseline missing');
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid='public.legacy_deferred_cancellations'::regclass AND relrowsecurity
    ) OR EXISTS (
      SELECT 1 FROM public.transactions t
      LEFT JOIN public.legacy_deferred_cancellations b ON b.id_transaction=t.id_transaction
      WHERE b.id_transaction IS NOT NULL
        AND (b.historical_canceled_qty <> t.quantite_annulee
             OR b.original_row IS DISTINCT FROM to_jsonb(t))
    ) THEN
      blockers := array_append(blockers, 'historic canceled sales must have immutable identical baselines');
    END IF;
  END IF;

  -- New cancellations are backed by the immutable commercial ledger, not a
  -- historical snapshot. Check both kinds without accepting missing or
  -- incomplete ledger records as a valid baseline.
  IF to_regclass('public.avoirs_livraison_differee') IS NOT NULL
     AND to_regclass('public.legacy_deferred_cancellations') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.transactions t
      LEFT JOIN public.legacy_deferred_cancellations b ON b.id_transaction=t.id_transaction
      LEFT JOIN LATERAL (
        SELECT count(*) AS n, coalesce(sum(a.quantite_annulee),0) AS qty,
               coalesce(max(a.quantite_annulee_cumulee),0) AS max_qty,
               coalesce(sum(a.montant_avoir),0) AS amount,
               coalesce(max(a.avoir_cumule),0) AS max_amount
        FROM public.avoirs_livraison_differee a WHERE a.id_transaction=t.id_transaction
      ) a ON true
      WHERE (b.id_transaction IS NOT NULL AND a.n > 0)
         OR (b.id_transaction IS NULL AND (t.quantite_annulee > 0 OR a.n > 0) AND
             (a.n = 0 OR a.qty <> t.quantite_annulee OR a.max_qty <> a.qty
              OR a.max_amount <> a.amount OR t.quantite <= 0
              OR a.amount <> round(t.montant_total * a.qty / nullif(t.quantite,0),2)))
    ) THEN
      blockers := array_append(blockers, 'canceled sales must match their historical baseline or commercial ledger');
    END IF;
  END IF;

  IF to_regclass('public.avoirs_livraison_differee') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid='public.avoirs_livraison_differee'::regclass AND relrowsecurity
    ) THEN
      blockers := array_append(blockers, 'commercial ledger must have RLS enabled');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.avoirs_livraison_differee'::regclass
        AND tgname='trg_deferred_avoir_immutable'
        AND tgenabled IN ('O','A')
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.avoirs_livraison_differee'::regclass
        AND tgname='trg_deferred_avoir_parity'
        AND tgenabled IN ('O','A')
    ) THEN
      blockers := array_append(blockers, 'immutable avoir/parity trigger disabled or missing');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname='app_runtime'
    ) THEN
      blockers := array_append(blockers, 'least privilege app_runtime missing');
    ELSE
      IF NOT has_table_privilege('app_runtime','public.avoirs_livraison_differee','SELECT')
        OR NOT has_table_privilege('app_runtime','public.avoirs_livraison_differee','INSERT')
        OR has_table_privilege('app_runtime','public.avoirs_livraison_differee','UPDATE')
        OR has_table_privilege('app_runtime','public.avoirs_livraison_differee','DELETE') THEN
        blockers := array_append(blockers, 'commercial ledger runtime privileges are unsafe');
      END IF;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        IF has_table_privilege(role_name,'public.avoirs_livraison_differee','SELECT')
          OR has_table_privilege(role_name,'public.avoirs_livraison_differee','INSERT')
          OR has_table_privilege(role_name,'public.avoirs_livraison_differee','UPDATE')
          OR has_table_privilege(role_name,'public.avoirs_livraison_differee','DELETE') THEN
          blockers := array_append(blockers, role_name || ' must not access commercial ledger');
        END IF;
      END IF;
    END LOOP;
  END IF;
  IF to_regprocedure('public.refund_monetary_capacity(integer,date)') IS NOT NULL THEN
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        IF has_function_privilege(
          role_name,'public.refund_monetary_capacity(integer,date)','EXECUTE'
        ) THEN
          blockers := array_append(blockers, role_name || ' has public refund guard EXECUTE');
        END IF;
      END IF;
    END LOOP;
  END IF;
  IF array_length(blockers,1) IS NOT NULL THEN
    RAISE EXCEPTION 'R4 PRECHECK BLOCKED: %', array_to_string(blockers,'; ');
  END IF;
  RAISE NOTICE 'R4 PRECHECK PASS: commercial ledger, legacy audit baseline and eligible deferred allocations';
END $release4$;
