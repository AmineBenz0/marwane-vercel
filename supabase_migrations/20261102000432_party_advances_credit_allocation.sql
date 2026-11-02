-- Party-level money events and paired non-cash credit allocations.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public.avances (
 id_avance uuid PRIMARY KEY REFERENCES public.correction_operations(operation_id) DEFERRABLE INITIALLY DEFERRED,
 id_origine uuid REFERENCES public.avances(id_avance) ON DELETE RESTRICT,
 nature varchar(20) NOT NULL DEFAULT 'avance',
 id_client integer REFERENCES public.clients(id_client),
 id_fournisseur integer REFERENCES public.fournisseurs(id_fournisseur),
 date_effet date NOT NULL, montant numeric(15,2) NOT NULL,
 type_paiement varchar(20) NOT NULL, id_compte integer REFERENCES public.comptes_bancaires(id_compte),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
 statut varchar(10) NOT NULL DEFAULT 'active',
 id_utilisateur_creation integer NOT NULL REFERENCES public.utilisateurs(id_utilisateur),
 date_creation timestamptz NOT NULL DEFAULT now(),
 motif_annulation text, date_annulation timestamptz,
 id_utilisateur_annulation integer REFERENCES public.utilisateurs(id_utilisateur),
 CONSTRAINT check_avance_montant CHECK(montant>0),
 CONSTRAINT check_avance_statut CHECK(statut IN ('active','annule')),
 CONSTRAINT check_avance_party CHECK((id_client IS NOT NULL AND id_fournisseur IS NULL) OR (id_client IS NULL AND id_fournisseur IS NOT NULL)),
 CONSTRAINT check_avance_origine CHECK((nature='avance' AND id_origine IS NULL) OR (nature='retour_avance' AND id_origine IS NOT NULL)),
 CONSTRAINT check_avance_compte CHECK((type_paiement='cash' AND id_compte IS NULL) OR (type_paiement='virement' AND id_compte IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.affectations_credit (
 id_affectation uuid PRIMARY KEY REFERENCES public.correction_operations(operation_id) DEFERRABLE INITIALLY DEFERRED,
 id_transaction_source integer REFERENCES public.transactions(id_transaction) ON DELETE RESTRICT,
 id_avance uuid REFERENCES public.avances(id_avance) ON DELETE RESTRICT,
 id_transaction_cible integer NOT NULL REFERENCES public.transactions(id_transaction) ON DELETE RESTRICT,
 montant numeric(15,2) NOT NULL, date_effet date NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
 statut varchar(10) NOT NULL DEFAULT 'active',
 id_utilisateur_creation integer NOT NULL REFERENCES public.utilisateurs(id_utilisateur),
 date_creation timestamptz NOT NULL DEFAULT now(),
 motif_annulation text, date_annulation timestamptz,
 id_utilisateur_annulation integer REFERENCES public.utilisateurs(id_utilisateur),
 CONSTRAINT check_affectation_source CHECK((id_transaction_source IS NOT NULL AND id_avance IS NULL) OR (id_transaction_source IS NULL AND id_avance IS NOT NULL)),
 CONSTRAINT check_affectation_distinct CHECK(id_transaction_source IS NULL OR id_transaction_source <> id_transaction_cible),
 CONSTRAINT check_affectation_montant CHECK(montant>0),
 CONSTRAINT check_affectation_statut CHECK(statut IN ('active','annule'))
);
CREATE INDEX IF NOT EXISTS ix_avance_client ON public.avances(id_client);
CREATE INDEX IF NOT EXISTS ix_avance_fournisseur ON public.avances(id_fournisseur);
CREATE INDEX IF NOT EXISTS ix_avance_origine ON public.avances(id_origine);
CREATE INDEX IF NOT EXISTS ix_avance_date ON public.avances(date_effet);
CREATE INDEX IF NOT EXISTS ix_credit_source ON public.affectations_credit(id_transaction_source);
CREATE INDEX IF NOT EXISTS ix_credit_target ON public.affectations_credit(id_transaction_cible);
CREATE INDEX IF NOT EXISTS ix_credit_avance ON public.affectations_credit(id_avance);
CREATE INDEX IF NOT EXISTS ix_credit_date ON public.affectations_credit(date_effet);
ALTER TABLE public.paiements ADD COLUMN IF NOT EXISTS id_affectation uuid REFERENCES public.affectations_credit(id_affectation) ON DELETE RESTRICT;
ALTER TABLE public.paiements DROP CONSTRAINT IF EXISTS check_paiement_nature;
ALTER TABLE public.paiements ADD CONSTRAINT check_paiement_nature CHECK(nature IN ('paiement','remboursement','credit_recu','credit_transfere'));
ALTER TABLE public.paiements DROP CONSTRAINT IF EXISTS check_paiement_affectation;
ALTER TABLE public.paiements ADD CONSTRAINT check_paiement_affectation CHECK(
 (nature IN ('credit_recu','credit_transfere') AND id_affectation IS NOT NULL AND type_paiement='compensation'
  AND id_compte IS NULL AND id_lc IS NULL AND source_reglement IS NULL AND statut IN ('valide','annule'))
 OR (nature IN ('paiement','remboursement') AND id_affectation IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_affectation_settlement_side ON public.paiements(id_affectation,nature);
CREATE INDEX IF NOT EXISTS ix_paiement_affectation ON public.paiements(id_affectation);
ALTER TABLE public.caisse ADD COLUMN IF NOT EXISTS id_avance uuid REFERENCES public.avances(id_avance) ON DELETE RESTRICT;
ALTER TABLE public.mouvements_bancaires ADD COLUMN IF NOT EXISTS id_avance uuid REFERENCES public.avances(id_avance) ON DELETE RESTRICT;
ALTER TABLE public.caisse DROP CONSTRAINT IF EXISTS check_caisse_mutual_exclusion;
ALTER TABLE public.caisse DROP CONSTRAINT IF EXISTS check_caisse_origine;
ALTER TABLE public.caisse ADD CONSTRAINT check_caisse_origine CHECK(
 (id_avance IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_charge IS NULL AND id_cession IS NULL)
 OR (id_avance IS NULL AND ((id_charge IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_cession IS NULL)
 OR (id_cession IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_charge IS NULL)
 OR (id_charge IS NULL AND id_cession IS NULL AND (id_transaction IS NOT NULL OR id_paiement IS NOT NULL)))));
ALTER TABLE public.mouvements_bancaires DROP CONSTRAINT IF EXISTS check_bank_avance_origin;
ALTER TABLE public.mouvements_bancaires ADD CONSTRAINT check_bank_avance_origin CHECK(id_avance IS NULL OR (id_paiement IS NULL AND id_charge IS NULL));
CREATE INDEX IF NOT EXISTS ix_caisse_avance ON public.caisse(id_avance);
CREATE INDEX IF NOT EXISTS ix_bank_avance ON public.mouvements_bancaires(id_avance);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_cash_avance ON public.caisse(id_avance) WHERE statut='active' AND id_avance IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_bank_avance ON public.mouvements_bancaires(id_avance) WHERE statut='active' AND id_avance IS NOT NULL;

CREATE OR REPLACE FUNCTION public.credit_transaction_capacity(tx integer, day date, want_credit boolean)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 WITH daily AS (
  SELECT p.date_paiement, sum(CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END) AS delta
  FROM public.paiements p WHERE p.id_transaction=tx AND p.statut='valide'
    AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse') GROUP BY p.date_paiement
 ), days AS (SELECT day AS date_effet UNION SELECT date_paiement FROM daily WHERE date_paiement>day),
 balances AS (
  SELECT ((SELECT coalesce(sum(d.delta),0) FROM daily d WHERE d.date_paiement<=dates.date_effet)-t.montant_total)
      * CASE WHEN want_credit THEN 1 ELSE -1 END AS balance
  FROM days dates CROSS JOIN public.transactions t WHERE t.id_transaction=tx
 ) SELECT coalesce(min(balance),0) FROM balances;
$fn$;

CREATE OR REPLACE FUNCTION public.credit_advance_available(advance_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN a.statut='active' AND a.nature='avance' THEN a.montant
  -(SELECT coalesce(sum(c.montant),0) FROM public.affectations_credit c WHERE c.id_avance=a.id_avance AND c.statut='active')
  -(SELECT coalesce(sum(r.montant),0) FROM public.avances r WHERE r.id_origine=a.id_avance AND r.statut='active')
  ELSE 0 END FROM public.avances a WHERE a.id_avance=advance_id;
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
      AND statut <> 'annule' AND (type_paiement IN ('cheque','lc') OR id_lc IS NOT NULL)) THEN
   RAISE EXCEPTION 'Instrument credit requires its dedicated workflow';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.protect_credit_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE allocation public.affectations_credit%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.id_affectation IS NOT NULL THEN RAISE EXCEPTION 'Allocation settlement history cannot be deleted'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.id_affectation IS DISTINCT FROM NEW.id_affectation THEN RAISE EXCEPTION 'Settlement allocation is immutable'; END IF;
 IF NEW.id_affectation IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO allocation FROM public.affectations_credit WHERE id_affectation=NEW.id_affectation;
 IF NOT FOUND OR NEW.nature NOT IN ('credit_recu','credit_transfere') OR NEW.montant IS DISTINCT FROM allocation.montant
  OR NEW.date_paiement IS DISTINCT FROM allocation.date_effet OR NEW.notes IS DISTINCT FROM allocation.reason
  OR NEW.id_utilisateur_creation IS DISTINCT FROM allocation.id_utilisateur_creation
  OR (NEW.nature='credit_recu' AND NEW.id_transaction IS DISTINCT FROM allocation.id_transaction_cible)
  OR (NEW.nature='credit_transfere' AND (allocation.id_transaction_source IS NULL OR NEW.id_transaction IS DISTINCT FROM allocation.id_transaction_source))
  OR (NEW.statut='valide') IS DISTINCT FROM (allocation.statut='active') THEN
  RAISE EXCEPTION 'Settlement does not match its allocation';
 END IF;
 RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.verify_credit_pair() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE ref uuid; allocation public.affectations_credit%ROWTYPE; total integer; matches integer; expected integer;
BEGIN
 IF TG_TABLE_NAME='affectations_credit' THEN ref:=NEW.id_affectation;
 ELSE ref:=CASE WHEN TG_OP='DELETE' THEN OLD.id_affectation ELSE NEW.id_affectation END; END IF;
 IF ref IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO allocation FROM public.affectations_credit WHERE id_affectation=ref;
 IF NOT FOUND THEN RAISE EXCEPTION 'Allocation is missing'; END IF;
 expected:=CASE WHEN allocation.id_transaction_source IS NULL THEN 1 ELSE 2 END;
 SELECT count(*),count(*) FILTER(WHERE montant=allocation.montant AND date_paiement=allocation.date_effet
   AND (statut='valide')=(allocation.statut='active')
   AND ((nature='credit_recu' AND id_transaction=allocation.id_transaction_cible)
        OR (nature='credit_transfere' AND id_transaction=allocation.id_transaction_source)))
 INTO total,matches FROM public.paiements WHERE id_affectation=ref;
 IF total<>expected OR matches<>expected THEN RAISE EXCEPTION 'Allocation must save or cancel all settlement sides together'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.correction_operations WHERE operation_id=ref AND id_utilisateur=allocation.id_utilisateur_creation AND request_payload->>'kind'='credit' AND request_payload->>'action'='allocate') THEN RAISE EXCEPTION 'Allocation operation journal is missing'; END IF;
 IF allocation.statut='active' AND (public.credit_transaction_capacity(allocation.id_transaction_cible,allocation.date_effet,false)<0
  OR (allocation.id_transaction_source IS NOT NULL AND public.credit_transaction_capacity(allocation.id_transaction_source,allocation.date_effet,true)<0)
  OR (allocation.id_avance IS NOT NULL AND public.credit_advance_available(allocation.id_avance)<0)) THEN
  RAISE EXCEPTION 'Allocation overspends source credit or target debt';
 END IF;
 IF EXISTS(SELECT 1 FROM public.caisse c JOIN public.paiements p ON p.id_paiement=c.id_paiement WHERE p.id_affectation=ref AND c.statut='active')
  OR EXISTS(SELECT 1 FROM public.mouvements_bancaires m JOIN public.paiements p ON p.id_paiement=m.id_paiement WHERE p.id_affectation=ref AND m.statut='active') THEN
  RAISE EXCEPTION 'Credit allocation cannot create cash or bank money';
 END IF;
 RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION public.verify_advance_effect() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE ref uuid; advance public.avances%ROWTYPE; total integer; matches integer; direction text;
BEGIN
 ref:=CASE WHEN TG_OP='DELETE' THEN OLD.id_avance ELSE NEW.id_avance END;
 IF ref IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO advance FROM public.avances WHERE id_avance=ref;
 IF NOT FOUND THEN RAISE EXCEPTION 'Advance is missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.correction_operations WHERE operation_id=ref AND id_utilisateur=advance.id_utilisateur_creation AND request_payload->>'kind'='credit' AND request_payload->>'action'=CASE WHEN advance.nature='avance' THEN 'advance' ELSE 'return_advance' END) THEN RAISE EXCEPTION 'Advance operation journal is missing'; END IF;
 IF advance.nature='retour_avance' AND public.credit_advance_available(advance.id_origine)<0 THEN RAISE EXCEPTION 'Advance is overspent'; END IF;
 direction:=CASE WHEN (advance.id_client IS NOT NULL)<>(advance.nature='retour_avance') THEN 'ENTREE' ELSE 'SORTIE' END;
 SELECT count(*),count(*) FILTER(WHERE montant=advance.montant AND type_mouvement=direction AND date_mouvement::date=advance.date_effet
    AND ((advance.id_compte IS NULL AND kind='cash') OR (advance.id_compte IS NOT NULL AND kind='bank' AND id_compte=advance.id_compte AND source=advance.nature)))
 INTO total,matches FROM (
  SELECT montant,type_mouvement,date_mouvement,'cash' AS kind,NULL::integer AS id_compte,NULL::text AS source FROM public.caisse WHERE id_avance=ref AND statut='active'
  UNION ALL SELECT montant,type_mouvement,date_mouvement,'bank',id_compte,source FROM public.mouvements_bancaires WHERE id_avance=ref AND statut='active'
 ) effects;
 IF (advance.statut='active' AND (total<>1 OR matches<>1)) OR (advance.statut='annule' AND total<>0) THEN
  RAISE EXCEPTION 'Advance must have exactly its saved cash or bank effect';
 END IF;
 RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION public.protect_credit_transaction_party() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 IF (OLD.id_client IS DISTINCT FROM NEW.id_client OR OLD.id_fournisseur IS DISTINCT FROM NEW.id_fournisseur OR NOT NEW.est_actif)
  AND EXISTS(SELECT 1 FROM public.affectations_credit WHERE statut='active' AND NEW.id_transaction IN (id_transaction_source,id_transaction_cible)) THEN
  RAISE EXCEPTION 'Handle linked credit allocations before changing owner or withdrawing the transaction';
 END IF;
 RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.protect_credit_ledger() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.id_avance IS DISTINCT FROM NEW.id_avance THEN RAISE EXCEPTION 'Advance movement origin is immutable'; END IF;
  IF OLD.id_avance IS NOT NULL AND (
   (to_jsonb(OLD)-ARRAY['statut','motif_annulation','date_annulation','id_utilisateur_annulation','id_mouvement_inverse']) IS DISTINCT FROM
   (to_jsonb(NEW)-ARRAY['statut','motif_annulation','date_annulation','id_utilisateur_annulation','id_mouvement_inverse'])
   OR (OLD.statut='annule' AND NEW.statut <> 'annule')) THEN
   RAISE EXCEPTION 'Advance movement values and canceled history are immutable';
  END IF;
 END IF;
 IF NEW.id_paiement IS NOT NULL AND NEW.statut='active' AND EXISTS(
  SELECT 1 FROM public.paiements WHERE id_paiement=NEW.id_paiement AND nature IN ('credit_recu','credit_transfere')) THEN
  RAISE EXCEPTION 'Credit allocation cannot create cash or bank money';
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS protect_credit_ledger ON public.caisse;
CREATE TRIGGER protect_credit_ledger BEFORE INSERT OR UPDATE ON public.caisse FOR EACH ROW EXECUTE FUNCTION public.protect_credit_ledger();
DROP TRIGGER IF EXISTS protect_credit_ledger ON public.mouvements_bancaires;
CREATE TRIGGER protect_credit_ledger BEFORE INSERT OR UPDATE ON public.mouvements_bancaires FOR EACH ROW EXECUTE FUNCTION public.protect_credit_ledger();

DROP TRIGGER IF EXISTS protect_credit_record ON public.avances;
CREATE TRIGGER protect_credit_record BEFORE INSERT OR UPDATE OR DELETE ON public.avances FOR EACH ROW EXECUTE FUNCTION public.protect_credit_record();
DROP TRIGGER IF EXISTS protect_credit_record ON public.affectations_credit;
CREATE TRIGGER protect_credit_record BEFORE INSERT OR UPDATE OR DELETE ON public.affectations_credit FOR EACH ROW EXECUTE FUNCTION public.protect_credit_record();
DROP TRIGGER IF EXISTS protect_credit_payment ON public.paiements;
CREATE TRIGGER protect_credit_payment BEFORE INSERT OR UPDATE OR DELETE ON public.paiements FOR EACH ROW EXECUTE FUNCTION public.protect_credit_payment();
DROP TRIGGER IF EXISTS protect_credit_transaction_party ON public.transactions;
CREATE TRIGGER protect_credit_transaction_party BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.protect_credit_transaction_party();
DROP TRIGGER IF EXISTS verify_credit_pair ON public.affectations_credit;
CREATE CONSTRAINT TRIGGER verify_credit_pair AFTER INSERT OR UPDATE ON public.affectations_credit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_credit_pair();
DROP TRIGGER IF EXISTS verify_credit_pair ON public.paiements;
CREATE CONSTRAINT TRIGGER verify_credit_pair AFTER INSERT OR UPDATE OR DELETE ON public.paiements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_credit_pair();
DROP TRIGGER IF EXISTS verify_advance_effect ON public.avances;
CREATE CONSTRAINT TRIGGER verify_advance_effect AFTER INSERT OR UPDATE ON public.avances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_advance_effect();
DROP TRIGGER IF EXISTS verify_advance_effect ON public.caisse;
CREATE CONSTRAINT TRIGGER verify_advance_effect AFTER INSERT OR UPDATE OR DELETE ON public.caisse DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_advance_effect();
DROP TRIGGER IF EXISTS verify_advance_effect ON public.mouvements_bancaires;
CREATE CONSTRAINT TRIGGER verify_advance_effect AFTER INSERT OR UPDATE OR DELETE ON public.mouvements_bancaires DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_advance_effect();

ALTER TABLE public.avances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affectations_credit ENABLE ROW LEVEL SECURITY;
DO $permissions$
DECLARE t text; r text; f text;
BEGIN
 FOREACH t IN ARRAY ARRAY['avances','affectations_credit'] LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
   EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r);
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON public.%I TO app_runtime',t);
   EXECUTE format('GRANT UPDATE(statut,motif_annulation,date_annulation,id_utilisateur_annulation) ON public.%I TO app_runtime',t);
   EXECUTE format('DROP POLICY IF EXISTS credit_runtime_access ON public.%I',t);
   EXECUTE format('CREATE POLICY credit_runtime_access ON public.%I FOR ALL TO app_runtime USING(true) WITH CHECK(true)',t);
  END IF;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['credit_transaction_capacity(integer,date,boolean)','credit_advance_available(uuid)',
  'protect_credit_record()','protect_credit_ledger()','protect_credit_payment()','verify_credit_pair()','verify_advance_effect()','protect_credit_transaction_party()'] LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||f||' FROM PUBLIC';
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
   EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||f||' TO app_runtime';
  END IF;
 END LOOP;
END $permissions$;

-- Refund bounds include the non-cash settlement sides as well.
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
    AND (p.type_paiement IN ('cheque','lc') OR p.id_lc IS NOT NULL)) THEN
    RAISE EXCEPTION 'Instrument settlement requires its dedicated dependency workflow';
  END IF;
  SELECT coalesce(sum(CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END),0),
         coalesce(sum(CASE WHEN p.date_paiement<=NEW.date_paiement THEN CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END ELSE 0 END),0)
    INTO net_now,net_at_date FROM public.paiements p
    WHERE p.id_transaction=NEW.id_transaction AND p.statut='valide'
      AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse');
  SELECT min(net_at_date + cumulative_delta) INTO later_minimum FROM (
    SELECT sum(sum(CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END))
      OVER (ORDER BY p.date_paiement) AS cumulative_delta
    FROM public.paiements p WHERE p.id_transaction=NEW.id_transaction AND p.statut='valide'
      AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse')
      AND p.date_paiement>NEW.date_paiement GROUP BY p.date_paiement
  ) dated_balances;
  IF NEW.montant > least(net_now,net_at_date,coalesce(later_minimum,net_at_date))-parent.montant_total THEN
    RAISE EXCEPTION 'Refund exceeds available transaction credit';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.protect_refund_settlement() FROM PUBLIC;
DROP TRIGGER IF EXISTS protect_refund_settlement ON public.paiements;
CREATE TRIGGER protect_refund_settlement BEFORE INSERT OR UPDATE OR DELETE ON public.paiements
FOR EACH ROW EXECUTE FUNCTION public.protect_refund_settlement();
