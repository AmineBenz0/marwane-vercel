-- Align transaction auditing and the query-support indexes already used in staging.
-- This migration changes no business rows and adds no objects for the separate
-- automatic egg-allocation feature.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Record audited transaction-field changes using the same fields and values as
-- staging. Pin the search path and qualify the audit table for safe resolution.
CREATE OR REPLACE FUNCTION public.audit_transaction_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    user_id INTEGER;
BEGIN
    user_id := COALESCE(
        NEW.id_utilisateur_modification,
        NEW.id_utilisateur_creation,
        NULLIF(current_setting('app.user_id', TRUE), '')::INTEGER,
        0
    );

    IF OLD.date_transaction IS DISTINCT FROM NEW.date_transaction THEN
        INSERT INTO public.transactions_audit (
            id_transaction, id_utilisateur, date_changement,
            champ_modifie, ancienne_valeur, nouvelle_valeur
        ) VALUES (
            NEW.id_transaction, user_id, NOW(), 'date_transaction',
            OLD.date_transaction::TEXT, NEW.date_transaction::TEXT
        );
    END IF;

    IF OLD.montant_total IS DISTINCT FROM NEW.montant_total THEN
        INSERT INTO public.transactions_audit (
            id_transaction, id_utilisateur, date_changement,
            champ_modifie, ancienne_valeur, nouvelle_valeur
        ) VALUES (
            NEW.id_transaction, user_id, NOW(), 'montant_total',
            OLD.montant_total::TEXT, NEW.montant_total::TEXT
        );
    END IF;

    IF OLD.est_actif IS DISTINCT FROM NEW.est_actif THEN
        INSERT INTO public.transactions_audit (
            id_transaction, id_utilisateur, date_changement,
            champ_modifie, ancienne_valeur, nouvelle_valeur
        ) VALUES (
            NEW.id_transaction, user_id, NOW(), 'est_actif',
            OLD.est_actif::TEXT, NEW.est_actif::TEXT
        );
    END IF;

    IF OLD.id_client IS DISTINCT FROM NEW.id_client THEN
        INSERT INTO public.transactions_audit (
            id_transaction, id_utilisateur, date_changement,
            champ_modifie, ancienne_valeur, nouvelle_valeur
        ) VALUES (
            NEW.id_transaction, user_id, NOW(), 'id_client',
            COALESCE(OLD.id_client::TEXT, 'NULL'),
            COALESCE(NEW.id_client::TEXT, 'NULL')
        );
    END IF;

    IF OLD.id_fournisseur IS DISTINCT FROM NEW.id_fournisseur THEN
        INSERT INTO public.transactions_audit (
            id_transaction, id_utilisateur, date_changement,
            champ_modifie, ancienne_valeur, nouvelle_valeur
        ) VALUES (
            NEW.id_transaction, user_id, NOW(), 'id_fournisseur',
            COALESCE(OLD.id_fournisseur::TEXT, 'NULL'),
            COALESCE(NEW.id_fournisseur::TEXT, 'NULL')
        );
    END IF;

    IF OLD.id_utilisateur_creation IS DISTINCT FROM NEW.id_utilisateur_creation THEN
        INSERT INTO public.transactions_audit (
            id_transaction, id_utilisateur, date_changement,
            champ_modifie, ancienne_valeur, nouvelle_valeur
        ) VALUES (
            NEW.id_transaction, user_id, NOW(), 'id_utilisateur_creation',
            COALESCE(OLD.id_utilisateur_creation::TEXT, 'NULL'),
            COALESCE(NEW.id_utilisateur_creation::TEXT, 'NULL')
        );
    END IF;

    IF OLD.id_utilisateur_modification IS DISTINCT FROM NEW.id_utilisateur_modification THEN
        INSERT INTO public.transactions_audit (
            id_transaction, id_utilisateur, date_changement,
            champ_modifie, ancienne_valeur, nouvelle_valeur
        ) VALUES (
            NEW.id_transaction, user_id, NOW(), 'id_utilisateur_modification',
            COALESCE(OLD.id_utilisateur_modification::TEXT, 'NULL'),
            COALESCE(NEW.id_utilisateur_modification::TEXT, 'NULL')
        );
    END IF;

    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.audit_transaction_changes()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_audit_transactions ON public.transactions;
CREATE TRIGGER trigger_audit_transactions
AFTER UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_transaction_changes();

