-- Convert shared parent lots to a strict one-lot/one-building-cycle relation.
-- Run on the reviewed production/staging target with the maintenance connection.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.lots_production, public.cycles_production IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.independent_lot_migration_map (
    old_lot_id INTEGER NOT NULL,
    id_cycle INTEGER NOT NULL,
    new_lot_id INTEGER NOT NULL,
    action VARCHAR(30) NOT NULL,
    parent_snapshot_before JSONB NOT NULL,
    cycle_snapshot_before JSONB NOT NULL,
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (old_lot_id, id_cycle),
    UNIQUE (new_lot_id)
);

-- Stop instead of inventing a parent for an unlinked operational cycle or
-- silently dropping a lot with no operational cycle.
DO $preflight$
BEGIN
    IF EXISTS (SELECT 1 FROM public.cycles_production WHERE id_lot IS NULL) THEN
        RAISE EXCEPTION 'Independent-lot migration blocked: cycles_production contains parentless cycles.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.lots_production l
        LEFT JOIN public.cycles_production c ON c.id_lot = l.id_lot
        GROUP BY l.id_lot HAVING count(c.id_cycle) = 0
    ) THEN
        RAISE EXCEPTION 'Independent-lot migration blocked: lots_production contains lots without a cycle.';
    END IF;
END
$preflight$;

-- Split every shared parent. Preserve each cycle ID and all references to it.
-- Parent metadata is authoritative for name, strain, dates, age, duration,
-- status, and notes. The building cycle is authoritative for its own flock
-- count; for a one-cycle legacy parent only, use the parent count if the cycle
-- count is unknown. For a shared parent, never copy its aggregate into a child.
DO $split$
DECLARE
    parent_row RECORD;
    cycle_row RECORD;
    cycle_count INTEGER;
    ordinal INTEGER;
    resolved_flock INTEGER;
    independent_lot_id INTEGER;
BEGIN
    FOR parent_row IN
        SELECT l.*, count(c.id_cycle)::INTEGER AS child_count
        FROM public.lots_production l
        JOIN public.cycles_production c ON c.id_lot = l.id_lot
        GROUP BY l.id_lot
        ORDER BY l.id_lot
    LOOP
        cycle_count := parent_row.child_count;
        ordinal := 0;
        FOR cycle_row IN
            SELECT * FROM public.cycles_production
            WHERE id_lot = parent_row.id_lot
            ORDER BY id_cycle
        LOOP
            ordinal := ordinal + 1;
            IF cycle_count = 1 THEN
                resolved_flock := COALESCE(cycle_row.effectif_initial, parent_row.effectif_initial);
            ELSE
                resolved_flock := cycle_row.effectif_initial;
            END IF;

            IF ordinal = 1 THEN
                independent_lot_id := parent_row.id_lot;
                UPDATE public.lots_production
                SET effectif_initial = resolved_flock
                WHERE id_lot = independent_lot_id;
            ELSE
                INSERT INTO public.lots_production (
                    nom_lot, souche, date_debut, age_depart_semaines, effectif_initial,
                    duree_semaines, date_fin_prevue, date_fin_reelle, statut, notes,
                    date_creation, date_modification, id_utilisateur_creation, id_utilisateur_modification
                ) VALUES (
                    parent_row.nom_lot, parent_row.souche, parent_row.date_debut,
                    parent_row.age_depart_semaines, resolved_flock,
                    parent_row.duree_semaines, parent_row.date_fin_prevue,
                    parent_row.date_fin_reelle, parent_row.statut, parent_row.notes,
                    parent_row.date_creation, parent_row.date_modification,
                    parent_row.id_utilisateur_creation, parent_row.id_utilisateur_modification
                ) RETURNING id_lot INTO independent_lot_id;
            END IF;

            INSERT INTO public.independent_lot_migration_map (
                old_lot_id, id_cycle, new_lot_id, action,
                parent_snapshot_before, cycle_snapshot_before
            ) VALUES (
                parent_row.id_lot, cycle_row.id_cycle, independent_lot_id,
                CASE WHEN cycle_count > 1 THEN 'split_shared_parent' ELSE 'one_to_one' END,
                to_jsonb(parent_row) - 'child_count',
                to_jsonb(cycle_row)
            ) ON CONFLICT (old_lot_id, id_cycle) DO NOTHING;

            UPDATE public.cycles_production
            SET id_lot = independent_lot_id,
                nom_cycle = parent_row.nom_lot,
                souche = parent_row.souche,
                date_debut = parent_row.date_debut,
                age_depart_semaines = parent_row.age_depart_semaines,
                effectif_initial = resolved_flock,
                duree_semaines = parent_row.duree_semaines,
                date_fin_prevue = parent_row.date_fin_prevue,
                date_fin_reelle = parent_row.date_fin_reelle,
                statut = parent_row.statut,
                notes = parent_row.notes,
                id_utilisateur_modification = parent_row.id_utilisateur_modification
            WHERE id_cycle = cycle_row.id_cycle;
        END LOOP;
    END LOOP;
