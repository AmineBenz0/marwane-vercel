-- Track LC cession cancellations and their compensating cession rows.
ALTER TABLE cessions_lc
    ADD COLUMN IF NOT EXISTS statut VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS id_cession_inverse INTEGER,
    ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
    ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS id_utilisateur_annulation INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_cessions_lc_statut_valide'
    ) THEN
        ALTER TABLE cessions_lc
            ADD CONSTRAINT check_cessions_lc_statut_valide
            CHECK (statut IN ('active', 'annulee'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_cessions_lc_inverse'
    ) THEN
        ALTER TABLE cessions_lc
            ADD CONSTRAINT fk_cessions_lc_inverse
            FOREIGN KEY (id_cession_inverse)
            REFERENCES cessions_lc (id_cession)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_cessions_lc_utilisateur_annulation'
    ) THEN
        ALTER TABLE cessions_lc
            ADD CONSTRAINT fk_cessions_lc_utilisateur_annulation
            FOREIGN KEY (id_utilisateur_annulation)
            REFERENCES utilisateurs (id_utilisateur);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_cessions_lc_id_cession_inverse
    ON cessions_lc (id_cession_inverse);
CREATE INDEX IF NOT EXISTS ix_cessions_lc_date_annulation
    ON cessions_lc (date_annulation);