-- These foreign-key indexes exist and are used in staging. They help joins and
-- parent-row updates/deletes avoid scanning the child tables.
CREATE INDEX IF NOT EXISTS ix_caisse_id_charge
    ON public.caisse USING btree (id_charge);
CREATE INDEX IF NOT EXISTS ix_caisse_inverse
    ON public.caisse USING btree (id_mouvement_inverse);
CREATE INDEX IF NOT EXISTS ix_caisse_id_paiement
    ON public.caisse USING btree (id_paiement);
CREATE INDEX IF NOT EXISTS ix_caisse_id_transaction
    ON public.caisse USING btree (id_transaction);
CREATE INDEX IF NOT EXISTS ix_caisse_solde_historique_id_mouvement
    ON public.caisse_solde_historique USING btree (id_mouvement);
CREATE INDEX IF NOT EXISTS ix_cessions_lc_id_lc
    ON public.cessions_lc USING btree (id_lc);
CREATE INDEX IF NOT EXISTS ix_lettres_credit_id_client
    ON public.lettres_credit USING btree (id_client);
CREATE INDEX IF NOT EXISTS ix_lettres_credit_id_fournisseur
    ON public.lettres_credit USING btree (id_fournisseur);
CREATE INDEX IF NOT EXISTS ix_mouvements_bancaires_id_compte
    ON public.mouvements_bancaires USING btree (id_compte);
CREATE INDEX IF NOT EXISTS ix_mouvements_bancaires_inverse
    ON public.mouvements_bancaires USING btree (id_mouvement_inverse);
CREATE INDEX IF NOT EXISTS ix_mouvements_bancaires_id_utilisateur_creation
    ON public.mouvements_bancaires USING btree (id_utilisateur_creation);
CREATE INDEX IF NOT EXISTS ix_mouvements_stock_id_produit
    ON public.mouvements_stock USING btree (id_produit);
CREATE INDEX IF NOT EXISTS ix_nomenclature_lignes_id_produit_entree
    ON public.nomenclature_lignes USING btree (id_produit_entree);
CREATE INDEX IF NOT EXISTS ix_paiements_id_lc
    ON public.paiements USING btree (id_lc);
CREATE INDEX IF NOT EXISTS ix_transactions_id_produit
    ON public.transactions USING btree (id_produit);
CREATE INDEX IF NOT EXISTS ix_transactions_audit_id_transaction
    ON public.transactions_audit USING btree (id_transaction);
CREATE INDEX IF NOT EXISTS ix_transformation_lignes_id_produit
    ON public.transformation_lignes USING btree (id_produit);
CREATE INDEX IF NOT EXISTS ix_transformation_lignes_id_transformation
    ON public.transformation_lignes USING btree (id_transformation);
CREATE INDEX IF NOT EXISTS ix_transformations_id_nomenclature
    ON public.transformations USING btree (id_nomenclature);

-- Staging uses these non-FK indexes for frequently queried lists and histories.
CREATE INDEX IF NOT EXISTS ix_alertes_unread
    ON public.alertes USING btree (est_lue, date_creation);
CREATE INDEX IF NOT EXISTS ix_caisse_date_mouvement
    ON public.caisse USING btree (date_mouvement);
CREATE INDEX IF NOT EXISTS ix_caisse_statut
    ON public.caisse USING btree (statut);
CREATE INDEX IF NOT EXISTS ix_lettres_credit_date_disponibilite
    ON public.lettres_credit USING btree (date_disponibilite);
CREATE INDEX IF NOT EXISTS ix_lettres_credit_statut
    ON public.lettres_credit USING btree (statut);
CREATE INDEX IF NOT EXISTS ix_mouvements_bancaires_statut
    ON public.mouvements_bancaires USING btree (statut);
CREATE INDEX IF NOT EXISTS ix_paiements_type_paiement
    ON public.paiements USING btree (type_paiement);
CREATE INDEX IF NOT EXISTS ix_productions_date_production
    ON public.productions USING btree (date_production);
CREATE INDEX IF NOT EXISTS ix_productions_est_actif_date
    ON public.productions USING btree (est_actif, date_production);
CREATE INDEX IF NOT EXISTS ix_productions_type_oeuf
    ON public.productions USING btree (type_oeuf);
CREATE INDEX IF NOT EXISTS ix_transactions_audit_date_changement
    ON public.transactions_audit USING btree (date_changement);

COMMIT;
