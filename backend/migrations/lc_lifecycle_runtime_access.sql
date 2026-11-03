-- Limit LC usage history access to the application runtime. Usage events are
-- append-only except for their cancellation fields.
ALTER TABLE public.utilisations_lettre_credit ENABLE ROW LEVEL SECURITY;
DO $lc_permissions$
BEGIN
  REVOKE ALL ON public.utilisations_lettre_credit FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.utilisations_lettre_credit FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.utilisations_lettre_credit FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT ON public.utilisations_lettre_credit TO app_runtime;
    GRANT UPDATE (statut, motif_annulation) ON public.utilisations_lettre_credit TO app_runtime;
    GRANT USAGE, SELECT ON SEQUENCE public.utilisations_lettre_credit_id_utilisation_seq TO app_runtime;
    DROP POLICY IF EXISTS lc_usage_runtime_access ON public.utilisations_lettre_credit;
    CREATE POLICY lc_usage_runtime_access ON public.utilisations_lettre_credit
      FOR ALL TO app_runtime USING (true) WITH CHECK (true);
  END IF;
END $lc_permissions$;
