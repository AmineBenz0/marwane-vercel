-- Phase 8: independent-lot triggers use fully qualified public table names.
-- Pin resolution to PostgreSQL's catalog; no trigger logic or data is changed.
-- Applies to security-invoker functions already installed by lot migration.
ALTER FUNCTION public.guard_independent_cycle_snapshot()
  SET search_path = '';
ALTER FUNCTION public.sync_independent_lot_to_cycle()
  SET search_path = '';
ALTER FUNCTION public.assert_independent_lot_has_cycle()
  SET search_path = '';
