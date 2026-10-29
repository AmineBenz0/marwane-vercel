-- Run after fixture + foundation + replay, in the same disposable transaction.
DO $$ BEGIN
 IF (SELECT count(*) FROM public.entity_revisions)<>2 THEN RAISE EXCEPTION 'Baseline duplicated or missing'; END IF;
 IF (SELECT solde_actuel FROM public.vue_solde_caisse)<>10 THEN RAISE EXCEPTION 'Cash view includes canceled or non-cash entries'; END IF;
 IF (SELECT row_version FROM public.transactions WHERE id_transaction=1)<>1 THEN RAISE EXCEPTION 'Baseline changed current record'; END IF;
 IF has_table_privilege('app_runtime','public.transactions_audit','UPDATE') OR has_table_privilege('app_runtime','public.transactions_audit','DELETE') THEN RAISE EXCEPTION 'History privileges remain writable'; END IF;
 IF has_table_privilege('anon','public.egg_sale_allocations','SELECT') THEN RAISE EXCEPTION 'Allocation grant still exposed'; END IF;
 IF has_sequence_privilege('anon','public.entity_revisions_id_revision_seq','USAGE') THEN RAISE EXCEPTION 'Revision sequence exposed'; END IF;
END $$;
SET LOCAL ROLE app_runtime;
UPDATE public.transactions SET date_echeance='2026-10-12',id_utilisateur_modification=1 WHERE id_transaction=1;
DO $$ BEGIN
 IF (SELECT row_version FROM public.transactions WHERE id_transaction=1)<>2 THEN RAISE EXCEPTION 'Legacy write did not advance revision'; END IF;
 IF (SELECT before_snapshot->>'date_echeance' FROM public.entity_revisions WHERE entity_type='transaction' AND revision=2)<>'2026-10-10' THEN RAISE EXCEPTION 'Before snapshot lost'; END IF;
END $$;
UPDATE public.transactions SET date_echeance='2026-10-12',date_modification=now() WHERE id_transaction=1;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.entity_revisions)<>3 THEN RAISE EXCEPTION 'No-op creates history'; END IF;
END $$;
INSERT INTO public.correction_operations VALUES('11111111-1111-1111-1111-111111111111',repeat('a',64),1,'Correction test','{}','{}',now());
SELECT set_config('app.correction_operation_id','11111111-1111-1111-1111-111111111111',true);
UPDATE public.transactions SET date_echeance='2026-10-13' WHERE id_transaction=1;
DO $$ DECLARE blocked boolean:=false; BEGIN
 IF (SELECT operation_id FROM public.entity_revisions WHERE entity_type='transaction' AND revision=3) IS DISTINCT FROM '11111111-1111-1111-1111-111111111111'::uuid THEN RAISE EXCEPTION 'Operation correlation missing'; END IF;
 BEGIN UPDATE public.paiements SET montant=6 WHERE id_paiement=1; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Operation tag bypasses financial guard'; END IF;
END $$;
SELECT set_config('app.correction_operation_id','',true);
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN UPDATE public.transactions SET row_version=99 WHERE id_transaction=1; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Revision can be forged'; END IF;
END $$;
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN UPDATE public.entity_revisions SET event_kind='baseline'; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Revision can be rewritten'; END IF;
END $$;
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN DELETE FROM public.correction_operations; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Operation can be deleted'; END IF;
END $$;
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN TRUNCATE public.transactions_audit; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Audit can be truncated'; END IF;
END $$;
SELECT set_config('app.correction_operation_id','22222222-2222-2222-2222-222222222222',true);
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN UPDATE public.transactions SET date_echeance='2026-10-14' WHERE id_transaction=1; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Unknown operation accepted'; END IF;
 IF (SELECT row_version FROM public.transactions WHERE id_transaction=1)<>3 THEN RAISE EXCEPTION 'Failed operation partially changed version'; END IF;
END $$;
SELECT set_config('app.correction_operation_id','',true);
INSERT INTO public.correction_operations VALUES('33333333-3333-3333-3333-333333333333',repeat('b',64),2,'Other actor','{}','{}',now());
SELECT set_config('app.correction_operation_id','33333333-3333-3333-3333-333333333333',true);
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN UPDATE public.transactions SET date_echeance='2026-10-14' WHERE id_transaction=1; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Different operation actor accepted'; END IF;
 IF (SELECT row_version FROM public.transactions WHERE id_transaction=1)<>3 THEN RAISE EXCEPTION 'Actor mismatch partially changed row'; END IF;
