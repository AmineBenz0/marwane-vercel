-- Integrated correction schema + protection upgrade (ONE ATOMIC TRANSACTION).
-- Candidate only. DO NOT APPLY LIVE without verified backup and written release approval.
-- Execute as a single transaction (psql -1 -v ON_ERROR_STOP=1; or one migration file).
-- Do not reapply the correction-history foundation: it was installed 2026-11-09.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Hold a short lock while validating the financial baseline and installing the guards.
-- This serializes new financial writes. If busy for over 5 seconds, abort safely.
LOCK TABLE public.transactions, public.paiements, public.caisse,
  public.mouvements_bancaires, public.egg_sale_allocations
  IN SHARE ROW EXCLUSIVE MODE;

DO $release_preflight$
BEGIN
  IF to_regclass('public.correction_operations') IS NULL
      OR to_regclass('public.entity_revisions') IS NULL
      OR to_regclass('public.corrections_financieres') IS NULL THEN
    RAISE EXCEPTION 'Integrated corrections require the installed immutable audit foundation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='transactions' AND column_name='row_version')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='paiements' AND column_name='row_version') THEN
    RAISE EXCEPTION 'The production revision foundation must be installed first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transactions)
      OR EXISTS (SELECT 1 FROM public.paiements)
      OR EXISTS (SELECT 1 FROM public.caisse)
      OR EXISTS (SELECT 1 FROM public.mouvements_bancaires)
      OR EXISTS (SELECT 1 FROM public.egg_sale_allocations) THEN
    RAISE EXCEPTION 'Financial baseline has changed: halt and re-evaluate the migration/backfill';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='transactions'
      AND t.tgname='trg_correction_capture' AND t.tgenabled IN ('O','A')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='paiements'
      AND t.tgname='trg_correction_capture' AND t.tgenabled IN ('O','A')
  ) THEN
    RAISE EXCEPTION 'Immutable revision triggers are absent or disabled';
  END IF;
  IF to_regprocedure('public.protect_financial_identity()') IS NULL THEN
    RAISE EXCEPTION 'Original financial identity guard is absent';
  END IF;
END $release_preflight$;

-- BEGIN STAGED SOURCE: backend/migrations/production_integrated_correction_compatibility.sql
-- Candidate additive compatibility migration for the integrated correction release.
-- DO NOT apply to production until exact schema, backup and downtime gates pass.
-- Order: installed correction-history foundation -> this file ->
-- stock_correction_revisions.sql -> audited_payment_corrections.sql ->
-- 20261029210000_phase3_cash_bank_payment_corrections.sql.
--
-- Supabase production does not share the complete staging Alembic lineage.
-- The staging deferred-remainder migration's effects are reproduced narrowly.


DO $release1$
BEGIN
    IF to_regclass('public.transactions') IS NULL
       OR to_regclass('public.paiements') IS NULL
       OR to_regclass('public.egg_sale_allocations') IS NULL
       OR to_regclass('public.correction_operations') IS NULL
       OR to_regclass('public.entity_revisions') IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM information_schema.columns WHERE table_schema='public'
           AND table_name='transactions' AND column_name='row_version'
       ) OR NOT EXISTS (
           SELECT 1 FROM information_schema.columns WHERE table_schema='public'
           AND table_name='paiements' AND column_name='row_version'
       ) THEN
        RAISE EXCEPTION 'Release 1 requires the installed correction-history foundation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='transactions'
        AND column_name='quantite_annulee'
    ) THEN
        ALTER TABLE public.transactions
            ADD COLUMN quantite_annulee integer NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='egg_sale_allocations'
        AND column_name='quantite_livree'
    ) THEN
        ALTER TABLE public.egg_sale_allocations
            ADD COLUMN quantite_livree integer NOT NULL DEFAULT 0;
        -- An allocation in the currently deployed production system represents
        -- an already delivered egg quantity. The unfulfilled reservation
        -- lifecycle was added later in staging.
        UPDATE public.egg_sale_allocations SET quantite_livree = quantite;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='paiements'
        AND column_name='nature'
    ) THEN
        ALTER TABLE public.paiements
            ADD COLUMN nature varchar(20) NOT NULL DEFAULT 'paiement';
    END IF;
END $release1$;

