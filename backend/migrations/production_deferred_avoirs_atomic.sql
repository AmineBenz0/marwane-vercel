-- Release 4 Phase 2: append-only commercial credit-note foundation.
-- CANDIDATE ONLY. Do not apply to staging or production until Phase 8 approval.
-- Apply as ONE transaction against the exact Release 3 production baseline:
--   psql -v ON_ERROR_STOP=1 -1 -f migrations/production_deferred_avoirs_atomic.sql
-- Requires audited operations, app_runtime and the Release 3 financial guards.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $preflight$
BEGIN
  IF to_regclass('public.transactions') IS NULL
     OR to_regclass('public.clients') IS NULL
     OR to_regclass('public.utilisateurs') IS NULL
     OR to_regclass('public.correction_operations') IS NULL
     OR to_regclass('public.utilisations_lettre_credit') IS NULL
     OR to_regprocedure('public.protect_financial_identity()') IS NULL
     OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
    RAISE EXCEPTION 'Release 4 requires the complete Release 3 financial baseline';
  END IF;
  IF to_regclass('public.avoirs_livraison_differee') IS NOT NULL THEN
    RAISE EXCEPTION 'Release 4 commercial ledger already exists; reconcile migration history';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions'
      AND column_name='quantite_annulee'
  ) THEN
    RAISE EXCEPTION 'Release 4 requires the production deferred-sale quantity foundation';
  END IF;
  -- Some older staging environments have a canceled/deactivated historical
  -- QA sale recorded before commercial credits existed. Preserve that inactive
  -- and unpaid history WITHOUT inventing a backdated financial credit.
  -- Every other legacy cancellation still fails closed until reconciled.
  IF EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.quantite_annulee <> 0 AND (
      t.quantite_annulee < 0 OR t.quantite_annulee > t.quantite
      OR t.quantite <= 0 OR t.est_actif IS DISTINCT FROM false
      OR t.est_promesse IS DISTINCT FROM true
      OR t.allocation_automatique IS DISTINCT FROM true
      OR t.id_client IS NULL OR t.id_fournisseur IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.paiements p WHERE p.id_transaction=t.id_transaction
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.transactions_audit h
        WHERE h.id_transaction=t.id_transaction
          AND h.champ_modifie='annulation_reste_livraison_differee'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Unreconciled historic canceled sale: never invent financial avoirs';
  END IF;
END $preflight$;

-- Frozen evidence of OLD, inactive, unpaid cancellations. Not an avoir.
-- Keep an immutable full source snapshot, so neither sale terms nor canceled
-- stock can be edited/reactivated to bypass the new financial contract.
CREATE TABLE public.legacy_deferred_cancellations (
  id_transaction integer PRIMARY KEY,
  historical_canceled_qty integer NOT NULL CHECK (historical_canceled_qty > 0),
  original_row jsonb NOT NULL,
  preserved_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.legacy_deferred_cancellations(
  id_transaction, historical_canceled_qty, original_row
)
SELECT t.id_transaction, t.quantite_annulee, to_jsonb(t)
FROM public.transactions t
WHERE t.quantite_annulee > 0;

CREATE TABLE public.avoirs_livraison_differee (
  id_avoir uuid PRIMARY KEY REFERENCES public.correction_operations(operation_id)
    DEFERRABLE INITIALLY DEFERRED,
  id_transaction integer NOT NULL REFERENCES public.transactions(id_transaction) ON DELETE RESTRICT,
  id_client integer NOT NULL REFERENCES public.clients(id_client) ON DELETE RESTRICT,
  id_utilisateur_creation integer NOT NULL REFERENCES public.utilisateurs(id_utilisateur) ON DELETE RESTRICT,
  date_effet date NOT NULL,
  date_creation timestamptz NOT NULL DEFAULT now(),
  quantite_initiale integer NOT NULL,
  montant_initial numeric(15,2) NOT NULL,
  quantite_annulee_avant integer NOT NULL,
  quantite_annulee integer NOT NULL,
  quantite_annulee_cumulee integer NOT NULL,
  avoir_cumule_avant numeric(15,2) NOT NULL,
  montant_avoir numeric(15,2) NOT NULL,
  avoir_cumule numeric(15,2) NOT NULL,
  CONSTRAINT ck_avoir_q_initiale CHECK (quantite_initiale > 0),
  CONSTRAINT ck_avoir_m_initial CHECK (montant_initial > 0),
  CONSTRAINT ck_avoir_qty CHECK (quantite_annulee > 0 AND quantite_annulee_avant >= 0
    AND quantite_annulee_cumulee = quantite_annulee_avant + quantite_annulee
    AND quantite_annulee_cumulee <= quantite_initiale),
  CONSTRAINT ck_avoir_m CHECK (montant_avoir >= 0 AND avoir_cumule_avant >= 0
    AND avoir_cumule = avoir_cumule_avant + montant_avoir
    AND avoir_cumule <= montant_initial),
  CONSTRAINT uq_avoir_chain UNIQUE (id_transaction, quantite_annulee_cumulee)
);
CREATE INDEX ix_avoirs_livraison_transaction_date
  ON public.avoirs_livraison_differee(id_transaction, date_effet, date_creation);

-- Integrity is enforced by an invoker trigger, not an exposed definer RPC.
-- Operation journal rows MUST be inserted before the matching avoir.
CREATE FUNCTION public.verify_deferred_avoir_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
  sale public.transactions%ROWTYPE;
  op public.correction_operations%ROWTYPE;
  already_qty integer;
  already_amount numeric(15,2);
  last_effective_date date;
BEGIN
  IF EXISTS(SELECT 1 FROM public.avoirs_livraison_differee WHERE id_avoir=NEW.id_avoir) THEN
    RAISE EXCEPTION 'Avoir already recorded for this operation';
  END IF;
  SELECT * INTO sale FROM public.transactions
    WHERE id_transaction=NEW.id_transaction FOR UPDATE;
  IF NOT FOUND OR NOT sale.est_promesse OR NOT sale.est_actif
     OR NOT sale.allocation_automatique OR sale.id_client IS NULL
     OR sale.id_fournisseur IS NOT NULL OR sale.id_batiment IS NULL
     OR sale.id_produit IS NULL THEN
    RAISE EXCEPTION 'Avoir requires an active, automatically allocated deferred customer egg sale';
  END IF;
  IF NEW.id_client IS DISTINCT FROM sale.id_client
     OR NEW.quantite_initiale IS DISTINCT FROM sale.quantite
     OR NEW.montant_initial IS DISTINCT FROM sale.montant_total
     OR NEW.date_effet < sale.date_transaction THEN
    RAISE EXCEPTION 'Avoir sale identity, original terms or effective date mismatch';
  END IF;
  SELECT * INTO op FROM public.correction_operations WHERE operation_id=NEW.id_avoir;
  IF NOT FOUND OR op.id_utilisateur IS DISTINCT FROM NEW.id_utilisateur_creation
    OR op.request_payload->>'kind' IS DISTINCT FROM 'deferred_avoir'
    OR op.request_payload->>'action' IS DISTINCT FROM 'cancel_unallocated'
    OR op.request_payload->>'transaction_id' IS DISTINCT FROM NEW.id_transaction::text
    OR op.request_payload->>'cancel_quantity' IS DISTINCT FROM NEW.quantite_annulee::text
    OR op.request_payload->>'effective_date' IS DISTINCT FROM NEW.date_effet::text
    OR op.result_payload->>'adjustment_amount' IS DISTINCT FROM NEW.montant_avoir::text
    OR op.result_payload->>'cumulative_canceled' IS DISTINCT FROM NEW.quantite_annulee_cumulee::text THEN
    RAISE EXCEPTION 'Avoir must match an immutable audited cancellation operation';
  END IF;
  SELECT coalesce(sum(quantite_annulee),0), coalesce(sum(montant_avoir),0)
    INTO already_qty, already_amount
    FROM public.avoirs_livraison_differee WHERE id_transaction=NEW.id_transaction;
  IF already_qty IS DISTINCT FROM NEW.quantite_annulee_avant
    OR already_amount IS DISTINCT FROM NEW.avoir_cumule_avant THEN
    RAISE EXCEPTION 'Avoir chain is stale or out of order';
  END IF;
  SELECT max(date_effet) INTO last_effective_date FROM public.avoirs_livraison_differee
    WHERE id_transaction=NEW.id_transaction;
  IF last_effective_date IS NOT NULL AND NEW.date_effet < last_effective_date THEN
    RAISE EXCEPTION 'Avoir cannot be posted before an earlier cancellation date';
  END IF;
  -- PostgreSQL numeric round(,2) is half away from zero on positive amounts,
  -- matching the Phase 1 Decimal ROUND_HALF_UP contract.
  IF NEW.avoir_cumule_avant IS DISTINCT FROM
       round(NEW.montant_initial * NEW.quantite_annulee_avant / NEW.quantite_initiale,2)
     OR NEW.avoir_cumule IS DISTINCT FROM
       round(NEW.montant_initial * NEW.quantite_annulee_cumulee / NEW.quantite_initiale,2) THEN
    RAISE EXCEPTION 'Avoir does not respect the negotiated sale total and cumulative rounding';
  END IF;
  -- The server, not request JSON, is the source of the creation timestamp.
  NEW.date_creation := now();
  RETURN NEW;
END $fn$;

CREATE FUNCTION public.verify_deferred_avoir_parity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
  tx_id integer;
  sale public.transactions%ROWTYPE;
  qty integer;
  amount numeric(15,2);
  max_qty integer;
  max_amount numeric(15,2);
BEGIN
  tx_id := CASE WHEN TG_TABLE_NAME='transactions' THEN NEW.id_transaction ELSE NEW.id_transaction END;
  SELECT * INTO sale FROM public.transactions WHERE id_transaction=tx_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avoir transaction vanished'; END IF;

  -- Only migrations can insert these snapshotted, legacy exceptions. They
  -- were historical *inactive and unpaid* closures, NOT commercial credits.
  -- All fields must remain identical, and no new credit note can attach.
  IF EXISTS (
    SELECT 1 FROM public.legacy_deferred_cancellations b
    WHERE b.id_transaction=tx_id
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.legacy_deferred_cancellations b
      WHERE b.id_transaction=tx_id
        AND b.original_row=to_jsonb(sale)
        AND b.historical_canceled_qty=sale.quantite_annulee
    ) OR EXISTS (
      SELECT 1 FROM public.avoirs_livraison_differee a
      WHERE a.id_transaction=tx_id
    ) THEN
      RAISE EXCEPTION 'Frozen historical cancellation cannot change or acquire a new avoir';
    END IF;
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(quantite_annulee),0), coalesce(sum(montant_avoir),0),
     coalesce(max(quantite_annulee_cumulee),0), coalesce(max(avoir_cumule),0)
    INTO qty,amount,max_qty,max_amount
    FROM public.avoirs_livraison_differee WHERE id_transaction=tx_id;
  IF sale.quantite_annulee IS DISTINCT FROM qty OR max_qty IS DISTINCT FROM qty
    OR max_amount IS DISTINCT FROM amount
    OR amount IS DISTINCT FROM
        round(sale.montant_total * qty / sale.quantite,2)
    OR qty > sale.quantite
    OR (qty > 0 AND (NOT sale.est_actif OR NOT sale.est_promesse
                    OR NOT sale.allocation_automatique))
    OR EXISTS (
       SELECT 1 FROM public.avoirs_livraison_differee a
       WHERE a.id_transaction=tx_id AND (
         a.quantite_initiale IS DISTINCT FROM sale.quantite
         OR a.montant_initial IS DISTINCT FROM sale.montant_total
         OR a.id_client IS DISTINCT FROM sale.id_client
         OR a.date_effet < sale.date_transaction
       )
    ) THEN
    RAISE EXCEPTION 'Deferred stock cancellation and commercial avoir must post atomically';
  END IF;
  RETURN NULL;
END $fn$;

-- Do not attach a PostgreSQL FK from the historical snapshot to the
-- transactions table: the independent-lot migration test drops/recreates
-- application tables in an otherwise empty disposable database. Instead
-- enforce the same referential protection at *runtime* with a transaction
-- DELETE trigger and verify every legacy transaction UPDATE at commit.
CREATE FUNCTION public.protect_legacy_deferred_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.legacy_deferred_cancellations b
    WHERE b.id_transaction=OLD.id_transaction
  ) THEN
    RAISE EXCEPTION 'Archived legacy canceled sale cannot be deleted';
  END IF;
  RETURN OLD;
