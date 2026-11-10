-- Release 3: ONE atomic, production-based cheque and LC lifecycle upgrade.
-- Assumes production Release 1 audited corrections and Release 2 credit/refunds
-- are already installed. Reuses staging-tested instrument guards, preserving
-- active refund, credit, cash and bank constraints.
-- Run only in a transaction (psql -1 / Supabase apply_migration).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
DO $release3_preflight$
BEGIN
  IF to_regclass('public.correction_operations') IS NULL
     OR to_regclass('public.entity_revisions') IS NULL
     OR to_regclass('public.avances') IS NULL
     OR to_regclass('public.affectations_credit') IS NULL
     OR to_regclass('public.lettres_credit') IS NULL
     OR to_regclass('public.paiements') IS NULL
     OR to_regclass('public.cessions_lc') IS NULL
     OR to_regclass('public.mouvements_bancaires') IS NULL
     OR to_regprocedure('public.protect_financial_identity()') IS NULL
     OR to_regprocedure('public.protect_credit_record()') IS NULL
     OR to_regprocedure('public.protect_refund_settlement()') IS NULL
     OR to_regprocedure('public.credit_transaction_capacity(integer,date,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Release 3 requires the exact Release 1 and 2 financial foundations';
  END IF;
  IF to_regclass('public.utilisations_lettre_credit') IS NOT NULL OR
     EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='paiements' AND column_name='role_lc') THEN
    RAISE EXCEPTION 'LC lifecycle already installed: reconcile before applying Release 3';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
    RAISE EXCEPTION 'App runtime role is not configured';
  END IF;
END $release3_preflight$;

LOCK TABLE public.lettres_credit, public.paiements, public.cessions_lc,
  public.mouvements_bancaires IN SHARE ROW EXCLUSIVE MODE;

-- Part A: lifecycle provenance and immutable utilization ledger.
-- Additive LC lifecycle model. Existing payments, cessions and bank movements
-- remain untouched and continue to be the immutable event history.

ALTER TABLE public.lettres_credit
  ADD COLUMN IF NOT EXISTS id_client_origine integer REFERENCES public.clients(id_client),
  ADD COLUMN IF NOT EXISTS date_reception date,
  ADD COLUMN IF NOT EXISTS statut_cycle varchar(20) NOT NULL DEFAULT 'a_verifier';

ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS role_lc varchar(20);

ALTER TABLE public.paiements
  ADD CONSTRAINT check_paiement_role_lc
  CHECK (role_lc IS NULL OR (type_paiement = 'lc' AND id_lc IS NOT NULL AND role_lc IN ('reception', 'utilisation')))
  NOT VALID;
ALTER TABLE public.paiements VALIDATE CONSTRAINT check_paiement_role_lc;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_payment_role_active
  ON public.paiements (id_lc, role_lc)
  WHERE id_lc IS NOT NULL AND role_lc IS NOT NULL AND statut <> 'annule';

ALTER TABLE public.lettres_credit
  ADD CONSTRAINT check_lc_statut_cycle_valide
  CHECK (statut_cycle IN ('detenue', 'transferee', 'deposee', 'annulee', 'a_verifier'))
  NOT VALID;
ALTER TABLE public.lettres_credit VALIDATE CONSTRAINT check_lc_statut_cycle_valide;

-- Restore the origin only when the legacy holder or transfer history identifies
-- one unambiguous client. Never infer a receipt date from registration time.
WITH cession_origins AS (
  SELECT id_lc, min(id_cedant_client) AS id_client, count(DISTINCT id_cedant_client) AS n
  FROM public.cessions_lc
  WHERE id_cession_origine IS NULL AND type_cedant = 'client' AND id_cedant_client IS NOT NULL
  GROUP BY id_lc
)
UPDATE public.lettres_credit lc
SET id_client_origine = COALESCE(co.id_client, lc.id_client)
FROM cession_origins co
WHERE lc.id_lc = co.id_lc AND lc.id_client_origine IS NULL
  AND co.n = 1;

UPDATE public.lettres_credit
SET id_client_origine = id_client
WHERE id_client_origine IS NULL AND id_client IS NOT NULL AND type_detenteur = 'client'
  AND NOT EXISTS (
    SELECT 1 FROM public.cessions_lc c
    WHERE c.id_lc = lettres_credit.id_lc AND c.id_cession_origine IS NULL
      AND c.type_cedant = 'client' AND c.id_cedant_client IS NOT NULL
  );