DO $release1$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='check_quantite_annulee_bounded'
          AND conrelid='public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT check_quantite_annulee_bounded
            CHECK (quantite_annulee >= 0 AND quantite_annulee <= quantite);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='egg_allocation_delivered_bounded'
          AND conrelid='public.egg_sale_allocations'::regclass
    ) THEN
        ALTER TABLE public.egg_sale_allocations
            ADD CONSTRAINT egg_allocation_delivered_bounded
            CHECK (quantite_livree >= 0 AND quantite_livree <= quantite);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='check_paiement_nature_release1'
          AND conrelid='public.paiements'::regclass
    ) THEN
        -- This group does not activate refund/advance/credit settlement kinds.
        ALTER TABLE public.paiements
            ADD CONSTRAINT check_paiement_nature_release1
            CHECK (nature = 'paiement');
    END IF;
END $release1$;
-- END STAGED SOURCE: backend/migrations/production_integrated_correction_compatibility.sql

-- BEGIN STAGED SOURCE: backend/migrations/stock_correction_revisions.sql
-- Allocation-only corrections must advance the parent transaction revision.
-- Existing revision triggers automatically capture this explicit stock marker.


ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS stock_revision bigint NOT NULL DEFAULT 0
    CONSTRAINT check_stock_revision_nonnegative CHECK (stock_revision >= 0);
-- END STAGED SOURCE: backend/migrations/stock_correction_revisions.sql

-- BEGIN STAGED SOURCE: backend/migrations/audited_payment_corrections.sql
-- Permit only audited edits to an effective payment's date or amount.
-- Payment identity and movement identity remain immutable; movements are voided
-- and replaced by the application in the same correction transaction.


CREATE OR REPLACE FUNCTION public.protect_financial_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
    operation_uuid uuid;
    operation_actor integer;
    operation_request jsonb;
    operation_result jsonb;
    request_changes jsonb;
BEGIN
    IF TG_TABLE_NAME = 'paiements' THEN
        IF OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
           OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
           OR OLD.id_lc IS DISTINCT FROM NEW.id_lc THEN
            RAISE EXCEPTION 'Payment identity is immutable; correct supported details through an audited operation';
        END IF;

        IF OLD.date_paiement IS DISTINCT FROM NEW.date_paiement
           OR OLD.montant IS DISTINCT FROM NEW.montant THEN
            operation_uuid := nullif(current_setting('app.correction_operation_id', true), '')::uuid;
            IF operation_uuid IS NULL THEN
                RAISE EXCEPTION 'Payment date and amount require an audited correction operation';
            END IF;

            SELECT id_utilisateur, request_payload, result_payload
              INTO operation_actor, operation_request, operation_result
              FROM public.correction_operations
             WHERE operation_id = operation_uuid;

            IF NOT FOUND
               OR operation_actor IS DISTINCT FROM coalesce(NEW.id_utilisateur_modification, NEW.id_utilisateur_creation)
               OR operation_request->'target'->>'entity_type' IS DISTINCT FROM 'paiement'
               OR (operation_request->'target'->>'entity_id')::integer IS DISTINCT FROM NEW.id_paiement
               OR (operation_request->'target'->>'expected_version')::bigint IS DISTINCT FROM OLD.row_version THEN
                RAISE EXCEPTION 'Payment correction operation does not match its actor, target, or expected revision';
            END IF;

            request_changes := operation_request->'changes';
            IF jsonb_typeof(request_changes) IS DISTINCT FROM 'object'
               OR jsonb_typeof(operation_result->'record') IS DISTINCT FROM 'object'
               OR (OLD.date_paiement IS DISTINCT FROM NEW.date_paiement
                AND (NOT coalesce(request_changes ? 'date_paiement', false)
                     OR request_changes->>'date_paiement' IS DISTINCT FROM NEW.date_paiement::text))
               OR (OLD.montant IS DISTINCT FROM NEW.montant
                   AND (NOT coalesce(request_changes ? 'montant', false)
                        OR (request_changes->>'montant')::numeric IS DISTINCT FROM NEW.montant))
               OR (request_changes ? 'date_paiement'
                   AND request_changes->>'date_paiement' IS DISTINCT FROM NEW.date_paiement::text)
               OR (request_changes ? 'montant'
                   AND (request_changes->>'montant')::numeric IS DISTINCT FROM NEW.montant)
               OR operation_result->'record'->>'row_version' IS DISTINCT FROM NEW.row_version::text
               OR (request_changes ? 'date_paiement'
                   AND operation_result->'record'->>'date_paiement' IS DISTINCT FROM NEW.date_paiement::text)
               OR (request_changes ? 'montant'
                   AND (operation_result->'record'->>'montant')::numeric IS DISTINCT FROM NEW.montant) THEN
                RAISE EXCEPTION 'Payment correction operation does not authorize these values';
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'caisse' THEN
        IF OLD.date_mouvement IS DISTINCT FROM NEW.date_mouvement
           OR OLD.montant IS DISTINCT FROM NEW.montant
           OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
           OR OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
           OR OLD.id_paiement IS DISTINCT FROM NEW.id_paiement
           OR OLD.id_charge IS DISTINCT FROM NEW.id_charge THEN
            RAISE EXCEPTION 'Cash movement identity is immutable; void and replace it';
        END IF;
    ELSE
        IF OLD.id_compte IS DISTINCT FROM NEW.id_compte
           OR OLD.date_mouvement IS DISTINCT FROM NEW.date_mouvement
           OR OLD.montant IS DISTINCT FROM NEW.montant
           OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
           OR OLD.source IS DISTINCT FROM NEW.source
           OR OLD.reference IS DISTINCT FROM NEW.reference
           OR OLD.id_paiement IS DISTINCT FROM NEW.id_paiement
           OR OLD.id_charge IS DISTINCT FROM NEW.id_charge THEN
            RAISE EXCEPTION 'Bank movement identity is immutable; void and replace it';
        END IF;
    END IF;
    RETURN NEW;
