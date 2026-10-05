-- Keep LC state to available/used while preserving cessions through linked reversals.
ALTER TABLE lettres_credit
    ADD COLUMN IF NOT EXISTS version_utilisation INTEGER NOT NULL DEFAULT 0;

ALTER TABLE cessions_lc
    ADD COLUMN IF NOT EXISTS id_cession_origine INTEGER;

UPDATE cessions_lc AS reversal
SET id_cession_origine = original.id_cession
FROM cessions_lc AS original
WHERE original.id_cession_inverse = reversal.id_cession
  AND reversal.id_cession_inverse = original.id_cession;

UPDATE lettres_credit AS lc
SET statut = CASE WHEN
    EXISTS (
        SELECT 1 FROM paiements p
        WHERE p.id_lc = lc.id_lc AND p.statut <> 'annule'
    ) OR EXISTS (
        SELECT 1 FROM mouvements_bancaires mb
        WHERE mb.source = 'lc'
          AND mb.reference = lc.numero_reference
          AND mb.statut = 'active'
    ) OR EXISTS (
        SELECT 1 FROM cessions_lc c
        WHERE c.id_lc = lc.id_lc
          AND c.id_cession_origine IS NULL
          AND c.statut = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM cessions_lc r
              WHERE r.id_cession_origine = c.id_cession
          )
    ) THEN 'utilisee' ELSE 'active' END;

UPDATE lettres_credit SET version_utilisation = 1 WHERE statut = 'utilisee';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_cessions_lc_origine'
    ) THEN
        ALTER TABLE cessions_lc
            ADD CONSTRAINT fk_cessions_lc_origine
            FOREIGN KEY (id_cession_origine)
            REFERENCES cessions_lc (id_cession)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cessions_lc_one_reversal
    ON cessions_lc (id_cession_origine);

ALTER TABLE lettres_credit DROP CONSTRAINT IF EXISTS check_lc_statut_valide;
ALTER TABLE lettres_credit ADD CONSTRAINT check_lc_statut_valide
    CHECK (statut IN ('active', 'utilisee'));

ALTER TABLE cessions_lc
    DROP CONSTRAINT IF EXISTS fk_cessions_lc_utilisateur_annulation,
    DROP CONSTRAINT IF EXISTS fk_cessions_lc_inverse,
    DROP CONSTRAINT IF EXISTS check_cessions_lc_statut_valide;

DROP INDEX IF EXISTS ix_cessions_lc_date_annulation;
DROP INDEX IF EXISTS ix_cessions_lc_id_cession_inverse;

ALTER TABLE cessions_lc
    DROP COLUMN IF EXISTS id_utilisateur_annulation,
    DROP COLUMN IF EXISTS date_annulation,
    DROP COLUMN IF EXISTS motif_annulation,
    DROP COLUMN IF EXISTS id_cession_inverse,
    DROP COLUMN IF EXISTS statut;