END $$;
SELECT set_config('app.correction_operation_id','',true);
DO $$ DECLARE original_count integer; BEGIN
 SELECT count(*) INTO original_count FROM public.entity_revisions;
 BEGIN
  UPDATE public.transactions SET date_echeance='2026-10-14' WHERE id_transaction=1;
  RAISE EXCEPTION 'Simulated failure after successful write';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 IF (SELECT count(*) FROM public.entity_revisions)<>original_count OR (SELECT row_version FROM public.transactions WHERE id_transaction=1)<>3 THEN
  RAISE EXCEPTION 'Failed transaction retained revisions';
 END IF;
END $$;
INSERT INTO public.paiements(id_paiement,id_transaction,date_paiement,montant,type_paiement,statut,id_utilisateur_creation)
VALUES(2,1,'2026-10-03',2,'cash','valide',1);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entity_revisions WHERE entity_type='paiement' AND entity_id=2 AND revision=1 AND event_kind='insert') THEN RAISE EXCEPTION 'New records not captured'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.transactions_audit) THEN RAISE EXCEPTION 'Legacy audit writer lost insert permissions'; END IF;
END $$;
INSERT INTO public.correction_operations VALUES(
 '44444444-4444-4444-4444-444444444444',repeat('c',64),1,'Correct payment date and amount',
 '{"target":{"entity_type":"paiement","entity_id":1,"expected_version":1},"changes":{"date_paiement":"2026-10-04","montant":"6.00"}}',
 '{"record":{"date_paiement":"2026-10-04","montant":"6.00","row_version":2}}',now());
SELECT set_config('app.correction_operation_id','44444444-4444-4444-4444-444444444444',true);
UPDATE public.paiements SET date_paiement='2026-10-04',montant=6,id_utilisateur_modification=1 WHERE id_paiement=1;
DO $$ BEGIN
 IF (SELECT row_version FROM public.paiements WHERE id_paiement=1)<>2 THEN RAISE EXCEPTION 'Audited payment correction did not advance revision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.entity_revisions WHERE entity_type='paiement' AND entity_id=1 AND revision=2
    AND operation_id='44444444-4444-4444-4444-444444444444'::uuid AND after_snapshot->>'montant'='6') THEN
  RAISE EXCEPTION 'Audited payment correction was not linked to its immutable history';
 END IF;
END $$;
SELECT set_config('app.correction_operation_id','',true);
INSERT INTO public.correction_operations VALUES(
 '55555555-5555-5555-5555-555555555555',repeat('d',64),1,'Wrong requested value',
 '{"target":{"entity_type":"paiement","entity_id":1,"expected_version":2},"changes":{"montant":"7.00"}}',
 '{"record":{"montant":"8.00","row_version":3}}',now());
SELECT set_config('app.correction_operation_id','55555555-5555-5555-5555-555555555555',true);
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN UPDATE public.paiements SET montant=7,id_utilisateur_modification=1 WHERE id_paiement=1;
 EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked OR (SELECT row_version FROM public.paiements WHERE id_paiement=1)<>2 THEN
  RAISE EXCEPTION 'Mismatched correction result was accepted or partially applied';
 END IF;
END $$;
SELECT set_config('app.correction_operation_id','',true);
INSERT INTO public.correction_operations VALUES(
 '66666666-6666-6666-6666-666666666666',repeat('e',64),2,'Wrong actor',
 '{"target":{"entity_type":"paiement","entity_id":1,"expected_version":2},"changes":{"montant":"7.00"}}',
 '{"record":{"montant":"7.00","row_version":3}}',now());
SELECT set_config('app.correction_operation_id','66666666-6666-6666-6666-666666666666',true);
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN UPDATE public.paiements SET montant=7,id_utilisateur_modification=1 WHERE id_paiement=1;
 EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked OR (SELECT row_version FROM public.paiements WHERE id_paiement=1)<>2 THEN
  RAISE EXCEPTION 'Operation owned by another actor was accepted';
 END IF;
END $$;
SELECT set_config('app.correction_operation_id','',true);
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN INSERT INTO public.entity_revisions(entity_type,entity_id,revision,event_kind,after_snapshot) VALUES('transaction',1,999,'baseline','{"id_transaction":1,"row_version":null}'); EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Null revision accepted'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN UPDATE public.entity_revisions SET event_kind='baseline'; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'History trigger permits owner rewrite'; END IF;
END $$;
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN INSERT INTO public.entity_revisions(entity_type,entity_id,revision,event_kind,after_snapshot) VALUES('transaction',1,999,'baseline','{}'); EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Incomplete snapshot accepted'; END IF;
END $$;

