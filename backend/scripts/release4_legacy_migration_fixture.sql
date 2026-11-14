-- DISPOSABLE LOCAL PostgreSQL ONLY. Never execute against staging/prod.
-- Seed the exact type of pre-ledger closure found in staging: inactive,
-- audited, no payments, and no new credit note. All values are synthetic.
DO $seed$
DECLARE
  actor_id integer;
  customer_id integer;
  product_id integer;
  building_id integer;
  sale_id integer;
BEGIN
  -- Docker-published localhost ports connect to the container's *bridge*
  -- address (often 172.x), not to the server's 127.0.0.1 address. The
  -- managed Supabase projects use database 'postgres'; the CI-only URL
  -- and disposable database name are enforced together by the runner.
  IF current_database() <> 'comptabilite_db'
     OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Phase 8 fixture MUST run on disposable PostgreSQL CI only';
  END IF;
  INSERT INTO public.utilisateurs(
    nom_utilisateur,email,mot_de_passe_hash,role,est_actif
  ) VALUES ('R4 legacy CI','r4-legacy-only@example.invalid','synthetic-ci-only','admin',true)
  RETURNING id_utilisateur INTO actor_id;
  INSERT INTO public.clients(nom_client) VALUES('R4 legacy synthetic customer')
  RETURNING id_client INTO customer_id;
  INSERT INTO public.produits(
    nom_produit,type_produit,est_actif,pour_clients,pour_fournisseurs
  ) VALUES('R4 legacy synthetic eggs','produit_fini',true,true,false)
  RETURNING id_produit INTO product_id;
  INSERT INTO public.batiments(nom) VALUES('R4 legacy CI')
  RETURNING id_batiment INTO building_id;
  INSERT INTO public.transactions(
    date_transaction,id_produit,quantite,prix_unitaire,montant_total,
    est_actif,id_client,id_batiment,est_promesse,allocation_automatique,
    quantite_annulee,date_livraison_prevue,id_utilisateur_creation
  ) VALUES (
    current_date-5,product_id,6,1.50,9.00,
    false,customer_id,building_id,true,true,
    6,current_date-2,actor_id
  ) RETURNING id_transaction INTO sale_id;
  INSERT INTO public.transactions_audit(
    id_transaction,id_utilisateur,champ_modifie,ancienne_valeur,nouvelle_valeur
  ) VALUES (
    sale_id,actor_id,'annulation_reste_livraison_differee','0',
    '{"date":"2026-10-27","quantite_annulee":6}'
  );
END $seed$;
