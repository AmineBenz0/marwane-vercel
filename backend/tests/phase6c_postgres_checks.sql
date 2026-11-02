-- Run against staging only. Every synthetic record rolls back.
BEGIN;
DO $qa$
DECLARE actor integer; customer integer; product integer; account integer; source_id integer; target_id integer;
 ordinary integer; received integer; sent integer; advance_id uuid:=gen_random_uuid(); allocation_id uuid:=gen_random_uuid();
 return_id uuid:=gen_random_uuid(); bad_id uuid; bad_second uuid; movement integer; day date:=CURRENT_DATE; msg text;
BEGIN
 SELECT min(id_utilisateur) INTO actor FROM public.utilisateurs WHERE est_actif;
 SELECT min(id_client) INTO customer FROM public.clients WHERE est_actif;
 SELECT min(id_produit) INTO product FROM public.produits WHERE pour_clients AND est_actif;
 SELECT min(id_compte) INTO account FROM public.comptes_bancaires;
 INSERT INTO public.transactions(date_transaction,id_client,id_produit,quantite,prix_unitaire,montant_total,id_utilisateur_creation)
 VALUES(day-4,customer,product,10,1,10,actor) RETURNING id_transaction INTO source_id;
 INSERT INTO public.transactions(date_transaction,id_client,id_produit,quantite,prix_unitaire,montant_total,id_utilisateur_creation)
 VALUES(day-3,customer,product,8,1,8,actor) RETURNING id_transaction INTO target_id;
 INSERT INTO public.paiements(id_transaction,date_paiement,montant,type_paiement,id_utilisateur_creation)
 VALUES(source_id,day-3,20,'cash',actor) RETURNING id_paiement INTO ordinary;
 INSERT INTO public.caisse(id_transaction,id_paiement,date_mouvement,montant,type_mouvement)
 VALUES(source_id,ordinary,day-3,20,'ENTREE');
 -- Cash advance + real return require complete, matching effects and a journal.
 INSERT INTO public.avances(id_avance,id_client,date_effet,montant,type_paiement,reason,id_utilisateur_creation)
 VALUES(advance_id,customer,day-2,30,'cash','[QA 6C] rollback advance',actor);
 BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'QA missing movement accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> '23503' AND SQLERRM NOT LIKE '%operation journal is missing%' THEN RAISE; END IF;
 END;
 INSERT INTO public.correction_operations(operation_id,request_hash,id_utilisateur,reason,request_payload,result_payload)
 VALUES(advance_id,repeat('a',64),actor,'[QA 6C] advance','{"kind":"credit","action":"advance"}','{}');
 INSERT INTO public.caisse(id_avance,date_mouvement,montant,type_mouvement)
 VALUES(advance_id,day-2,30,'ENTREE') RETURNING id_mouvement INTO movement;
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 BEGIN
  UPDATE public.caisse SET id_avance=NULL WHERE id_mouvement=movement;
  RAISE EXCEPTION 'QA origin rewrite accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%origin is immutable%' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.avances SET montant=999 WHERE id_avance=advance_id;
  RAISE EXCEPTION 'QA financial rewrite accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '42501' AND SQLERRM NOT LIKE '%financial values and canceled history are immutable%' THEN RAISE; END IF; END;
 INSERT INTO public.avances(id_avance,id_origine,nature,id_client,date_effet,montant,type_paiement,id_compte,reason,id_utilisateur_creation)
 VALUES(return_id,advance_id,'retour_avance',customer,day-1,10,'virement',account,'[QA 6C] rollback return',actor);
 INSERT INTO public.mouvements_bancaires(id_avance,id_compte,date_mouvement,montant,type_mouvement,source)
 VALUES(return_id,account,day-1,10,'SORTIE','retour_avance');
 INSERT INTO public.correction_operations(operation_id,request_hash,id_utilisateur,reason,request_payload,result_payload)
 VALUES(return_id,repeat('b',64),actor,'[QA 6C] return','{"kind":"credit","action":"return_advance"}','{}');
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 IF public.credit_advance_available(advance_id)<>20 THEN RAISE EXCEPTION 'QA advance balance mismatch'; END IF;
 BEGIN
  INSERT INTO public.avances(id_avance,id_origine,nature,id_client,date_effet,montant,type_paiement,reason,id_utilisateur_creation)
  VALUES(gen_random_uuid(),advance_id,'retour_avance',customer,day,21,'cash','[QA 6C] excess return',actor);
  RAISE EXCEPTION 'QA excess return accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%exceeds available credit%' THEN RAISE; END IF; END;
 -- A transaction credit is paired; half a save cannot commit.
 INSERT INTO public.affectations_credit(id_affectation,id_transaction_source,id_transaction_cible,date_effet,montant,reason,id_utilisateur_creation)
 VALUES(allocation_id,source_id,target_id,day,4,'[QA 6C] paired allocation',actor);
 INSERT INTO public.correction_operations(operation_id,request_hash,id_utilisateur,reason,request_payload,result_payload)
 VALUES(allocation_id,repeat('c',64),actor,'[QA 6C] allocation','{"kind":"credit","action":"allocate"}','{}');
 INSERT INTO public.paiements(id_affectation,id_transaction,nature,date_paiement,montant,type_paiement,notes,id_utilisateur_creation)
 VALUES(allocation_id,target_id,'credit_recu',day,4,'compensation','[QA 6C] paired allocation',actor) RETURNING id_paiement INTO received;
 BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'QA half pair accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%all settlement sides together%' THEN RAISE; END IF; END;
 INSERT INTO public.paiements(id_affectation,id_transaction,nature,date_paiement,montant,type_paiement,notes,id_utilisateur_creation)
 VALUES(allocation_id,source_id,'credit_transfere',day,4,'compensation','[QA 6C] paired allocation',actor) RETURNING id_paiement INTO sent;
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 IF public.credit_transaction_capacity(source_id,day,true)<>6 OR public.credit_transaction_capacity(target_id,day,false)<>4 THEN
  RAISE EXCEPTION 'QA paired balance mismatch'; END IF;
 BEGIN
  INSERT INTO public.caisse(id_transaction,id_paiement,date_mouvement,montant,type_mouvement)
  VALUES(target_id,received,day,4,'ENTREE');
  RAISE EXCEPTION 'QA allocation invented cash';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%cannot create cash or bank money%' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO public.mouvements_bancaires(id_compte,id_paiement,date_mouvement,montant,type_mouvement,source)
  VALUES(account,received,day,4,'ENTREE','compensation');
  RAISE EXCEPTION 'QA allocation invented bank money';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%cannot create cash or bank money%' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.transactions SET est_actif=false WHERE id_transaction=target_id;
  RAISE EXCEPTION 'QA linked withdrawal accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%linked credit allocations%' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.paiements SET notes='Wrong' WHERE id_paiement=received;
  RAISE EXCEPTION 'QA isolated settlement rewrite accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%does not match its allocation%' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.avances SET statut='annule',motif_annulation='[QA 6C] cannot cancel used advance',date_annulation=now(),id_utilisateur_annulation=actor WHERE id_avance=advance_id;
  RAISE EXCEPTION 'QA used advance cancellation accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%active allocation or return%' THEN RAISE; END IF; END;
 -- The refund guard must deduct outgoing non-cash credit before allowing money out.
 BEGIN
  INSERT INTO public.paiements(id_transaction,nature,date_paiement,montant,type_paiement,id_utilisateur_creation)
  VALUES(source_id,'remboursement',day,7,'cash',actor);
  RAISE EXCEPTION 'QA refund ignored outgoing credit';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%exceeds available transaction credit%' THEN RAISE; END IF; END;
 -- Two complete allocations in one transaction still cannot overspend.
 BEGIN
  bad_id:=gen_random_uuid(); bad_second:=gen_random_uuid();
  INSERT INTO public.correction_operations(operation_id,request_hash,id_utilisateur,reason,request_payload,result_payload)
  VALUES(bad_id,repeat('d',64),actor,'[QA 6C] bulk one','{"kind":"credit","action":"allocate"}','{}'),
        (bad_second,repeat('e',64),actor,'[QA 6C] bulk two','{"kind":"credit","action":"allocate"}','{}');
  INSERT INTO public.affectations_credit(id_affectation,id_transaction_source,id_transaction_cible,date_effet,montant,reason,id_utilisateur_creation)
  VALUES(bad_id,source_id,target_id,day,4,'[QA 6C] bulk',actor),
        (bad_second,source_id,target_id,day,4,'[QA 6C] bulk',actor);
  INSERT INTO public.paiements(id_affectation,id_transaction,nature,date_paiement,montant,type_paiement,notes,id_utilisateur_creation)
  VALUES(bad_id,target_id,'credit_recu',day,4,'compensation','[QA 6C] bulk',actor),
        (bad_id,source_id,'credit_transfere',day,4,'compensation','[QA 6C] bulk',actor),
        (bad_second,target_id,'credit_recu',day,4,'compensation','[QA 6C] bulk',actor),
        (bad_second,source_id,'credit_transfere',day,4,'compensation','[QA 6C] bulk',actor);
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'QA bulk overspending accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%overspends source credit or target debt%' THEN RAISE; END IF; END;
 -- Canceling just one settlement side also fails at the transaction boundary.
 BEGIN
  UPDATE public.affectations_credit SET statut='annule',motif_annulation='[QA 6C] half cancellation',date_annulation=now(),id_utilisateur_annulation=actor WHERE id_affectation=allocation_id;
  UPDATE public.paiements SET statut='annule' WHERE id_paiement=received;
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'QA half cancellation accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%all settlement sides together%' THEN RAISE; END IF; END;
 -- Whole-pair cancellation works without rewriting financial columns.
 UPDATE public.affectations_credit SET statut='annule',motif_annulation='[QA 6C] cancellation',date_annulation=now(),id_utilisateur_annulation=actor WHERE id_affectation=allocation_id;
 UPDATE public.paiements SET statut='annule',motif_annulation='[QA 6C] cancellation',date_annulation=now(),id_utilisateur_modification=actor WHERE id_affectation=allocation_id;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF public.credit_transaction_capacity(source_id,day,true)<>10 OR public.credit_transaction_capacity(target_id,day,false)<>8 THEN
  RAISE EXCEPTION 'QA cancellation balance mismatch'; END IF;
END $qa$;
ROLLBACK;
SELECT 'Phase 6C database guards and atomicity passed; all synthetic records rolled back' AS result;