-- Every LC payment belongs to a side of the lifecycle, based on the linked
-- transaction. Cancelled rows remain classified as historical events.
UPDATE public.paiements p
SET role_lc = CASE WHEN t.id_client IS NOT NULL THEN 'reception'
                   WHEN t.id_fournisseur IS NOT NULL THEN 'utilisation'
                   ELSE NULL END
FROM public.transactions t
WHERE p.id_transaction = t.id_transaction
  AND p.id_lc IS NOT NULL AND p.type_paiement = 'lc' AND p.role_lc IS NULL;

WITH receipt_dates AS (
  SELECT p.id_lc, min(p.date_paiement) AS date_reception, count(*) AS n
  FROM public.paiements p
  WHERE p.id_lc IS NOT NULL AND p.role_lc = 'reception' AND p.statut = 'valide'
  GROUP BY p.id_lc
)
UPDATE public.lettres_credit lc
SET date_reception = rd.date_reception
FROM receipt_dates rd
WHERE lc.id_lc = rd.id_lc AND rd.n = 1 AND lc.date_reception IS NULL;

CREATE TABLE IF NOT EXISTS public.utilisations_lettre_credit (
  id_utilisation serial PRIMARY KEY,
  id_lc integer NOT NULL REFERENCES public.lettres_credit(id_lc) ON DELETE RESTRICT,
  type_utilisation varchar(20) NOT NULL,
  date_utilisation date NOT NULL,
  id_fournisseur integer REFERENCES public.fournisseurs(id_fournisseur),
  id_compte integer REFERENCES public.comptes_bancaires(id_compte),
  id_paiement integer REFERENCES public.paiements(id_paiement) ON DELETE RESTRICT,
  id_cession integer REFERENCES public.cessions_lc(id_cession) ON DELETE RESTRICT,
  id_mouvement_bancaire integer REFERENCES public.mouvements_bancaires(id_mouvement) ON DELETE RESTRICT,
  statut varchar(20) NOT NULL DEFAULT 'active',
  motif_annulation text,
  date_creation timestamptz NOT NULL DEFAULT now(),
  id_utilisateur_creation integer REFERENCES public.utilisateurs(id_utilisateur),
  CONSTRAINT check_lc_usage_type CHECK (type_utilisation IN ('fournisseur', 'banque')),
  CONSTRAINT check_lc_usage_status CHECK (statut IN ('active', 'annulee')),
  CONSTRAINT check_lc_usage_target CHECK (
    (type_utilisation = 'fournisseur' AND id_fournisseur IS NOT NULL AND id_compte IS NULL
      AND id_mouvement_bancaire IS NULL AND (id_paiement IS NOT NULL OR id_cession IS NOT NULL))
    OR
    (type_utilisation = 'banque' AND id_fournisseur IS NULL AND id_compte IS NOT NULL
      AND id_paiement IS NULL AND id_cession IS NULL AND id_mouvement_bancaire IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_utilisations_lettre_credit_id_lc
  ON public.utilisations_lettre_credit (id_lc);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_one_active_usage
  ON public.utilisations_lettre_credit (id_lc) WHERE statut = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_usage_payment
  ON public.utilisations_lettre_credit (id_paiement) WHERE id_paiement IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_usage_cession
  ON public.utilisations_lettre_credit (id_cession) WHERE id_cession IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_usage_bank_movement
  ON public.utilisations_lettre_credit (id_mouvement_bancaire) WHERE id_mouvement_bancaire IS NOT NULL;

-- Build an outgoing-use row only when exactly one live legacy event identifies
-- it. Multiple possible events are left in their original tables and marked
-- for reconciliation rather than guessed into one use.
WITH candidates AS (
  SELECT p.id_lc, 'fournisseur'::varchar AS type_utilisation, p.date_paiement AS date_utilisation,
         t.id_fournisseur, NULL::integer AS id_compte, p.id_paiement,
         NULL::integer AS id_cession, NULL::integer AS id_mouvement_bancaire,
         p.id_utilisateur_creation
  FROM public.paiements p
  JOIN public.transactions t ON t.id_transaction = p.id_transaction
  WHERE p.type_paiement = 'lc' AND p.role_lc = 'utilisation' AND p.statut = 'valide'
    AND t.id_fournisseur IS NOT NULL
  UNION ALL
  SELECT c.id_lc, 'fournisseur', c.date_cession, c.id_cessionnaire_fournisseur,
         NULL::integer, NULL::integer, c.id_cession, NULL::integer, c.id_utilisateur_creation
  FROM public.cessions_lc c
  WHERE c.type_cessionnaire = 'fournisseur' AND c.statut = 'active'
    AND c.id_cession_origine IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.cessions_lc r WHERE r.id_cession_origine = c.id_cession)
  UNION ALL
  SELECT lc.id_lc, 'banque', mb.date_mouvement::date, NULL::integer, mb.id_compte,
         NULL::integer, NULL::integer, mb.id_mouvement, mb.id_utilisateur_creation
  FROM public.mouvements_bancaires mb
  JOIN public.lettres_credit lc ON lc.numero_reference = mb.reference
  WHERE mb.source = 'lc' AND mb.statut = 'active' AND mb.type_mouvement = 'ENTREE'
), counted AS (
  SELECT candidates.*, count(*) OVER (PARTITION BY id_lc) AS candidate_count
  FROM candidates
)
INSERT INTO public.utilisations_lettre_credit
  (id_lc, type_utilisation, date_utilisation, id_fournisseur, id_compte,
   id_paiement, id_cession, id_mouvement_bancaire, id_utilisateur_creation)
SELECT id_lc, type_utilisation, date_utilisation, id_fournisseur, id_compte,
       id_paiement, id_cession, id_mouvement_bancaire, id_utilisateur_creation
FROM counted WHERE candidate_count = 1;

WITH usage_counts AS (
  SELECT id_lc, count(*) AS n, min(type_utilisation) AS type_utilisation
  FROM public.utilisations_lettre_credit WHERE statut = 'active' GROUP BY id_lc
), raw_candidates AS (
  SELECT id_lc FROM public.paiements WHERE type_paiement = 'lc' AND role_lc = 'utilisation' AND statut = 'valide'
  UNION ALL
  SELECT c.id_lc FROM public.cessions_lc c
  WHERE c.type_cessionnaire = 'fournisseur' AND c.statut = 'active' AND c.id_cession_origine IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.cessions_lc r WHERE r.id_cession_origine = c.id_cession)
  UNION ALL
  SELECT lc.id_lc FROM public.mouvements_bancaires mb
  JOIN public.lettres_credit lc ON lc.numero_reference = mb.reference
  WHERE mb.source = 'lc' AND mb.statut = 'active' AND mb.type_mouvement = 'ENTREE'
), ambiguous AS (
  SELECT id_lc, count(*) AS n FROM raw_candidates GROUP BY id_lc HAVING count(*) > 1
)
UPDATE public.lettres_credit lc
SET statut_cycle = CASE
  WHEN a.id_lc IS NOT NULL THEN 'a_verifier'
  WHEN u.type_utilisation = 'banque' THEN 'deposee'
  WHEN u.type_utilisation = 'fournisseur' THEN 'transferee'
  WHEN lc.statut = 'active' THEN 'detenue'
  ELSE 'a_verifier'
END
FROM (SELECT id_lc, max(type_utilisation) AS type_utilisation FROM usage_counts GROUP BY id_lc) u
FULL JOIN ambiguous a ON a.id_lc = u.id_lc
WHERE lc.id_lc = COALESCE(u.id_lc, a.id_lc);

UPDATE public.lettres_credit lc SET statut_cycle = 'detenue'
WHERE lc.statut_cycle = 'a_verifier' AND lc.statut = 'active' AND lc.id_client_origine IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.utilisations_lettre_credit u WHERE u.id_lc = lc.id_lc AND u.statut = 'active');

