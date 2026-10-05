-- Apply before deploying the LC reuse code. Safe to replay on an existing DB.
-- Preserve legacy cancellation audit columns; their removal is a separate migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.lettres_credit, public.cessions_lc,
    public.paiements, public.mouvements_bancaires IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
    needs_backfill BOOLEAN :=
        NOT EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'lettres_credit'
                AND column_name = 'version_utilisation')
        OR NOT EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'cessions_lc'
                AND column_name = 'id_cession_origine');
BEGIN
    ALTER TABLE public.lettres_credit
        ADD COLUMN IF NOT EXISTS version_utilisation INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.cessions_lc
        ADD COLUMN IF NOT EXISTS id_cession_origine INTEGER;

    IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cessions_lc'
            AND column_name = 'id_cession_inverse')
        AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cessions_lc'
            AND column_name = 'statut') THEN
        -- Reject ambiguous history instead of reactivating an already reversed use.
        IF EXISTS (
            SELECT 1 FROM public.cessions_lc original
            LEFT JOIN public.cessions_lc reversal
                ON reversal.id_cession = original.id_cession_inverse
            WHERE original.statut = 'annulee' AND (
                reversal.id_cession IS NULL
                OR reversal.id_cession_inverse IS DISTINCT FROM original.id_cession
                OR reversal.statut IS DISTINCT FROM 'active'
                OR reversal.id_lc IS DISTINCT FROM original.id_lc
            )
        ) THEN
            RAISE EXCEPTION 'LC migration: an existing cancellation has no unambiguous reversal';
        END IF;

        -- A bilateral link must become ONE pointer: reversal -> cancelled original.
        UPDATE public.cessions_lc reversal
        SET id_cession_origine = original.id_cession
        FROM public.cessions_lc original
        WHERE original.statut = 'annulee' AND reversal.statut = 'active'
            AND original.id_cession_inverse = reversal.id_cession
            AND reversal.id_cession_inverse = original.id_cession
            AND reversal.id_cession_origine IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.cessions_lc reversal
        JOIN public.cessions_lc original
            ON original.id_cession = reversal.id_cession_origine
        WHERE original.id_cession_origine IS NOT NULL
            OR original.id_lc <> reversal.id_lc
    ) THEN
        RAISE EXCEPTION 'LC migration: invalid reversal chain';
    END IF;

    IF needs_backfill THEN
        UPDATE public.lettres_credit lc
        SET statut = CASE WHEN
            EXISTS (SELECT 1 FROM public.paiements p
                WHERE p.id_lc = lc.id_lc AND p.statut <> 'annule')
            OR EXISTS (SELECT 1 FROM public.mouvements_bancaires mb
                WHERE mb.source = 'lc' AND mb.reference = lc.numero_reference
                    AND mb.statut = 'active')
            OR EXISTS (SELECT 1 FROM public.cessions_lc c
                WHERE c.id_lc = lc.id_lc AND c.id_cession_origine IS NULL
                    AND NOT EXISTS (SELECT 1 FROM public.cessions_lc r
                        WHERE r.id_cession_origine = c.id_cession))
            THEN 'utilisee' ELSE 'active' END;
        UPDATE public.lettres_credit
        SET version_utilisation = GREATEST(version_utilisation, 1)
        WHERE statut = 'utilisee';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.cessions_lc'::regclass
            AND conname = 'fk_cessions_lc_origine') THEN
        ALTER TABLE public.cessions_lc
            ADD CONSTRAINT fk_cessions_lc_origine
            FOREIGN KEY (id_cession_origine)
            REFERENCES public.cessions_lc(id_cession) ON DELETE SET NULL;
    END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cessions_lc_one_reversal
    ON public.cessions_lc(id_cession_origine);
ALTER TABLE public.lettres_credit DROP CONSTRAINT IF EXISTS check_lc_statut_valide;
ALTER TABLE public.lettres_credit ADD CONSTRAINT check_lc_statut_valide
    CHECK (statut IN ('active', 'utilisee'));
COMMIT;