-- Regression: the command serializes only explicitly supplied fields.
SET LOCAL ROLE app_runtime;
INSERT INTO public.correction_operations VALUES(
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('a',64),1,'Date-only correction',
 '{"target":{"entity_type":"paiement","entity_id":1,"expected_version":2},"changes":{"date_paiement":"2026-10-05"}}',
 '{"record":{"date_paiement":"2026-10-05","montant":"6.00","row_version":3}}',now());
SELECT set_config('app.correction_operation_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
UPDATE public.paiements SET date_paiement='2026-10-05',id_utilisateur_modification=1 WHERE id_paiement=1;
SELECT set_config('app.correction_operation_id','',true);
INSERT INTO public.correction_operations VALUES(
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',repeat('b',64),1,'Amount-only correction',
 '{"target":{"entity_type":"paiement","entity_id":1,"expected_version":3},"changes":{"montant":"7.00"}}',
 '{"record":{"date_paiement":"2026-10-05","montant":"7.00","row_version":4}}',now());
SELECT set_config('app.correction_operation_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
UPDATE public.paiements SET montant=7,id_utilisateur_modification=1 WHERE id_paiement=1;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.paiements WHERE id_paiement=1 AND date_paiement='2026-10-05' AND montant=7 AND row_version=4) THEN
  RAISE EXCEPTION 'Single-field correction regression';
 END IF;
 IF (SELECT count(*) FROM public.entity_revisions WHERE entity_type='paiement' AND entity_id=1 AND revision IN (3,4))<>2 THEN
  RAISE EXCEPTION 'Single-field corrections lost history';
 END IF;
END $$;
SELECT set_config('app.correction_operation_id','',true);
RESET ROLE;

-- Phase 3: method and funding-route fields remain protected by the same
-- operation/actor/revision/result contract as date and amount.
SET LOCAL ROLE app_runtime;
INSERT INTO public.correction_operations VALUES(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',repeat('c',64),1,'Change payment funding route',
 '{"target":{"entity_type":"paiement","entity_id":1,"expected_version":4},"changes":{"type_paiement":"virement","id_compte":9,"source_reglement":"banque"}}',
 '{"record":{"date_paiement":"2026-10-05","montant":"7.00","type_paiement":"virement","id_compte":9,"source_reglement":"banque","row_version":5}}',now());
SELECT set_config('app.correction_operation_id','cccccccc-cccc-cccc-cccc-cccccccccccc',true);
UPDATE public.paiements SET type_paiement='virement',id_compte=9,source_reglement='banque',id_utilisateur_modification=1 WHERE id_paiement=1;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.paiements WHERE id_paiement=1 AND type_paiement='virement' AND id_compte=9 AND source_reglement='banque' AND row_version=5) THEN
  RAISE EXCEPTION 'Audited payment route correction was not applied';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.entity_revisions WHERE entity_type='paiement' AND entity_id=1 AND revision=5
    AND operation_id='cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid) THEN
  RAISE EXCEPTION 'Payment route correction was not linked to history';
 END IF;
END $$;
SELECT set_config('app.correction_operation_id','',true);
INSERT INTO public.correction_operations VALUES(
 'dddddddd-dddd-dddd-dddd-dddddddddddd',repeat('d',64),1,'Mismatched bank account',
 '{"target":{"entity_type":"paiement","entity_id":1,"expected_version":5},"changes":{"id_compte":10}}',
 '{"record":{"date_paiement":"2026-10-05","montant":"7.00","type_paiement":"virement","id_compte":9,"source_reglement":"banque","row_version":6}}',now());
SELECT set_config('app.correction_operation_id','dddddddd-dddd-dddd-dddd-dddddddddddd',true);
DO $$ DECLARE blocked boolean:=false; BEGIN
 BEGIN UPDATE public.paiements SET id_compte=10,id_utilisateur_modification=1 WHERE id_paiement=1;
 EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked OR (SELECT id_compte FROM public.paiements WHERE id_paiement=1)<>9
    OR (SELECT row_version FROM public.paiements WHERE id_paiement=1)<>5 THEN
  RAISE EXCEPTION 'Mismatched bank-account correction was accepted or partially applied';
 END IF;
END $$;
SELECT set_config('app.correction_operation_id','',true);
RESET ROLE;
