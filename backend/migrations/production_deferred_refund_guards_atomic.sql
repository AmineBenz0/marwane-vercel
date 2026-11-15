-- Release 4 Phase 5: date-aware credit limits for the Phase 2 commercial avoir ledger.
-- Candidate migration only: do NOT apply outside disposable CI until Phase 8 approval.
-- Apply exactly once, transactionally, AFTER production_deferred_avoirs_atomic.sql:
--   psql -v ON_ERROR_STOP=1 -1 -f migrations/production_deferred_refund_guards_atomic.sql
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $preflight$
BEGIN
 IF to_regclass('public.avoirs_livraison_differee') IS NULL
    OR to_regclass('public.correction_operations') IS NULL
    OR to_regprocedure('public.credit_transaction_capacity(integer,date,boolean)') IS NULL
    OR to_regprocedure('public.protect_refund_settlement()') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
   RAISE EXCEPTION 'Release 4 Phase 5 requires the full Release 3 and Phase 2 ledgers';
 END IF;
END $preflight$;

-- The original negotiated sale is immutable. A dated commercial avoir lowers
-- the sale's net value from its own effective business date forward, never
-- before that day. Later credit notes and payments must also be included
-- when bounding a backdated transfer/refund to avoid double consumption.
CREATE OR REPLACE FUNCTION public.credit_transaction_capacity(
  tx integer, day date, want_credit boolean
) RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog AS $fn$
 WITH events AS (
   SELECT
     CASE WHEN p.type_paiement='cheque'
       THEN coalesce(p.date_encaissement_effective,p.date_paiement)
       ELSE p.date_paiement END AS event_date,
     CASE WHEN p.nature IN ('remboursement','credit_transfere')
       THEN -p.montant ELSE p.montant END AS delta
   FROM public.paiements p
   WHERE p.id_transaction=tx AND p.statut='valide'
     AND (p.type_paiement<>'cheque' OR p.statut_cheque='encaisse')
   UNION ALL
   SELECT a.date_effet AS event_date, a.montant_avoir AS delta
   FROM public.avoirs_livraison_differee a WHERE a.id_transaction=tx
 ), dates AS (
   SELECT day AS event_date
   UNION
   SELECT e.event_date FROM events e WHERE e.event_date>day
 ), balances AS (
   SELECT
     (
       (SELECT coalesce(sum(e.delta),0) FROM events e WHERE e.event_date<=d.event_date)
       - t.montant_total
     ) * CASE WHEN want_credit THEN 1 ELSE -1 END AS balance
   FROM dates d CROSS JOIN public.transactions t WHERE t.id_transaction=tx
 )
 SELECT coalesce(min(balance),0) FROM balances;
$fn$;

-- A commercial credit is not physical money: only effective cash/bank
-- receipts (including actually cashed cheques) net of earlier refunds can
-- fund an outgoing cash/bank refund. LC assets, paired compensation credits,
-- unrelated party advances and rejected instruments cannot be cashed out.
CREATE FUNCTION public.refund_monetary_capacity(
  tx integer, day date
) RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog AS $fn$
 WITH events AS (
   SELECT
     CASE WHEN p.type_paiement='cheque'
       THEN coalesce(p.date_encaissement_effective,p.date_paiement)
       ELSE p.date_paiement END AS event_date,
     CASE WHEN p.nature='remboursement' THEN -p.montant ELSE p.montant END AS delta
   FROM public.paiements p
   WHERE p.id_transaction=tx AND p.statut='valide'
     AND p.nature IN ('paiement','remboursement')
     AND p.type_paiement IN ('cash','virement','cheque')
     AND (p.type_paiement<>'cheque' OR p.statut_cheque='encaisse')
 ), dates AS (
   SELECT day AS event_date
   UNION
   SELECT e.event_date FROM events e WHERE e.event_date>day
 ), balances AS (
   SELECT (SELECT coalesce(sum(e.delta),0) FROM events e WHERE e.event_date<=d.event_date)
     AS balance
   FROM dates d
 )
 SELECT coalesce(min(balance),0) FROM balances;
$fn$;

