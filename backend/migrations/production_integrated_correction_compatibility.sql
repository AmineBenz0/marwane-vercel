-- Candidate additive compatibility migration for the integrated correction release.
-- DO NOT apply to production until exact schema, backup and downtime gates pass.
-- Order: installed correction-history foundation -> this file ->
-- stock_correction_revisions.sql -> audited_payment_corrections.sql ->
-- 20261029210000_phase3_cash_bank_payment_corrections.sql.
--
-- Supabase production does not share the complete staging Alembic lineage.
-- The staging deferred-remainder migration's effects are reproduced narrowly.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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
