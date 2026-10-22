-- Store the preferred payment source for future supplier payments.
-- Existing suppliers remain NULL until a user chooses a preference.
ALTER TABLE public.fournisseurs
    ADD COLUMN IF NOT EXISTS mode_reglement_prefere VARCHAR(10);

DO $constraint$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_fournisseurs_mode_reglement_prefere'
          AND conrelid = 'public.fournisseurs'::regclass
    ) THEN
        ALTER TABLE public.fournisseurs
            ADD CONSTRAINT ck_fournisseurs_mode_reglement_prefere
            CHECK (
                mode_reglement_prefere IS NULL
                OR mode_reglement_prefere IN ('caisse', 'banque')
            );
    END IF;
END
$constraint$;

-- Link bank-funded payments to the account whose balance they change.
ALTER TABLE public.paiements
    ADD COLUMN IF NOT EXISTS id_compte INTEGER
    REFERENCES public.comptes_bancaires(id_compte);

CREATE INDEX IF NOT EXISTS ix_paiements_id_compte
    ON public.paiements (id_compte);

DO $constraint$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'check_paiement_compte_virement'
          AND conrelid = 'public.paiements'::regclass
    ) THEN
        ALTER TABLE public.paiements
            ADD CONSTRAINT check_paiement_compte_virement
            CHECK (id_compte IS NULL OR type_paiement = 'virement');
    END IF;
END
$constraint$;
