-- Preserve the original sale and payment amounts when closing a promise remainder.
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS quantite_annulee INTEGER NOT NULL DEFAULT 0;

DO $constraint$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_transactions_quantite_annulee_bounded'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT ck_transactions_quantite_annulee_bounded
            CHECK (quantite_annulee >= 0 AND quantite_annulee <= quantite);
    END IF;
END
$constraint$;

DO $allocation_column$
DECLARE
    added_column BOOLEAN := FALSE;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'egg_sale_allocations'
          AND column_name = 'quantite_livree'
    ) THEN
        ALTER TABLE public.egg_sale_allocations
            ADD COLUMN quantite_livree INTEGER NOT NULL DEFAULT 0;
        added_column := TRUE;
    END IF;
    IF added_column THEN
        -- Existing allocations meant stock already covered by the original sale.
        UPDATE public.egg_sale_allocations SET quantite_livree = quantite;
    END IF;
END
$allocation_column$;

DO $constraint$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_egg_sale_allocations_delivered_bounded'
          AND conrelid = 'public.egg_sale_allocations'::regclass
    ) THEN
        ALTER TABLE public.egg_sale_allocations
            ADD CONSTRAINT ck_egg_sale_allocations_delivered_bounded
            CHECK (quantite_livree >= 0 AND quantite_livree <= quantite);
    END IF;
END
$constraint$;