-- Preserve the existing immutable refund identity, status/void and instrument
-- safeguards. Only replace the old gross-sale monetary bound with the same
-- dated net-credit and monetary-provenance limits enforced in Python.
CREATE OR REPLACE FUNCTION public.protect_refund_settlement() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
 parent public.transactions%ROWTYPE;
 net_available numeric;
 cash_available numeric;
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.nature='remboursement' THEN
     RAISE EXCEPTION 'Refund history cannot be deleted';
   END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
   IF OLD.nature IS DISTINCT FROM NEW.nature THEN
     RAISE EXCEPTION 'Settlement nature is immutable';
   END IF;
   IF OLD.nature='remboursement' AND (
     OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
     OR OLD.montant IS DISTINCT FROM NEW.montant
     OR OLD.date_paiement IS DISTINCT FROM NEW.date_paiement
     OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
     OR OLD.id_compte IS DISTINCT FROM NEW.id_compte
     OR OLD.source_reglement IS DISTINCT FROM NEW.source_reglement
     OR OLD.id_lc IS DISTINCT FROM NEW.id_lc
     OR OLD.notes IS DISTINCT FROM NEW.notes
     OR OLD.cle_idempotence IS DISTINCT FROM NEW.cle_idempotence
     OR OLD.id_utilisateur_creation IS DISTINCT FROM NEW.id_utilisateur_creation
     OR (OLD.statut='annule' AND NEW.statut <> 'annule')
   ) THEN
     RAISE EXCEPTION 'Refund values are immutable; void and replace erroneous records';
   END IF;
   RETURN NEW;
 END IF;
 IF NEW.nature<>'remboursement' THEN RETURN NEW; END IF;

 SELECT * INTO parent FROM public.transactions
   WHERE id_transaction=NEW.id_transaction FOR UPDATE;
 IF NOT FOUND OR NOT parent.est_actif
    OR NEW.date_paiement<parent.date_transaction
    OR NEW.date_paiement>(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Casablanca')::date THEN
   RAISE EXCEPTION 'Refund requires an active transaction and valid effective date';
 END IF;
 -- Keep the existing Release 2/3 policy: instrument-linked refunds need their
 -- dedicated dependency workflow even if a cheque is cashed or cash also exists.
 -- This prevents an LC/cheque correction from silently invalidating a refund.
 IF EXISTS(
   SELECT 1 FROM public.paiements p
   WHERE p.id_transaction=NEW.id_transaction AND p.statut<>'annule'
     AND (p.type_paiement IN ('cheque','lc') OR p.id_lc IS NOT NULL)
 ) THEN
   RAISE EXCEPTION 'Instrument settlement requires its dedicated dependency workflow';
 END IF;

 net_available := public.credit_transaction_capacity(
   NEW.id_transaction,NEW.date_paiement,true
 );
 cash_available := public.refund_monetary_capacity(
   NEW.id_transaction,NEW.date_paiement
 );
 IF NEW.montant>greatest(0,least(coalesce(net_available,0),coalesce(cash_available,0))) THEN
   RAISE EXCEPTION 'Refund exceeds available dated, cash-backed transaction credit';
 END IF;
 RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.credit_transaction_capacity(integer,date,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_monetary_capacity(integer,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_refund_settlement() FROM PUBLIC;
-- Supabase grants API roles direct EXECUTE privileges on new functions.
-- Bare PostgreSQL test databases need not contain those roles.
DO $revoke_browser_function_exec$
DECLARE exposed_role text;
BEGIN
  FOR exposed_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.credit_transaction_capacity(integer,date,boolean) FROM %I', exposed_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.refund_monetary_capacity(integer,date) FROM %I', exposed_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.protect_refund_settlement() FROM %I', exposed_role);
  END LOOP;
END $revoke_browser_function_exec$;

GRANT EXECUTE ON FUNCTION public.credit_transaction_capacity(integer,date,boolean) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.refund_monetary_capacity(integer,date) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.protect_refund_settlement() TO app_runtime;

DO $postflight$
BEGIN
 IF to_regprocedure('public.refund_monetary_capacity(integer,date)') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid='public.paiements'::regclass
        AND tgname='protect_refund_settlement' AND tgenabled IN ('O','A')
    )
    OR NOT has_function_privilege(
      'app_runtime','public.refund_monetary_capacity(integer,date)','EXECUTE'
    ) THEN
   RAISE EXCEPTION 'Phase 5 refund credit guard or permissions missing';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   IF has_function_privilege('anon','public.refund_monetary_capacity(integer,date)','EXECUTE') THEN
     RAISE EXCEPTION 'Phase 5 must not expose refund capacity to the anonymous API';
   END IF;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   IF has_function_privilege('authenticated','public.refund_monetary_capacity(integer,date)','EXECUTE') THEN
     RAISE EXCEPTION 'Phase 5 must not expose refund capacity to browser roles';
   END IF;
 END IF;
END $postflight$;
