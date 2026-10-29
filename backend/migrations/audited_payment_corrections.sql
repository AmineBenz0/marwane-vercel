-- Permit only audited edits to an effective payment's date or amount.
-- Payment identity and movement identity remain immutable; movements are voided
-- and replaced by the application in the same correction transaction.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.protect_financial_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
    operation_uuid uuid;
    operation_actor integer;
    operation_request jsonb;
    operation_result jsonb;
    request_changes jsonb;
BEGIN
    IF TG_TABLE_NAME = 'paiements' THEN
        IF OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
           OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
           OR OLD.id_lc IS DISTINCT FROM NEW.id_lc THEN
            RAISE EXCEPTION 'Payment identity is immutable; correct supported details through an audited operation';
        END IF;

        IF OLD.date_paiement IS DISTINCT FROM NEW.date_paiement
           OR OLD.montant IS DISTINCT FROM NEW.montant THEN
            operation_uuid := nullif(current_setting('app.correction_operation_id', true), '')::uuid;
            IF operation_uuid IS NULL THEN
                RAISE EXCEPTION 'Payment date and amount require an audited correction operation';
            END IF;

            SELECT id_utilisateur, request_payload, result_payload
              INTO operation_actor, operation_request, operation_result
              FROM public.correction_operations
             WHERE operation_id = operation_uuid;

            IF NOT FOUND
               OR operation_actor IS DISTINCT FROM coalesce(NEW.id_utilisateur_modification, NEW.id_utilisateur_creation)
               OR operation_request->'target'->>'entity_type' IS DISTINCT FROM 'paiement'
               OR (operation_request->'target'->>'entity_id')::integer IS DISTINCT FROM NEW.id_paiement
               OR (operation_request->'target'->>'expected_version')::bigint IS DISTINCT FROM OLD.row_version THEN
                RAISE EXCEPTION 'Payment correction operation does not match its actor, target, or expected revision';
            END IF;

            request_changes := operation_request->'changes';
            IF jsonb_typeof(request_changes) IS DISTINCT FROM 'object'
               OR jsonb_typeof(operation_result->'record') IS DISTINCT FROM 'object'
               OR (OLD.date_paiement IS DISTINCT FROM NEW.date_paiement
                AND (NOT coalesce(request_changes ? 'date_paiement', false)
                     OR request_changes->>'date_paiement' IS DISTINCT FROM NEW.date_paiement::text))
               OR (OLD.montant IS DISTINCT FROM NEW.montant
                   AND (NOT coalesce(request_changes ? 'montant', false)
                        OR (request_changes->>'montant')::numeric IS DISTINCT FROM NEW.montant))
               OR (request_changes ? 'date_paiement'
                   AND request_changes->>'date_paiement' IS DISTINCT FROM NEW.date_paiement::text)
               OR (request_changes ? 'montant'
                   AND (request_changes->>'montant')::numeric IS DISTINCT FROM NEW.montant)
               OR operation_result->'record'->>'row_version' IS DISTINCT FROM NEW.row_version::text
               OR (request_changes ? 'date_paiement'
                   AND operation_result->'record'->>'date_paiement' IS DISTINCT FROM NEW.date_paiement::text)
               OR (request_changes ? 'montant'
                   AND (operation_result->'record'->>'montant')::numeric IS DISTINCT FROM NEW.montant) THEN
                RAISE EXCEPTION 'Payment correction operation does not authorize these values';
            END IF;
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

-- The history row written by capture_correction_revision records this same
-- operation ID, while the correction operation itself remains append-only.