-- Legacy rows without a verifiable client receipt date or source client remain
-- visible, but are not spendable until reviewed.
UPDATE public.lettres_credit
SET statut_cycle = 'a_verifier'
WHERE date_reception IS NULL OR id_client_origine IS NULL;

-- Part B: least-privilege runtime access.
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

-- Part C: instrument-aware correction, financial and credit guards.
-- Extend audited corrections to cleared cheques and LC child payments.
CREATE OR REPLACE FUNCTION public.protect_financial_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
 operation_uuid uuid; operation_actor integer; operation_request jsonb; operation_result jsonb;
 request_changes jsonb; authorized jsonb; expected_result jsonb; expected_revision bigint; field_name text;
 fields text[] := ARRAY['date_paiement','montant','type_paiement','id_compte','source_reglement'];
 needs_authorization boolean;
BEGIN
 IF TG_TABLE_NAME='paiements' THEN
  IF OLD.nature='paiement' AND OLD.statut <> 'annule' AND NEW.statut='annule'
    AND EXISTS(SELECT 1 FROM public.paiements p WHERE p.id_transaction=OLD.id_transaction AND p.statut <> 'annule'
      AND p.nature IN ('remboursement','credit_recu','credit_transfere')) THEN
   RAISE EXCEPTION 'Resolve dependent refunds and allocations before canceling the payment';
  END IF;
  IF OLD.id_transaction IS DISTINCT FROM NEW.id_transaction OR OLD.id_lc IS DISTINCT FROM NEW.id_lc THEN
   RAISE EXCEPTION 'Payment transaction and LC identity are immutable';
  END IF;
  IF OLD.type_paiement='cheque' THEN
   fields := fields || ARRAY['date_encaissement_effective','statut_cheque','statut'];
  END IF;
  needs_authorization := (to_jsonb(OLD)->'date_paiement' IS DISTINCT FROM to_jsonb(NEW)->'date_paiement'
    OR OLD.montant IS DISTINCT FROM NEW.montant OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
    OR OLD.id_compte IS DISTINCT FROM NEW.id_compte OR OLD.source_reglement IS DISTINCT FROM NEW.source_reglement
    OR (OLD.type_paiement='cheque' AND OLD.statut_cheque IN ('encaisse','rejete','annule')
       AND (OLD.statut_cheque IS DISTINCT FROM NEW.statut_cheque OR OLD.date_encaissement_effective IS DISTINCT FROM NEW.date_encaissement_effective)));
  operation_uuid := nullif(current_setting('app.correction_operation_id',true),'')::uuid;
  IF needs_authorization OR (operation_uuid IS NOT NULL AND OLD.type_paiement='cheque') THEN
   SELECT id_utilisateur,request_payload,result_payload INTO operation_actor,operation_request,operation_result
    FROM public.correction_operations WHERE operation_id=operation_uuid;
   IF NOT FOUND OR operation_actor IS DISTINCT FROM coalesce(NEW.id_utilisateur_modification,NEW.id_utilisateur_creation) THEN
    RAISE EXCEPTION 'Financial correction operation is missing or has the wrong actor';
   END IF;
   IF operation_request->>'kind'='lc_correction' THEN
    authorized := operation_request->'authorized_payments'->NEW.id_paiement::text;
    expected_revision := (authorized->>'expected_version')::bigint;
    request_changes := authorized->'after';
    expected_result := operation_result->'payments'->NEW.id_paiement::text;
    IF OLD.id_lc IS NULL OR (operation_request->>'id_lc')::integer IS DISTINCT FROM OLD.id_lc
       OR NEW.type_paiement <> 'lc' THEN RAISE EXCEPTION 'LC operation does not own this payment'; END IF;
   ELSE
    IF operation_request->'target'->>'entity_type' IS DISTINCT FROM 'paiement'
       OR (operation_request->'target'->>'entity_id')::integer IS DISTINCT FROM NEW.id_paiement THEN
     RAISE EXCEPTION 'Financial correction operation has the wrong target';
    END IF;
    expected_revision := (operation_request->'target'->>'expected_version')::bigint;
    request_changes := operation_request->'changes';
    expected_result := operation_result->'record';
   END IF;
   IF expected_revision IS DISTINCT FROM OLD.row_version OR jsonb_typeof(request_changes) IS DISTINCT FROM 'object'
      OR jsonb_typeof(expected_result) IS DISTINCT FROM 'object'
      OR (expected_result->>'row_version')::bigint IS DISTINCT FROM NEW.row_version THEN
    RAISE EXCEPTION 'Financial correction operation has a stale revision or missing result';
   END IF;
   FOREACH field_name IN ARRAY fields LOOP
    IF to_jsonb(OLD)->field_name IS DISTINCT FROM to_jsonb(NEW)->field_name AND NOT (request_changes ? field_name) THEN
     RAISE EXCEPTION 'Financial correction does not request field %',field_name;
    END IF;
    IF request_changes ? field_name THEN
     IF field_name='montant' THEN
      IF (request_changes->>field_name)::numeric IS DISTINCT FROM NEW.montant
         OR (expected_result->>field_name)::numeric IS DISTINCT FROM NEW.montant THEN
       RAISE EXCEPTION 'Financial correction amount does not match'; END IF;
     ELSIF request_changes->>field_name IS DISTINCT FROM to_jsonb(NEW)->>field_name
        OR expected_result->>field_name IS DISTINCT FROM to_jsonb(NEW)->>field_name THEN
      RAISE EXCEPTION 'Financial correction value does not match %',field_name;
     END IF;
    END IF;
   END LOOP;
  END IF;
    ELSIF TG_TABLE_NAME = 'caisse' THEN
        IF OLD.date_mouvement IS DISTINCT FROM NEW.date_mouvement
           OR OLD.montant IS DISTINCT FROM NEW.montant
           OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
           OR OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
           OR OLD.id_paiement IS DISTINCT FROM NEW.id_paiement
           OR OLD.id_charge IS DISTINCT FROM NEW.id_charge THEN
            RAISE EXCEPTION 'Cash movement identity is immutable; void and replace it';
        END IF;
    ELSE
        IF OLD.id_compte IS DISTINCT FROM NEW.id_compte
           OR OLD.date_mouvement IS DISTINCT FROM NEW.date_mouvement
           OR OLD.montant IS DISTINCT FROM NEW.montant
           OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
           OR OLD.source IS DISTINCT FROM NEW.source
           OR OLD.reference IS DISTINCT FROM NEW.reference
           OR OLD.id_paiement IS DISTINCT FROM NEW.id_paiement
           OR OLD.id_charge IS DISTINCT FROM NEW.id_charge THEN
            RAISE EXCEPTION 'Bank movement identity is immutable; void and replace it';
        END IF;
    END IF;
    RETURN NEW;
