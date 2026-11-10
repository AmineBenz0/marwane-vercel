-- Execute after instrument_corrections on staging. No synthetic data survives.
BEGIN;
DO $qa$
DECLARE actor integer; customer integer; product integer; tx integer; cheque integer; pay integer;
 lc integer; transfer integer; operation uuid; revision bigint; snapshot jsonb; day date;
BEGIN
 day := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Casablanca')::date;
 SELECT min(id_utilisateur) INTO actor FROM public.utilisateurs WHERE est_actif;
 SELECT min(id_client) INTO customer FROM public.clients WHERE est_actif;
 SELECT min(id_produit) INTO product FROM public.produits WHERE pour_clients AND est_actif;
 INSERT INTO public.transactions(date_transaction,id_client,id_produit,quantite,prix_unitaire,montant_total,id_utilisateur_creation)
 VALUES(day-5,customer,product,1,1,1,actor) RETURNING id_transaction INTO tx;
 INSERT INTO public.paiements(id_transaction,date_paiement,montant,type_paiement,statut,statut_cheque,date_encaissement_effective,id_utilisateur_creation)
 VALUES(tx,day-4,5,'cheque','valide','encaisse',day-2,actor) RETURNING id_paiement INTO cheque;
 BEGIN
  UPDATE public.paiements SET date_encaissement_effective=day-1 WHERE id_paiement=cheque;
  RAISE EXCEPTION 'QA unaudited cheque correction accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%operation is missing%' THEN RAISE; END IF;
 END;
 SELECT row_version,to_jsonb(p) INTO revision,snapshot FROM public.paiements p WHERE id_paiement=cheque;
 operation := gen_random_uuid();
 INSERT INTO public.correction_operations(operation_id,request_hash,id_utilisateur,reason,request_payload,result_payload)
 VALUES(operation,repeat('a',64),actor,'[QA 6D] clearing date',
  jsonb_build_object('target',jsonb_build_object('entity_type','paiement','entity_id',cheque,'expected_version',revision),
   'changes',jsonb_build_object('date_encaissement_effective',(day-1)::text)),
  jsonb_build_object('record',snapshot || jsonb_build_object('date_encaissement_effective',(day-1)::text,'row_version',revision+1)));
 PERFORM set_config('app.correction_operation_id',operation::text,true);
 UPDATE public.paiements SET date_encaissement_effective=day-1,id_utilisateur_modification=actor WHERE id_paiement=cheque;
 IF public.credit_transaction_capacity(tx,day-2,true)<>-1 OR public.credit_transaction_capacity(tx,day-1,true)<>4 THEN
  RAISE EXCEPTION 'QA cheque credit was available before clearing'; END IF;
 BEGIN
  INSERT INTO public.paiements(id_transaction,nature,date_paiement,montant,type_paiement,id_utilisateur_creation)
  VALUES(tx,'remboursement',day-2,1,'cash',actor);
  RAISE EXCEPTION 'QA refund consumed cheque before clearing';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%exceeds available transaction credit%' THEN RAISE; END IF; END;
 PERFORM set_config('app.correction_operation_id','',true);
 INSERT INTO public.paiements(id_transaction,nature,date_paiement,montant,type_paiement,id_utilisateur_creation)
 VALUES(tx,'remboursement',day,1,'cash',actor);
 BEGIN
  UPDATE public.paiements SET statut='annule' WHERE id_paiement=cheque;
  RAISE EXCEPTION 'QA canceled cheque with dependent refund';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%dependent refunds and allocations%' THEN RAISE; END IF; END;
 INSERT INTO public.lettres_credit(numero_reference,montant,date_emission,date_disponibilite,id_client,type_detenteur,id_utilisateur_creation)
 VALUES('[QA 6D] '||gen_random_uuid()::text,5,day-4,day-3,customer,'client',actor) RETURNING id_lc INTO lc;
 BEGIN
  UPDATE public.lettres_credit SET montant=6 WHERE id_lc=lc;
  RAISE EXCEPTION 'QA unaudited LC correction accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%matching audited operation%' THEN RAISE; END IF; END;
 SELECT to_jsonb(l) INTO snapshot FROM public.lettres_credit l WHERE id_lc=lc;
 operation := gen_random_uuid();
 INSERT INTO public.correction_operations(operation_id,request_hash,id_utilisateur,reason,request_payload,result_payload)
 VALUES(operation,repeat('b',64),actor,'[QA 6D] LC amount',
  jsonb_build_object('kind','lc_correction','id_lc',lc,'expected_version',0),
  jsonb_build_object('record',snapshot || jsonb_build_object('montant','6.00','version_utilisation',1)));
 PERFORM set_config('app.correction_operation_id',operation::text,true);
 UPDATE public.lettres_credit SET montant=6,version_utilisation=1,id_utilisateur_modification=actor WHERE id_lc=lc;
 INSERT INTO public.paiements(id_transaction,id_lc,date_paiement,montant,type_paiement,id_utilisateur_creation)
 VALUES(tx,lc,day-1,6,'lc',actor) RETURNING id_paiement INTO pay;
 SELECT row_version,to_jsonb(p) INTO revision,snapshot FROM public.paiements p WHERE id_paiement=pay;
 operation := gen_random_uuid();
 snapshot := snapshot || jsonb_build_object('montant','7.00','row_version',revision+1);
 INSERT INTO public.correction_operations(operation_id,request_hash,id_utilisateur,reason,request_payload,result_payload)
 VALUES(operation,repeat('c',64),actor,'[QA 6D] child authorization',
  jsonb_build_object('kind','lc_correction','id_lc',lc,'authorized_payments',jsonb_build_object(pay::text,
    jsonb_build_object('expected_version',revision,'after',snapshot))),
  jsonb_build_object('payments',jsonb_build_object(pay::text,snapshot)));
 PERFORM set_config('app.correction_operation_id',operation::text,true);
 BEGIN
  UPDATE public.paiements SET montant=7.01,id_utilisateur_modification=actor WHERE id_paiement=pay;
  RAISE EXCEPTION 'QA LC child saved unauthorized amount';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%amount does not match%' THEN RAISE; END IF; END;
 UPDATE public.paiements SET montant=7,id_utilisateur_modification=actor WHERE id_paiement=pay;
 IF (SELECT montant FROM public.paiements WHERE id_paiement=pay)<>7 THEN RAISE EXCEPTION 'QA authorized LC child failed'; END IF;
 INSERT INTO public.cessions_lc(id_lc,type_cedant,id_cedant_client,type_cessionnaire,id_cessionnaire_client,date_cession)
 VALUES(lc,'client',customer,'client',customer,day) RETURNING id_cession INTO transfer;
 BEGIN
  UPDATE public.cessions_lc SET date_cession=day-1 WHERE id_cession=transfer;
  RAISE EXCEPTION 'QA rewritten cession history';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%values are immutable%' THEN RAISE; END IF; END;
 BEGIN
  DELETE FROM public.cessions_lc WHERE id_cession=transfer;
  RAISE EXCEPTION 'QA deleted cession history';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%history cannot be deleted%' THEN RAISE; END IF; END;
END $qa$;
ROLLBACK;
SELECT 'Phase 6D guards passed; synthetic records rolled back' AS result;
