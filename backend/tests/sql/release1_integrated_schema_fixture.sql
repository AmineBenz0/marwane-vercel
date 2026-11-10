-- TEST-ONLY rehearsal of the *missing effects* of the deferred-remainder
-- and settlement-compatibility staging migrations. NEVER apply to production.
-- The authoritative production migration requires its own verified preflight.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $release1$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='transactions' AND column_name='quantite_annulee'
    ) THEN
        ALTER TABLE public.transactions ADD COLUMN quantite_annulee integer NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='egg_sale_allocations' AND column_name='quantite_livree'
    ) THEN
        ALTER TABLE public.egg_sale_allocations ADD COLUMN quantite_livree integer NOT NULL DEFAULT 0;
        -- Preserve the staging migration's historical semantics: all preexisting
        -- allocations represent completed deliveries, not fresh reservations.
        UPDATE public.egg_sale_allocations SET quantite_livree = quantite;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='paiements' AND column_name='nature'
    ) THEN
        ALTER TABLE public.paiements ADD COLUMN nature varchar(20) NOT NULL DEFAULT 'paiement';
    END IF;
END $release1$;

DO $release1$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='check_quantite_annulee_bounded') THEN
        ALTER TABLE public.transactions ADD CONSTRAINT check_quantite_annulee_bounded
            CHECK(quantite_annulee >= 0 AND quantite_annulee <= quantite);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='egg_allocation_delivered_bounded') THEN
        ALTER TABLE public.egg_sale_allocations ADD CONSTRAINT egg_allocation_delivered_bounded
            CHECK(quantite_livree >= 0 AND quantite_livree <= quantite);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='check_paiement_nature_release1') THEN
        -- Refund/credit records cannot be created before their later releases.
        ALTER TABLE public.paiements ADD CONSTRAINT check_paiement_nature_release1
            CHECK(nature='paiement');
    END IF;
END $release1$;