END $fn$;

-- Used letters may only change financial values through the linked adapter.
-- Normal first use and existing explicit cancellation keep their current paths.
CREATE OR REPLACE FUNCTION public.protect_lc_correction() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE op public.correction_operations%ROWTYPE; field_name text;
BEGIN
 IF OLD.montant IS DISTINCT FROM NEW.montant OR OLD.date_emission IS DISTINCT FROM NEW.date_emission
   OR OLD.date_disponibilite IS DISTINCT FROM NEW.date_disponibilite
   OR ((OLD.statut=NEW.statut) AND (OLD.id_client IS DISTINCT FROM NEW.id_client
       OR OLD.id_fournisseur IS DISTINCT FROM NEW.id_fournisseur OR OLD.type_detenteur IS DISTINCT FROM NEW.type_detenteur)) THEN
  SELECT * INTO op FROM public.correction_operations WHERE operation_id=nullif(current_setting('app.correction_operation_id',true),'')::uuid;
  IF NOT FOUND OR op.request_payload->>'kind' IS DISTINCT FROM 'lc_correction'
    OR (op.request_payload->>'id_lc')::integer IS DISTINCT FROM NEW.id_lc
    OR (op.request_payload->>'expected_version')::integer IS DISTINCT FROM OLD.version_utilisation
    OR op.id_utilisateur IS DISTINCT FROM NEW.id_utilisateur_modification
    OR NEW.version_utilisation <> OLD.version_utilisation+1 THEN
   RAISE EXCEPTION 'LC financial correction requires its matching audited operation';
  END IF;
  FOREACH field_name IN ARRAY ARRAY['montant','date_emission','date_disponibilite','id_client','id_fournisseur','type_detenteur','statut','version_utilisation'] LOOP
   IF field_name='montant' THEN
    IF (op.result_payload->'record'->>field_name)::numeric IS DISTINCT FROM NEW.montant THEN
     RAISE EXCEPTION 'LC correction amount does not match'; END IF;
   ELSIF op.result_payload->'record'->>field_name IS DISTINCT FROM to_jsonb(NEW)->>field_name THEN
    RAISE EXCEPTION 'LC correction result does not match %',field_name;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS protect_lc_correction ON public.lettres_credit;