END $fn$;
CREATE TRIGGER trg_legacy_deferred_transaction_delete
  BEFORE DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_legacy_deferred_delete();

-- Immutable historical exception markers are NOT payments or credits.
-- They are readable by the backend only for audit and preflight.
CREATE TRIGGER trg_legacy_deferred_cancel_immutable
  BEFORE UPDATE OR DELETE ON public.legacy_deferred_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.reject_correction_history_mutation();
CREATE TRIGGER trg_legacy_deferred_cancel_no_truncate
  BEFORE TRUNCATE ON public.legacy_deferred_cancellations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_correction_history_mutation();

-- Prevent UPDATE/DELETE/TRUNCATE even by table owners in ordinary SQL.
CREATE TRIGGER trg_deferred_avoir_immutable
  BEFORE UPDATE OR DELETE ON public.avoirs_livraison_differee
  FOR EACH ROW EXECUTE FUNCTION public.reject_correction_history_mutation();
CREATE TRIGGER trg_deferred_avoir_no_truncate
  BEFORE TRUNCATE ON public.avoirs_livraison_differee
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_correction_history_mutation();
CREATE TRIGGER trg_deferred_avoir_validate
  BEFORE INSERT ON public.avoirs_livraison_differee
  FOR EACH ROW EXECUTE FUNCTION public.verify_deferred_avoir_insert();
