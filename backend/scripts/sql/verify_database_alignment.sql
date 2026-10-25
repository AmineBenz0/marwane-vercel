-- Read-only postflight: success means zero returned issues.
WITH required_checks(table_name, name) AS (VALUES
    ('charges', 'check_charge_montant_positif'),
    ('mouvements_bancaires', 'check_mouvement_bancaire_montant_positif'),
    ('mouvements_bancaires', 'check_type_mouvement_bancaire_valide'),
    ('produits', 'check_type_produit_valide'),
    ('transformation_lignes', 'check_transformation_line_positive'),
    ('transformation_lignes', 'check_transformation_line_type'),
    ('transformations', 'check_transformation_output_positive'),
    ('productions', 'check_nombre_oeufs_positif'),
    ('productions', 'check_grammage_positif'),
    ('lettres_credit', 'check_lc_detenteur_unifie')
), required_defaults(table_name, column_name, value) AS (VALUES
    ('batiments', 'est_actif', 'true'),
    ('caisse', 'statut', 'active'),
    ('charges', 'statut', 'active'),
    ('clients', 'est_actif', 'true'),
    ('comptes_bancaires', 'solde_actuel', '0'),
    ('cycles_production', 'duree_semaines', '100'),
    ('fournisseurs', 'est_actif', 'true'),
    ('lettres_credit', 'statut', 'active'),
    ('mouvements_bancaires', 'statut', 'active'),
    ('paiements', 'statut', 'valide'),
    ('productions', 'est_actif', 'true'),
    ('produits', 'est_actif', 'true'),
    ('produits', 'pour_clients', 'true'),
    ('produits', 'pour_fournisseurs', 'true'),
    ('transactions', 'est_actif', 'true'),
    ('utilisateurs', 'est_actif', 'true')
), required_indexes(name) AS (VALUES
    ('uq_caisse_active_charge'),
    ('uq_caisse_active_payment'),
    ('uq_bank_active_charge'),
    ('uq_bank_active_payment'),
    ('uq_lc_active_payment'),
    ('uq_nomenclature_active_product'),
    ('ix_lettres_credit_numero_reference'),
    ('ix_utilisateurs_email')
), required_triggers(table_name, name, function_name, event_bits) AS (VALUES
    ('caisse', 'trg_no_delete_caisse', 'prevent_financial_delete', 11),
    ('caisse', 'trg_protect_caisse_identity', 'protect_financial_identity', 19),
    ('charges', 'trg_no_delete_charge', 'prevent_financial_delete', 11),
    ('corrections_financieres', 'trg_no_mutation_financial_correction', 'prevent_correction_mutation', 27),
    ('mouvements_bancaires', 'trg_no_delete_bank_movement', 'prevent_financial_delete', 11),
    ('mouvements_bancaires', 'trg_protect_bank_identity', 'protect_financial_identity', 19),
    ('mouvements_stock', 'trg_no_delete_stock_movement', 'prevent_stock_delete', 11),
    ('paiements', 'trg_no_delete_payment', 'prevent_financial_delete', 11),
    ('paiements', 'trg_protect_payment_identity', 'protect_financial_identity', 19),
    ('productions', 'trg_no_delete_production', 'prevent_production_delete', 11),
    ('transactions', 'trg_no_delete_transaction', 'prevent_transaction_delete', 11)
), historical_tables(table_name) AS (VALUES
    ('caisse'),
    ('charges'),
    ('corrections_financieres'),
    ('job_executions'),
    ('lots_production'),
    ('mouvements_bancaires'),
    ('mouvements_stock'),
    ('paiements'),
    ('productions'),
    ('transactions')
), guard_functions(name) AS (VALUES
    ('prevent_correction_mutation'),
    ('prevent_financial_delete'),
    ('prevent_production_delete'),
    ('prevent_stock_delete'),
    ('prevent_transaction_delete'),
    ('protect_financial_identity')
), issues AS (
    SELECT 'Missing/unvalidated check: ' || r.table_name || '.' || r.name AS issue
    FROM required_checks r WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint c
        WHERE c.conrelid = to_regclass('public.' || r.table_name)
          AND c.conname = r.name AND c.contype = 'c' AND c.convalidated
    )
    UNION ALL
    SELECT 'Incorrect default: ' || r.table_name || '.' || r.column_name
    FROM required_defaults r WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=to_regclass('public.' || r.table_name) AND a.attname=r.column_name
          AND trim(both '''' from regexp_replace(pg_get_expr(d.adbin,d.adrelid), '::.*$', ''))=r.value
    )
    UNION ALL
    SELECT 'Missing/invalid unique index: ' || r.name
    FROM required_indexes r WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_index i
        WHERE i.indexrelid=to_regclass('public.' || r.name) AND i.indisunique AND i.indisvalid
    )
    UNION ALL
    SELECT 'Missing/incorrect trigger: ' || r.table_name || '.' || r.name
    FROM required_triggers r WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid=to_regclass('public.' || r.table_name) AND t.tgname=r.name
          AND t.tgenabled='O' AND t.tgtype=r.event_bits
          AND t.tgfoid=to_regprocedure('public.' || r.function_name || '()')
    )
    UNION ALL
    SELECT 'Runtime can delete history: ' || table_name
    FROM historical_tables WHERE has_table_privilege('app_runtime','public.' || table_name,'DELETE')
    UNION ALL
    SELECT 'Runtime cannot read/append history: ' || table_name
    FROM historical_tables WHERE NOT (
        has_table_privilege('app_runtime','public.' || table_name,'SELECT')
        AND has_table_privilege('app_runtime','public.' || table_name,'INSERT')
    )
    UNION ALL
    SELECT 'Runtime can modify the correction journal'
    WHERE has_any_column_privilege('app_runtime','public.corrections_financieres','UPDATE')
    UNION ALL
    SELECT 'Unsafe guard function: ' || r.name
    FROM guard_functions r WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        WHERE p.oid=to_regprocedure('public.' || r.name || '()') AND NOT p.prosecdef
          AND p.proconfig @> ARRAY['search_path=pg_catalog']
          AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
          AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    )
    UNION ALL
    SELECT 'Vaccine price update unavailable'
    WHERE NOT has_column_privilege('app_runtime','public.vaccins','prix_defaut','UPDATE')
    UNION ALL
    SELECT 'Runtime has excessive vaccine catalogue permissions'
    WHERE has_table_privilege('app_runtime','public.vaccins','DELETE')
       OR has_any_column_privilege('app_runtime','public.vaccins','INSERT')
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_attribute a
           WHERE a.attrelid='public.vaccins'::regclass AND a.attnum>0 AND NOT a.attisdropped
             AND a.attname<>'prix_defaut'
             AND has_column_privilege('app_runtime',a.attrelid,a.attname,'UPDATE')
       )
    UNION ALL
    SELECT 'Incorrect vaccine RLS policies'
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='vaccins'
          AND policyname='app_runtime_access' AND cmd='SELECT' AND roles=ARRAY['app_runtime']::name[]
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='vaccins'
          AND policyname='app_runtime_update_vaccine_price' AND cmd='UPDATE'
          AND roles=ARRAY['app_runtime']::name[] AND qual='true' AND with_check='true'
    )
)
SELECT issue FROM issues ORDER BY issue;