CREATE TRIGGER protect_lc_correction BEFORE UPDATE ON public.lettres_credit FOR EACH ROW EXECUTE FUNCTION public.protect_lc_correction();
REVOKE ALL ON FUNCTION public.protect_lc_correction() FROM PUBLIC;
DO $permissions$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
  GRANT EXECUTE ON FUNCTION public.protect_lc_correction() TO app_runtime;
 END IF;
END $permissions$;

CREATE OR REPLACE FUNCTION public.credit_transaction_capacity(tx integer, day date, want_credit boolean)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 WITH daily AS (
  SELECT (CASE WHEN p.type_paiement='cheque' THEN coalesce(p.date_encaissement_effective,p.date_paiement) ELSE p.date_paiement END) AS date_paiement, sum(CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END) AS delta
  FROM public.paiements p WHERE p.id_transaction=tx AND p.statut='valide'
    AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse') GROUP BY (CASE WHEN p.type_paiement='cheque' THEN coalesce(p.date_encaissement_effective,p.date_paiement) ELSE p.date_paiement END)
 ), days AS (SELECT day AS date_effet UNION SELECT date_paiement FROM daily WHERE date_paiement>day),
 balances AS (
  SELECT ((SELECT coalesce(sum(d.delta),0) FROM daily d WHERE d.date_paiement<=dates.date_effet)-t.montant_total)
      * CASE WHEN want_credit THEN 1 ELSE -1 END AS balance
  FROM days dates CROSS JOIN public.transactions t WHERE t.id_transaction=tx
 ) SELECT coalesce(min(balance),0) FROM balances;
