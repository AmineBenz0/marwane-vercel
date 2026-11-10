-- Extend the audited payment correction contract to cash/bank routing and
-- payment-method corrections. Cheques and letters of credit remain guarded.
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
    field_name text;
    requested_value text;
    result_value text;
BEGIN
    IF TG_TABLE_NAME = 'paiements' THEN
        IF OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
           OR OLD.id_lc IS DISTINCT FROM NEW.id_lc THEN
            RAISE EXCEPTION 'Payment transaction and letter-of-credit identity remain immutable';
        END IF;

        IF OLD.date_paiement IS DISTINCT FROM NEW.date_paiement
           OR OLD.montant IS DISTINCT FROM NEW.montant
           OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
           OR OLD.id_compte IS DISTINCT FROM NEW.id_compte
           OR OLD.source_reglement IS DISTINCT FROM NEW.source_reglement THEN
            operation_uuid := nullif(current_setting('app.correction_operation_id', true), '')::uuid;
            IF operation_uuid IS NULL THEN
                RAISE EXCEPTION 'Payment financial changes require an audited correction operation';
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
               OR operation_result->'record'->>'row_version' IS DISTINCT FROM NEW.row_version::text THEN
                RAISE EXCEPTION 'Payment correction operation is missing a matching result';
            END IF;

            FOREACH field_name IN ARRAY ARRAY['date_paiement','montant','type_paiement','id_compte','source_reglement'] LOOP
                IF to_jsonb(OLD)->field_name IS DISTINCT FROM to_jsonb(NEW)->field_name
                   AND NOT (request_changes ? field_name) THEN
                    RAISE EXCEPTION 'Payment correction operation does not request changed field %', field_name;
                END IF;
                IF request_changes ? field_name THEN
                    requested_value := request_changes->>field_name;
                    result_value := operation_result->'record'->>field_name;
                    IF field_name = 'montant' THEN
                        IF requested_value IS NULL OR result_value IS NULL
                           OR requested_value::numeric IS DISTINCT FROM NEW.montant
                           OR result_value::numeric IS DISTINCT FROM NEW.montant THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize montant';
                        END IF;
                    ELSIF field_name = 'date_paiement' THEN
                        IF requested_value IS DISTINCT FROM NEW.date_paiement::text
                           OR result_value IS DISTINCT FROM NEW.date_paiement::text THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize date_paiement';
                        END IF;
                    ELSIF field_name = 'id_compte' THEN
                        IF requested_value IS DISTINCT FROM NEW.id_compte::text
                           OR result_value IS DISTINCT FROM NEW.id_compte::text THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize id_compte';
                        END IF;
                    ELSIF field_name = 'type_paiement' THEN
                        IF requested_value IS DISTINCT FROM NEW.type_paiement
                           OR result_value IS DISTINCT FROM NEW.type_paiement THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize type_paiement';
                        END IF;
                    ELSIF field_name = 'source_reglement' THEN
                        IF requested_value IS DISTINCT FROM NEW.source_reglement
                           OR result_value IS DISTINCT FROM NEW.source_reglement THEN
                            RAISE EXCEPTION 'Payment correction operation does not authorize source_reglement';
                        END IF;
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