END $fn$;

-- The history row written by capture_correction_revision records this same
-- operation ID, while the correction operation itself remains append-only.
-- END STAGED SOURCE: backend/migrations/audited_payment_corrections.sql

-- BEGIN STAGED SOURCE: backend/migrations/20261029210000_phase3_cash_bank_payment_corrections.sql
-- Extend the audited payment correction contract to cash/bank routing and
-- payment-method corrections. Cheques and letters of credit remain guarded.


CREATE OR REPLACE FUNCTION public.protect_financial_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
    operation_uuid uuid;
    operation_actor integer;
    operation_request jsonb;
    operation_result jsonb;
    request_changes jsonb;
    field_name text;
    requested_value text;
    result_value text;
BEGIN
    IF TG_TABLE_NAME = 'paiements' THEN
        IF OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
           OR OLD.id_lc IS DISTINCT FROM NEW.id_lc THEN
            RAISE EXCEPTION 'Payment transaction and letter-of-credit identity remain immutable';
        END IF;

        IF OLD.date_paiement IS DISTINCT FROM NEW.date_paiement
           OR OLD.montant IS DISTINCT FROM NEW.montant
           OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
           OR OLD.id_compte IS DISTINCT FROM NEW.id_compte
           OR OLD.source_reglement IS DISTINCT FROM NEW.source_reglement THEN
            operation_uuid := nullif(current_setting('app.correction_operation_id', true), '')::uuid;
            IF operation_uuid IS NULL THEN
                RAISE EXCEPTION 'Payment financial changes require an audited correction operation';
            END IF;

            SELECT id_utilisateur, request_payload, result_payload
              INTO operation_actor, operation_request, operation_result
              FROM public.correction_operations
             WHERE operation_id = operation_uuid;

            IF NOT FOUND
               OR operation_actor IS DISTINCT FROM coalesce(NEW.id_utilisateur_modification, NEW.id_utilisateur_creation)
               OR operation_request->'target'->>'entity_type' IS DISTINCT FROM 'paiement'
               OR (operation_request->'target'->>'entity_id')::integer IS DISTINCT FROM NEW.id_paiement
               OR (operation_request->'target'->>'expected_version')::bigint IS DISTINCT FROM OLD.row_version THEN
                RAISE EXCEPTION 'Payment correction operation does not match its actor, target, or expected revision';
            END IF;

            request_changes := operation_request->'changes';
            IF jsonb_typeof(request_changes) IS DISTINCT FROM 'object'
               OR jsonb_typeof(operation_result->'record') IS DISTINCT FROM 'object'
               OR operation_result->'record'->>'row_version' IS DISTINCT FROM NEW.row_version::text THEN
                RAISE EXCEPTION 'Payment correction operation is missing a matching result';
            END IF;

            FOREACH field_name IN ARRAY ARRAY['date_paiement','montant','type_paiement','id_compte','source_reglement'] LOOP
                IF to_jsonb(OLD)->field_name IS DISTINCT FROM to_jsonb(NEW)->field_name
                   AND NOT (request_changes ? field_name) THEN
                    RAISE EXCEPTION 'Payment correction operation does not request changed field %', field_name;
                END IF;
                IF request_changes ? field_name THEN
                    requested_value := request_changes->>field_name;
                    result_value := operation_result->'record'->>field_name;
                    IF field_name = 'montant' THEN
                        IF requested_value IS NULL OR result_value IS NULL
                           OR requested_value::numeric IS DISTINCT FROM NEW.montant
                           OR result_value::numeric IS DISTINCT FROM NEW.montant THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize montant';
                        END IF;
                    ELSIF field_name = 'date_paiement' THEN
                        IF requested_value IS DISTINCT FROM NEW.date_paiement::text
                           OR result_value IS DISTINCT FROM NEW.date_paiement::text THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize date_paiement';
                        END IF;
                    ELSIF field_name = 'id_compte' THEN
                        IF requested_value IS DISTINCT FROM NEW.id_compte::text
                           OR result_value IS DISTINCT FROM NEW.id_compte::text THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize id_compte';
                        END IF;
                    ELSIF field_name = 'type_paiement' THEN
                        IF requested_value IS DISTINCT FROM NEW.type_paiement
                           OR result_value IS DISTINCT FROM NEW.type_paiement THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize type_paiement';
                        END IF;
                    ELSIF field_name = 'source_reglement' THEN
                        IF requested_value IS DISTINCT FROM NEW.source_reglement
                           OR result_value IS DISTINCT FROM NEW.source_reglement THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize source_reglement';
                        END IF;
                    END IF;
                END IF;
            END LOOP;
        END IF;
    ELSIF TG_TABLE_NAME = 'caisse' THEN
        IF OLD.date_mouvement IS DISTINCT FROM NEW.date_mouvement
           OR OLD.montant IS DISTINCT FROM NEW.montant
           OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
           OR OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
           OR OLD.id_paiement IS DISTINCT FROM NEW.id_paiement
           OR OLD.id_charge IS DISTINCT FROM NEW.id_charge THEN
            RAISE EXCEPTION 'Cash movement identity is immutable; void and replace it';
        END IF;
    ELSE
        IF OLD.id_compte IS DISTINCT FROM NEW.id_compte
           OR OLD.date_mouvement IS DISTINCT FROM NEW.date_mouvement
           OR OLD.montant IS DISTINCT FROM NEW.montant
           OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
           OR OLD.source IS DISTINCT FROM NEW.source
           OR OLD.reference IS DISTINCT FROM NEW.reference
           OR OLD.id_paiement IS DISTINCT FROM NEW.id_paiement
           OR OLD.id_charge IS DISTINCT FROM NEW.id_charge THEN
            RAISE EXCEPTION 'Bank movement identity is immutable; void and replace it';
        END IF;
    END IF;
    RETURN NEW;
END $fn$;
-- END STAGED SOURCE: backend/migrations/20261029210000_phase3_cash_bank_payment_corrections.sql

-- Postconditions are part of the same transaction: any failure rolls back
-- every column, constraint and financial guard replacement above.
DO $release_postflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='transactions' AND column_name='stock_revision')
   OR NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='transactions' AND column_name='quantite_annulee')
   OR NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='paiements' AND column_name='nature')
   OR NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='egg_sale_allocations' AND column_name='quantite_livree') THEN
    RAISE EXCEPTION 'Integrated correction schema is incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='protect_financial_identity'
      AND p.pronargs=0
      AND pg_get_functiondef(p.oid) LIKE '%app.correction_operation_id%'
      AND pg_get_functiondef(p.oid) LIKE '%correction_operations%'
  ) THEN
    RAISE EXCEPTION 'Audited payment protection guard is not installed';
  END IF;
END $release_postflight$;