$fn$;


CREATE OR REPLACE FUNCTION public.protect_credit_record() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE parent public.avances%ROWTYPE; source_tx public.transactions%ROWTYPE; target_tx public.transactions%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Credit history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(OLD)-ARRAY['statut','motif_annulation','date_annulation','id_utilisateur_annulation']) IS DISTINCT FROM
     (to_jsonb(NEW)-ARRAY['statut','motif_annulation','date_annulation','id_utilisateur_annulation'])
     OR (OLD.statut='annule' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)) THEN
   RAISE EXCEPTION 'Credit financial values and canceled history are immutable';
  END IF;
  IF NEW.statut='annule' AND (length(trim(coalesce(NEW.motif_annulation,'')))<3 OR NEW.date_annulation IS NULL OR NEW.id_utilisateur_annulation IS NULL) THEN
   RAISE EXCEPTION 'Credit cancellation requires reason, actor and timestamp';
  END IF;
  IF TG_TABLE_NAME='avances' THEN
   IF OLD.statut='active' AND NEW.statut='annule' AND OLD.nature='avance' THEN
   IF EXISTS(SELECT 1 FROM public.affectations_credit WHERE id_avance=OLD.id_avance AND statut='active')
      OR EXISTS(SELECT 1 FROM public.avances WHERE id_origine=OLD.id_avance AND statut='active') THEN
    RAISE EXCEPTION 'Advance has active allocation or return dependencies';
   END IF;
   END IF;
  END IF;
  IF OLD.statut='active' AND NEW.statut='annule' AND TG_TABLE_NAME='affectations_credit' THEN
   PERFORM 1 FROM public.transactions WHERE id_transaction IN (OLD.id_transaction_source,OLD.id_transaction_cible) ORDER BY id_transaction FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.paiements WHERE id_transaction=OLD.id_transaction_cible AND statut='valide' AND nature IN ('remboursement','credit_transfere')) THEN
    RAISE EXCEPTION 'Allocation has downstream refund or transfer dependencies';
   END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.statut <> 'active' OR NEW.date_effet>(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Casablanca')::date THEN
  RAISE EXCEPTION 'New credit requires active status and a non-future effective date';
 END IF;
 IF TG_TABLE_NAME='avances' THEN
  IF NEW.nature='avance' THEN
   IF NEW.id_client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clients WHERE id_client=NEW.id_client AND est_actif)
    OR NEW.id_fournisseur IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fournisseurs WHERE id_fournisseur=NEW.id_fournisseur AND est_actif) THEN
    RAISE EXCEPTION 'Advance requires an active contact';
   END IF;
  ELSE
   SELECT * INTO parent FROM public.avances WHERE id_avance=NEW.id_origine FOR UPDATE;
   IF NOT FOUND OR parent.statut <> 'active' OR parent.nature <> 'avance' OR parent.id_client IS DISTINCT FROM NEW.id_client
     OR parent.id_fournisseur IS DISTINCT FROM NEW.id_fournisseur OR NEW.date_effet<parent.date_effet
     OR NEW.montant>public.credit_advance_available(parent.id_avance) THEN
    RAISE EXCEPTION 'Advance return exceeds available credit or changes its owner';
   END IF;
  END IF;
 ELSE
  PERFORM 1 FROM public.transactions WHERE id_transaction IN (NEW.id_transaction_source,NEW.id_transaction_cible) ORDER BY id_transaction FOR UPDATE;
  SELECT * INTO target_tx FROM public.transactions WHERE id_transaction=NEW.id_transaction_cible;
  IF NOT FOUND OR NOT target_tx.est_actif OR NEW.date_effet<target_tx.date_transaction
      OR NEW.montant>public.credit_transaction_capacity(NEW.id_transaction_cible,NEW.date_effet,false) THEN
   RAISE EXCEPTION 'Allocation exceeds target debt or has an invalid date';
  END IF;
  IF NEW.id_transaction_source IS NOT NULL THEN
   SELECT * INTO source_tx FROM public.transactions WHERE id_transaction=NEW.id_transaction_source;
   IF NOT FOUND OR NOT source_tx.est_actif OR source_tx.id_client IS DISTINCT FROM target_tx.id_client
    OR source_tx.id_fournisseur IS DISTINCT FROM target_tx.id_fournisseur OR NEW.date_effet<source_tx.date_transaction
    OR NEW.montant>public.credit_transaction_capacity(NEW.id_transaction_source,NEW.date_effet,true) THEN
    RAISE EXCEPTION 'Allocation exceeds source credit or changes its owner';
   END IF;
  ELSE
   SELECT * INTO parent FROM public.avances WHERE id_avance=NEW.id_avance FOR UPDATE;
   IF NOT FOUND OR parent.statut <> 'active' OR parent.nature <> 'avance' OR parent.id_client IS DISTINCT FROM target_tx.id_client
    OR parent.id_fournisseur IS DISTINCT FROM target_tx.id_fournisseur OR NEW.date_effet<parent.date_effet
    OR NEW.montant>public.credit_advance_available(parent.id_avance) THEN
    RAISE EXCEPTION 'Allocation exceeds available advance or changes its owner';
   END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.paiements WHERE id_transaction IN (NEW.id_transaction_source,NEW.id_transaction_cible)
      AND statut <> 'annule' AND (type_paiement='cheque' AND (statut <> 'valide' OR statut_cheque IS DISTINCT FROM 'encaisse'))) THEN
   RAISE EXCEPTION 'Instrument credit requires its dedicated workflow';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;