-- Transaction and avoir are written together; run parity checks at commit.
CREATE CONSTRAINT TRIGGER trg_deferred_avoir_parity
  AFTER INSERT ON public.avoirs_livraison_differee
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.verify_deferred_avoir_parity();
CREATE CONSTRAINT TRIGGER trg_deferred_transaction_parity
  AFTER INSERT OR UPDATE OF quantite_annulee, quantite, montant_total,
    id_client, est_promesse, allocation_automatique, date_transaction, est_actif
  ON public.transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.verify_deferred_avoir_parity();
-- Existing inactive legacy rows are frozen in full, not only the financial
-- fields listed above. Check all UPDATEs, including metadata and row_version.
CREATE CONSTRAINT TRIGGER trg_deferred_legacy_transaction_snapshot
  AFTER UPDATE ON public.transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.quantite_annulee > 0)
  EXECUTE FUNCTION public.verify_deferred_avoir_parity();
REVOKE ALL ON FUNCTION public.protect_legacy_deferred_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_legacy_deferred_delete() TO app_runtime;

-- Closed historical sale snapshots must not be exposed to browsers.
ALTER TABLE public.legacy_deferred_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_deferred_cancellations FROM PUBLIC;
DO $legacy_roles$
DECLARE exposed text;
BEGIN
  FOR exposed IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.legacy_deferred_cancellations FROM %I',exposed);
  END LOOP;
