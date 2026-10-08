-- Shared arrival lots; safe to replay on an existing SQL-managed database.
-- Run with the maintenance connection before deploying the shared-lot release.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.lots_production (
    id_lot SERIAL PRIMARY KEY,
    nom_lot VARCHAR(100) NOT NULL,
    souche VARCHAR(100),
    date_debut DATE NOT NULL,
    age_depart_semaines INTEGER NOT NULL DEFAULT 0,
    effectif_initial INTEGER,
    duree_semaines INTEGER NOT NULL DEFAULT 100,
    date_fin_prevue DATE NOT NULL,
    date_fin_reelle DATE,
    statut VARCHAR(30) NOT NULL DEFAULT 'actif',
    notes TEXT,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_utilisateur_creation INTEGER REFERENCES public.utilisateurs(id_utilisateur),
    id_utilisateur_modification INTEGER REFERENCES public.utilisateurs(id_utilisateur)
);
ALTER TABLE public.cycles_production ADD COLUMN IF NOT EXISTS id_lot INTEGER;
DO $migration$
DECLARE old_cycle RECORD; new_lot INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.cycles_production'::regclass AND conname = 'fk_cycles_production_lot') THEN
        ALTER TABLE public.cycles_production ADD CONSTRAINT fk_cycles_production_lot
            FOREIGN KEY (id_lot) REFERENCES public.lots_production(id_lot);
    END IF;
    -- Never guess which historical buildings shared an arrival.
    -- Each existing cycle becomes its own parent, keeping all original record IDs.
    FOR old_cycle IN SELECT * FROM public.cycles_production WHERE id_lot IS NULL ORDER BY id_cycle
    LOOP
        INSERT INTO public.lots_production (
            nom_lot, souche, date_debut, age_depart_semaines, effectif_initial,
            duree_semaines, date_fin_prevue, date_fin_reelle, statut, notes,
            date_creation, date_modification, id_utilisateur_creation, id_utilisateur_modification
        ) VALUES (
            old_cycle.nom_cycle, old_cycle.souche, old_cycle.date_debut,
            old_cycle.age_depart_semaines, old_cycle.effectif_initial, old_cycle.duree_semaines,
            old_cycle.date_fin_prevue, old_cycle.date_fin_reelle,
            CASE WHEN old_cycle.statut = 'a_cloturer' THEN 'actif' ELSE old_cycle.statut END,
            old_cycle.notes, old_cycle.date_creation, old_cycle.date_modification,
            old_cycle.id_utilisateur_creation, old_cycle.id_utilisateur_modification
        ) RETURNING id_lot INTO new_lot;
        UPDATE public.cycles_production SET id_lot = new_lot,
            statut = CASE WHEN statut = 'a_cloturer' THEN 'actif' ELSE statut END
            WHERE id_cycle = old_cycle.id_cycle;
    END LOOP;
END $migration$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cycle_lot_batiment ON public.cycles_production(id_lot, id_batiment);
CREATE INDEX IF NOT EXISTS ix_cycles_production_id_lot ON public.cycles_production(id_lot);
CREATE INDEX IF NOT EXISTS ix_lots_production_date_debut ON public.lots_production(date_debut);
CREATE INDEX IF NOT EXISTS ix_lots_production_statut ON public.lots_production(statut);
CREATE INDEX IF NOT EXISTS ix_lots_production_id_lot ON public.lots_production(id_lot);

ALTER TABLE public.lots_production ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lots_production FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.lots_production_id_lot_seq FROM PUBLIC;
DO $security$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON public.lots_production FROM anon;
        REVOKE ALL ON SEQUENCE public.lots_production_id_lot_seq FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON public.lots_production FROM authenticated;
        REVOKE ALL ON SEQUENCE public.lots_production_id_lot_seq FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        GRANT SELECT, INSERT, UPDATE ON public.lots_production TO app_runtime;
        GRANT USAGE, SELECT ON SEQUENCE public.lots_production_id_lot_seq TO app_runtime;
        DROP POLICY IF EXISTS app_runtime_access ON public.lots_production;
        CREATE POLICY app_runtime_access ON public.lots_production
            FOR ALL TO app_runtime USING (true) WITH CHECK (true);
    END IF;
END $security$;
COMMIT;