CREATE OR REPLACE FUNCTION public.protect_refund_settlement() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
  parent public.transactions%ROWTYPE;
  net_now numeric;
  net_at_date numeric;
  later_minimum numeric;
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
      OLD.id_transaction IS DISTINCT FROM NEW.id_transaction OR OLD.montant IS DISTINCT FROM NEW.montant
      OR OLD.date_paiement IS DISTINCT FROM NEW.date_paiement OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
      OR OLD.id_compte IS DISTINCT FROM NEW.id_compte OR OLD.source_reglement IS DISTINCT FROM NEW.source_reglement
      OR OLD.id_lc IS DISTINCT FROM NEW.id_lc OR OLD.notes IS DISTINCT FROM NEW.notes
      OR OLD.cle_idempotence IS DISTINCT FROM NEW.cle_idempotence
      OR OLD.id_utilisateur_creation IS DISTINCT FROM NEW.id_utilisateur_creation
      OR (OLD.statut='annule' AND NEW.statut <> 'annule')) THEN
      RAISE EXCEPTION 'Refund values are immutable; void the erroneous record and record a replacement';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.nature <> 'remboursement' THEN RETURN NEW; END IF;
  SELECT * INTO parent FROM public.transactions WHERE id_transaction=NEW.id_transaction FOR UPDATE;
  IF NOT FOUND OR NOT parent.est_actif OR NEW.date_paiement < parent.date_transaction
    OR NEW.date_paiement > (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Casablanca')::date THEN
    RAISE EXCEPTION 'Refund requires an active transaction and a valid effective date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.paiements p WHERE p.id_transaction=NEW.id_transaction AND p.statut <> 'annule'
    AND (p.type_paiement='cheque' AND (p.statut <> 'valide' OR p.statut_cheque IS DISTINCT FROM 'encaisse'))) THEN
    RAISE EXCEPTION 'Instrument settlement requires its dedicated dependency workflow';
  END IF;
  SELECT coalesce(sum(CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END),0),
         coalesce(sum(CASE WHEN (CASE WHEN p.type_paiement='cheque' THEN coalesce(p.date_encaissement_effective,p.date_paiement) ELSE p.date_paiement END)<=NEW.date_paiement THEN CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END ELSE 0 END),0)
    INTO net_now,net_at_date FROM public.paiements p
    WHERE p.id_transaction=NEW.id_transaction AND p.statut='valide'
      AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse');
  SELECT min(net_at_date + cumulative_delta) INTO later_minimum FROM (
    SELECT sum(sum(CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END))
      OVER (ORDER BY (CASE WHEN p.type_paiement='cheque' THEN coalesce(p.date_encaissement_effective,p.date_paiement) ELSE p.date_paiement END)) AS cumulative_delta
    FROM public.paiements p WHERE p.id_transaction=NEW.id_transaction AND p.statut='valide'
      AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse')
      AND (CASE WHEN p.type_paiement='cheque' THEN coalesce(p.date_encaissement_effective,p.date_paiement) ELSE p.date_paiement END)>NEW.date_paiement GROUP BY (CASE WHEN p.type_paiement='cheque' THEN coalesce(p.date_encaissement_effective,p.date_paiement) ELSE p.date_paiement END)
  ) dated_balances;
  IF NEW.montant > least(net_now,net_at_date,coalesce(later_minimum,net_at_date))-parent.montant_total THEN
    RAISE EXCEPTION 'Refund exceeds available transaction credit';
  END IF;
  RETURN NEW;
