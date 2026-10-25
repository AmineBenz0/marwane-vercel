-- Align the reviewed integrity rules in SQL-managed production and Alembic staging.
-- Generated with `supabase migration new align_database_integrity`.
-- No business rows are rewritten; existing conflicts abort the entire transaction.
-- Deliberately excludes transaction-change auditing, unused legacy objects,
-- query-performance indexes, and engine upgrades.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Defaults apply only to future inserts that omit these values.
ALTER TABLE public.batiments ALTER COLUMN est_actif SET DEFAULT true;
ALTER TABLE public.caisse ALTER COLUMN statut SET DEFAULT 'active';
ALTER TABLE public.charges ALTER COLUMN statut SET DEFAULT 'active';
ALTER TABLE public.clients ALTER COLUMN est_actif SET DEFAULT true;
ALTER TABLE public.comptes_bancaires ALTER COLUMN solde_actuel SET DEFAULT 0;
ALTER TABLE public.cycles_production ALTER COLUMN duree_semaines SET DEFAULT 100;
ALTER TABLE public.fournisseurs ALTER COLUMN est_actif SET DEFAULT true;
ALTER TABLE public.lettres_credit ALTER COLUMN statut SET DEFAULT 'active';
ALTER TABLE public.mouvements_bancaires ALTER COLUMN statut SET DEFAULT 'active';
ALTER TABLE public.paiements ALTER COLUMN statut SET DEFAULT 'valide';
ALTER TABLE public.productions ALTER COLUMN est_actif SET DEFAULT true;
ALTER TABLE public.produits ALTER COLUMN est_actif SET DEFAULT true, ALTER COLUMN pour_clients SET DEFAULT true, ALTER COLUMN pour_fournisseurs SET DEFAULT true;
ALTER TABLE public.transactions ALTER COLUMN est_actif SET DEFAULT true;
ALTER TABLE public.utilisateurs ALTER COLUMN est_actif SET DEFAULT true;

-- Keep the union of both environments' validation rules.
DO $alignment_checks$
DECLARE rule record;
BEGIN
    FOR rule IN SELECT * FROM (VALUES
        ('charges', 'check_charge_montant_positif', 'montant > 0'),
        ('mouvements_bancaires', 'check_mouvement_bancaire_montant_positif', 'montant > 0'),
        ('mouvements_bancaires', 'check_type_mouvement_bancaire_valide', 'type_mouvement IN (''ENTREE'', ''SORTIE'')'),
        ('produits', 'check_type_produit_valide', 'type_produit IN (''matiere_premiere'', ''produit_fini'', ''service'')'),
        ('transformation_lignes', 'check_transformation_line_positive', 'quantite > 0'),
        ('transformation_lignes', 'check_transformation_line_type', 'type_ligne IN (''INPUT'', ''OUTPUT'')'),
        ('transformations', 'check_transformation_output_positive', 'quantite_sortie IS NULL OR quantite_sortie > 0'),
        ('productions', 'check_nombre_oeufs_positif', 'nombre_oeufs >= 0'),
        ('productions', 'check_grammage_positif', 'grammage >= 0'),
        ('lettres_credit', 'check_lc_detenteur_unifie', '(id_client IS NOT NULL AND id_fournisseur IS NULL) OR (id_fournisseur IS NOT NULL AND id_client IS NULL)')
    ) AS rules(table_name, constraint_name, expression)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conrelid = format('public.%I', rule.table_name)::regclass
              AND conname = rule.constraint_name
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID',
                rule.table_name, rule.constraint_name, rule.expression);
        END IF;
        EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
            rule.table_name, rule.constraint_name);
    END LOOP;
END;
$alignment_checks$;