END $legacy_roles$;
REVOKE ALL ON public.legacy_deferred_cancellations FROM app_runtime;
GRANT SELECT ON public.legacy_deferred_cancellations TO app_runtime;
CREATE POLICY legacy_deferred_cancel_runtime_read ON public.legacy_deferred_cancellations
  FOR SELECT TO app_runtime USING (true);

-- No browser roles may access this financial journal directly.
ALTER TABLE public.avoirs_livraison_differee ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avoirs_livraison_differee FROM PUBLIC;
DO $roles$
DECLARE exposed text;
BEGIN
  FOR exposed IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.avoirs_livraison_differee FROM %I',exposed);
  END LOOP;
END $roles$;
REVOKE ALL ON public.avoirs_livraison_differee FROM app_runtime;
GRANT SELECT, INSERT ON public.avoirs_livraison_differee TO app_runtime;
CREATE POLICY deferred_avoir_runtime_read ON public.avoirs_livraison_differee
  FOR SELECT TO app_runtime USING (true);
CREATE POLICY deferred_avoir_runtime_insert ON public.avoirs_livraison_differee
  FOR INSERT TO app_runtime WITH CHECK (true);

REVOKE ALL ON FUNCTION public.verify_deferred_avoir_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_deferred_avoir_parity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_deferred_avoir_insert() TO app_runtime;
GRANT EXECUTE ON FUNCTION public.verify_deferred_avoir_parity() TO app_runtime;

DO $postflight$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.avoirs_livraison_differee'::regclass)
    OR NOT has_table_privilege('app_runtime','public.avoirs_livraison_differee','SELECT')
    OR NOT has_table_privilege('app_runtime','public.avoirs_livraison_differee','INSERT')
    OR has_table_privilege('app_runtime','public.avoirs_livraison_differee','UPDATE')
    OR has_table_privilege('app_runtime','public.avoirs_livraison_differee','DELETE')
    OR has_table_privilege('app_runtime','public.avoirs_livraison_differee','TRUNCATE')
    OR NOT has_table_privilege('app_runtime','public.legacy_deferred_cancellations','SELECT')
    OR has_table_privilege('app_runtime','public.legacy_deferred_cancellations','INSERT')
    OR has_table_privilege('app_runtime','public.legacy_deferred_cancellations','UPDATE')
    OR has_table_privilege('app_runtime','public.legacy_deferred_cancellations','DELETE')
    OR NOT (SELECT relrowsecurity FROM pg_class
       WHERE oid='public.legacy_deferred_cancellations'::regclass)
    OR NOT EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.transactions'::regclass
        AND tgname='trg_deferred_legacy_transaction_snapshot'
        AND tgenabled IN ('O','A'))
    OR NOT EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.transactions'::regclass
        AND tgname='trg_legacy_deferred_transaction_delete'
        AND tgenabled IN ('O','A'))
    THEN
    RAISE EXCEPTION 'Release 4 ledger / historical baseline permissions failed verification';
  END IF;
END $postflight$;
