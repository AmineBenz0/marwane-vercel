-- Explicit, positive-valued refunds reuse the settlement ledger.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.paiements ADD COLUMN IF NOT EXISTS nature varchar(20) NOT NULL DEFAULT 'paiement';
DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.paiements'::regclass AND conname='check_paiement_nature') THEN
    ALTER TABLE public.paiements ADD CONSTRAINT check_paiement_nature CHECK (nature IN ('paiement','remboursement'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.paiements'::regclass AND conname='check_remboursement_simple') THEN
    ALTER TABLE public.paiements ADD CONSTRAINT check_remboursement_simple CHECK (
      nature <> 'remboursement' OR (type_paiement IN ('cash','virement') AND id_lc IS NULL AND statut IN ('valide','annule')));
  END IF;
END $block$;

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
  SELECT coalesce(sum(CASE WHEN p.nature='remboursement' THEN -p.montant ELSE p.montant END),0),
         coalesce(sum(CASE WHEN p.date_paiement<=NEW.date_paiement THEN CASE WHEN p.nature='remboursement' THEN -p.montant ELSE p.montant END ELSE 0 END),0)
    INTO net_now,net_at_date FROM public.paiements p
    WHERE p.id_transaction=NEW.id_transaction AND p.statut='valide'
      AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse');
  SELECT min(net_at_date + cumulative_delta) INTO later_minimum FROM (
    SELECT sum(sum(CASE WHEN p.nature='remboursement' THEN -p.montant ELSE p.montant END))
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