END $fn$;


-- A transfer is corrected by a compensating row and a replacement, never by
-- rewriting the old holder/date. The narrow origin attachment supports the
-- previous deployment's insert-then-link cancellation until it is replaced.
CREATE OR REPLACE FUNCTION public.protect_lc_cession_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE origin public.cessions_lc%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'LC cession history cannot be deleted'; END IF;
 IF OLD.id_cession_origine IS NULL AND NEW.id_cession_origine IS NOT NULL
   AND (to_jsonb(OLD)-'id_cession_origine')=(to_jsonb(NEW)-'id_cession_origine') THEN
  SELECT * INTO origin FROM public.cessions_lc WHERE id_cession=NEW.id_cession_origine;
  IF FOUND AND origin.id_lc=NEW.id_lc AND origin.id_cession_origine IS NULL
    AND origin.type_cedant=NEW.type_cessionnaire AND origin.type_cessionnaire=NEW.type_cedant
    AND origin.id_cedant_client IS NOT DISTINCT FROM NEW.id_cessionnaire_client
    AND origin.id_cedant_fournisseur IS NOT DISTINCT FROM NEW.id_cessionnaire_fournisseur
    AND origin.id_cessionnaire_client IS NOT DISTINCT FROM NEW.id_cedant_client
    AND origin.id_cessionnaire_fournisseur IS NOT DISTINCT FROM NEW.id_cedant_fournisseur THEN RETURN NEW; END IF;
 END IF;
 IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN RAISE EXCEPTION 'LC cession values are immutable; reverse and replace'; END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS protect_lc_cession_history ON public.cessions_lc;
CREATE TRIGGER protect_lc_cession_history BEFORE UPDATE OR DELETE ON public.cessions_lc
 FOR EACH ROW EXECUTE FUNCTION public.protect_lc_cession_history();
REVOKE ALL ON FUNCTION public.protect_lc_cession_history() FROM PUBLIC;
DO $permissions$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
  GRANT EXECUTE ON FUNCTION public.protect_lc_cession_history() TO app_runtime;
 END IF;
END $permissions$;


-- Validate in the same transaction so partial schema changes never survive.
DO $release3_postflight$
BEGIN
 IF to_regclass('public.utilisations_lettre_credit') IS NULL
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paiements' AND column_name='role_lc')
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
       AND table_name='lettres_credit' AND column_name IN ('date_reception','statut_cycle','id_client_origine')) <> 3
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='protect_lc_correction' AND tgrelid='public.lettres_credit'::regclass AND NOT tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='protect_lc_cession_history' AND tgrelid='public.cessions_lc'::regclass AND NOT tgisinternal)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.utilisations_lettre_credit'::regclass)
    OR has_table_privilege('anon','public.utilisations_lettre_credit','SELECT')
    OR has_table_privilege('authenticated','public.utilisations_lettre_credit','SELECT')
    OR NOT has_table_privilege('app_runtime','public.utilisations_lettre_credit','SELECT,INSERT') THEN
   RAISE EXCEPTION 'Release 3 schema, guards or runtime permissions not installed correctly';
 END IF;
END $release3_postflight$;