END
$split$;

DO $foreign_key$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.cycles_production'::regclass
          AND conname = 'fk_cycles_production_lot'
    ) THEN
        ALTER TABLE public.cycles_production
            ADD CONSTRAINT fk_cycles_production_lot
            FOREIGN KEY (id_lot) REFERENCES public.lots_production(id_lot)
            NOT VALID;
    END IF;
END
$foreign_key$;
ALTER TABLE public.cycles_production VALIDATE CONSTRAINT fk_cycles_production_lot;
ALTER TABLE public.cycles_production ALTER COLUMN id_lot SET NOT NULL;

DROP INDEX IF EXISTS public.uq_cycle_lot_batiment;
DROP INDEX IF EXISTS public.ix_cycles_production_id_lot;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cycles_production_id_lot
    ON public.cycles_production (id_lot);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cycles_production_one_active_per_building
    ON public.cycles_production (id_batiment)
    WHERE statut IN ('actif', 'a_cloturer');

-- A cycle snapshot can never be edited independently. Updates must go through
-- lots_production; parent updates copy all compatibility fields in this tx.
CREATE OR REPLACE FUNCTION public.guard_cycle_lot_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    parent_lot public.lots_production%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id_lot IS DISTINCT FROM OLD.id_lot
           OR NEW.id_batiment IS DISTINCT FROM OLD.id_batiment THEN
            RAISE EXCEPTION 'A cycle cannot be moved to another lot or building.';
        END IF;
        IF pg_trigger_depth() = 1 AND (
            NEW.nom_cycle IS DISTINCT FROM OLD.nom_cycle
            OR NEW.souche IS DISTINCT FROM OLD.souche
            OR NEW.date_debut IS DISTINCT FROM OLD.date_debut
            OR NEW.age_depart_semaines IS DISTINCT FROM OLD.age_depart_semaines
            OR NEW.effectif_initial IS DISTINCT FROM OLD.effectif_initial
            OR NEW.duree_semaines IS DISTINCT FROM OLD.duree_semaines
            OR NEW.date_fin_prevue IS DISTINCT FROM OLD.date_fin_prevue
            OR NEW.date_fin_reelle IS DISTINCT FROM OLD.date_fin_reelle
            OR NEW.statut IS DISTINCT FROM OLD.statut
            OR NEW.notes IS DISTINCT FROM OLD.notes
        ) THEN
            RAISE EXCEPTION 'Update lifecycle fields on lots_production, not the cycle snapshot.';
        END IF;
    END IF;

    SELECT * INTO parent_lot
    FROM public.lots_production
    WHERE id_lot = NEW.id_lot
    FOR KEY SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cycle requires an existing parent lot.';
    END IF;
    IF NEW.effectif_initial IS DISTINCT FROM parent_lot.effectif_initial
       AND TG_OP = 'INSERT' THEN
        RAISE EXCEPTION 'Lot and building cycle initial flock sizes must match.';
    END IF;

    NEW.nom_cycle := parent_lot.nom_lot;
    NEW.souche := parent_lot.souche;
    NEW.date_debut := parent_lot.date_debut;
    NEW.age_depart_semaines := parent_lot.age_depart_semaines;
    NEW.effectif_initial := parent_lot.effectif_initial;
    NEW.duree_semaines := parent_lot.duree_semaines;
    NEW.date_fin_prevue := parent_lot.date_fin_prevue;
    NEW.date_fin_reelle := parent_lot.date_fin_reelle;
    NEW.statut := parent_lot.statut;
    NEW.notes := parent_lot.notes;
    NEW.id_utilisateur_modification := parent_lot.id_utilisateur_modification;
    RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS cycles_production_guard_lot_snapshot ON public.cycles_production;
