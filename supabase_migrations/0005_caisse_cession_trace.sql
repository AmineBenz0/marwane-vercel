ALTER TABLE caisse
    ADD COLUMN IF NOT EXISTS id_cession INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_caisse_cession'
    ) THEN
        ALTER TABLE caisse
            ADD CONSTRAINT fk_caisse_cession
            FOREIGN KEY (id_cession)
            REFERENCES cessions_lc (id_cession)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_caisse_id_cession ON caisse (id_cession);

-- Older schemas used either name for the Caisse origin check.
ALTER TABLE caisse DROP CONSTRAINT IF EXISTS check_caisse_mutual_exclusion;
ALTER TABLE caisse DROP CONSTRAINT IF EXISTS check_caisse_origine;
ALTER TABLE caisse ADD CONSTRAINT check_caisse_mutual_exclusion CHECK (
    (id_charge IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_cession IS NULL)
    OR (id_cession IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_charge IS NULL)
    OR (id_charge IS NULL AND id_cession IS NULL AND (id_transaction IS NOT NULL OR id_paiement IS NOT NULL))
);