-- Integrity indexes only. Existing idempotency indexes in either environment
-- already enforce equivalent rules and are intentionally left intact.
CREATE UNIQUE INDEX IF NOT EXISTS uq_caisse_active_charge ON public.caisse USING btree (id_charge) WHERE ((id_charge IS NOT NULL) AND ((statut)::text = 'active'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uq_caisse_active_payment ON public.caisse USING btree (id_paiement) WHERE ((id_paiement IS NOT NULL) AND ((statut)::text = 'active'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_active_charge ON public.mouvements_bancaires USING btree (id_charge) WHERE ((id_charge IS NOT NULL) AND ((statut)::text = 'active'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_active_payment ON public.mouvements_bancaires USING btree (id_paiement) WHERE ((id_paiement IS NOT NULL) AND ((statut)::text = 'active'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_active_payment ON public.paiements USING btree (id_lc) WHERE ((id_lc IS NOT NULL) AND ((statut)::text <> 'annule'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uq_nomenclature_active_product ON public.nomenclatures USING btree (id_produit_sortie) WHERE (est_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS ix_lettres_credit_numero_reference ON public.lettres_credit USING btree (numero_reference);
CREATE UNIQUE INDEX IF NOT EXISTS ix_utilisateurs_email ON public.utilisateurs USING btree (email);

-- Backstop the existing cancellation/reversal workflows at the database boundary.
-- These invoker functions reference only the trigger's OLD/NEW rows.
CREATE OR REPLACE FUNCTION public.prevent_correction_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = pg_catalog
AS $function$
        BEGIN
            RAISE EXCEPTION 'Financial correction journal is append-only';
        END;
        $function$;
REVOKE ALL ON FUNCTION public.prevent_correction_mutation() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.prevent_financial_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = pg_catalog
AS $function$
        BEGIN
            RAISE EXCEPTION 'Financial records are append-only; use a void or reversal operation';
        END;
        $function$;
REVOKE ALL ON FUNCTION public.prevent_financial_delete() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.prevent_production_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = pg_catalog
AS $function$
        BEGIN
            RAISE EXCEPTION 'Production records are historical; deactivate the record instead';
        END;
        $function$;
REVOKE ALL ON FUNCTION public.prevent_production_delete() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.prevent_stock_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = pg_catalog
AS $function$
        BEGIN
            RAISE EXCEPTION 'Stock ledger is append-only; use a reversal movement';
        END;
        $function$;
REVOKE ALL ON FUNCTION public.prevent_stock_delete() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.prevent_transaction_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = pg_catalog
AS $function$
        BEGIN
            RAISE EXCEPTION
                'transactions are append-only; use the audited deactivation operation';
        END;
        $function$;
REVOKE ALL ON FUNCTION public.prevent_transaction_delete() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.protect_financial_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = pg_catalog
AS $function$
        BEGIN
            IF TG_TABLE_NAME = 'paiements' THEN
                IF OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
                   OR OLD.date_paiement IS DISTINCT FROM NEW.date_paiement
                   OR OLD.montant IS DISTINCT FROM NEW.montant
                   OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
                   OR OLD.id_lc IS DISTINCT FROM NEW.id_lc THEN
                    RAISE EXCEPTION 'Payment financial identity is immutable; void and recreate it';
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
        END;
        $function$;
REVOKE ALL ON FUNCTION public.protect_financial_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_no_delete_caisse ON public.caisse;
CREATE TRIGGER trg_no_delete_caisse BEFORE DELETE ON public.caisse FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();
DROP TRIGGER IF EXISTS trg_protect_caisse_identity ON public.caisse;
CREATE TRIGGER trg_protect_caisse_identity BEFORE UPDATE ON public.caisse FOR EACH ROW EXECUTE FUNCTION public.protect_financial_identity();
DROP TRIGGER IF EXISTS trg_no_delete_charge ON public.charges;
CREATE TRIGGER trg_no_delete_charge BEFORE DELETE ON public.charges FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();
DROP TRIGGER IF EXISTS trg_no_mutation_financial_correction ON public.corrections_financieres;
CREATE TRIGGER trg_no_mutation_financial_correction BEFORE DELETE OR UPDATE ON public.corrections_financieres FOR EACH ROW EXECUTE FUNCTION public.prevent_correction_mutation();
DROP TRIGGER IF EXISTS trg_no_delete_bank_movement ON public.mouvements_bancaires;
CREATE TRIGGER trg_no_delete_bank_movement BEFORE DELETE ON public.mouvements_bancaires FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();
DROP TRIGGER IF EXISTS trg_protect_bank_identity ON public.mouvements_bancaires;
CREATE TRIGGER trg_protect_bank_identity BEFORE UPDATE ON public.mouvements_bancaires FOR EACH ROW EXECUTE FUNCTION public.protect_financial_identity();
DROP TRIGGER IF EXISTS trg_no_delete_stock_movement ON public.mouvements_stock;
CREATE TRIGGER trg_no_delete_stock_movement BEFORE DELETE ON public.mouvements_stock FOR EACH ROW EXECUTE FUNCTION public.prevent_stock_delete();
DROP TRIGGER IF EXISTS trg_no_delete_payment ON public.paiements;
CREATE TRIGGER trg_no_delete_payment BEFORE DELETE ON public.paiements FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();
DROP TRIGGER IF EXISTS trg_protect_payment_identity ON public.paiements;
CREATE TRIGGER trg_protect_payment_identity BEFORE UPDATE ON public.paiements FOR EACH ROW EXECUTE FUNCTION public.protect_financial_identity();
DROP TRIGGER IF EXISTS trg_no_delete_production ON public.productions;
CREATE TRIGGER trg_no_delete_production BEFORE DELETE ON public.productions FOR EACH ROW EXECUTE FUNCTION public.prevent_production_delete();
DROP TRIGGER IF EXISTS trg_no_delete_transaction ON public.transactions;
CREATE TRIGGER trg_no_delete_transaction BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.prevent_transaction_delete();

-- Runtime access matches the app's soft deletion and append-only journals.
REVOKE DELETE ON TABLE public.caisse, public.charges,
    public.corrections_financieres, public.job_executions,
    public.lots_production, public.mouvements_bancaires,
    public.mouvements_stock, public.paiements,
    public.productions, public.transactions FROM app_runtime;
REVOKE UPDATE ON TABLE public.corrections_financieres FROM app_runtime;

-- Vaccine catalogue is maintained separately; the current UI may edit prices.
-- Revoke table-wide writes as well as any old column-specific writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.vaccins FROM app_runtime;
DO $vaccine_columns$
DECLARE column_list text;
BEGIN
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO column_list
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.vaccins'::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.vaccins FROM app_runtime',
        column_list, column_list, column_list);
END;
$vaccine_columns$;
GRANT SELECT ON TABLE public.vaccins TO app_runtime;
GRANT UPDATE (prix_defaut) ON TABLE public.vaccins TO app_runtime;
DROP POLICY IF EXISTS app_runtime_access ON public.vaccins;
CREATE POLICY app_runtime_access ON public.vaccins
    FOR SELECT TO app_runtime USING (true);
DROP POLICY IF EXISTS app_runtime_update_vaccine_price ON public.vaccins;
CREATE POLICY app_runtime_update_vaccine_price ON public.vaccins
    FOR UPDATE TO app_runtime USING (true) WITH CHECK (true);

COMMIT;