CREATE TRIGGER cycles_production_guard_lot_snapshot
BEFORE INSERT OR UPDATE ON public.cycles_production
FOR EACH ROW EXECUTE FUNCTION public.guard_cycle_lot_snapshot();

CREATE OR REPLACE FUNCTION public.sync_lot_metadata_to_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE public.cycles_production
    SET nom_cycle = NEW.nom_lot,
        souche = NEW.souche,
        date_debut = NEW.date_debut,
        age_depart_semaines = NEW.age_depart_semaines,
        effectif_initial = NEW.effectif_initial,
        duree_semaines = NEW.duree_semaines,
        date_fin_prevue = NEW.date_fin_prevue,
        date_fin_reelle = NEW.date_fin_reelle,
        statut = NEW.statut,
        notes = NEW.notes,
        id_utilisateur_modification = NEW.id_utilisateur_modification
    WHERE id_lot = NEW.id_lot;
    RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS lots_production_sync_cycle ON public.lots_production;
CREATE TRIGGER lots_production_sync_cycle
AFTER UPDATE OF nom_lot, souche, date_debut, age_depart_semaines,
    effectif_initial, duree_semaines, date_fin_prevue, date_fin_reelle,
    statut, notes, id_utilisateur_modification
ON public.lots_production
FOR EACH ROW EXECUTE FUNCTION public.sync_lot_metadata_to_cycle();

-- A deferred constraint trigger permits parent+cycle creation in one tx but
-- rejects committing either side without exactly one counterpart.
CREATE OR REPLACE FUNCTION public.assert_lot_has_exactly_one_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    target_lot_id INTEGER;
    child_count INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'lots_production' THEN
        target_lot_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id_lot ELSE NEW.id_lot END;
    ELSE
        target_lot_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id_lot ELSE NEW.id_lot END;
    END IF;
    IF target_lot_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.lots_production WHERE id_lot = target_lot_id
    ) THEN
        RETURN NULL;
    END IF;
    SELECT count(*) INTO child_count
    FROM public.cycles_production WHERE id_lot = target_lot_id;
    IF child_count <> 1 THEN
        RAISE EXCEPTION 'Each production lot must have exactly one building cycle (lot id % has %).',
            target_lot_id, child_count;
    END IF;
    RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS lots_production_exactly_one_cycle ON public.lots_production;
CREATE CONSTRAINT TRIGGER lots_production_exactly_one_cycle
AFTER INSERT OR UPDATE OR DELETE ON public.lots_production
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_lot_has_exactly_one_cycle();

DROP TRIGGER IF EXISTS cycles_production_exactly_one_lot ON public.cycles_production;
CREATE CONSTRAINT TRIGGER cycles_production_exactly_one_lot
AFTER INSERT OR UPDATE OR DELETE ON public.cycles_production
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_lot_has_exactly_one_cycle();

ALTER TABLE public.independent_lot_migration_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.independent_lot_migration_map FROM PUBLIC;
DO $permissions$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON public.independent_lot_migration_map FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON public.independent_lot_migration_map FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        REVOKE ALL ON public.independent_lot_migration_map FROM app_runtime;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON public.independent_lot_migration_map FROM service_role;
    END IF;
END
$permissions$;

COMMIT;
