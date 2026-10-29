-- Synthetic disposable PostgreSQL fixture. Never execute against live public.
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN CREATE ROLE app_runtime; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO app_runtime;
CREATE TABLE public.utilisateurs(id_utilisateur integer PRIMARY KEY);
INSERT INTO public.utilisateurs VALUES(1),(2);
CREATE TABLE public.transactions(id_transaction integer PRIMARY KEY,date_transaction date NOT NULL,
    date_echeance date, quantite integer, prix_unitaire numeric, montant_total numeric,
    est_actif boolean DEFAULT true,id_client integer,id_utilisateur_creation integer REFERENCES public.utilisateurs,
    id_utilisateur_modification integer REFERENCES public.utilisateurs,date_modification timestamptz DEFAULT now());
CREATE TABLE public.paiements(id_paiement integer PRIMARY KEY,id_transaction integer REFERENCES public.transactions,
    date_paiement date,montant numeric,type_paiement text,id_lc integer,id_compte integer,source_reglement text,
    statut text,notes text,id_utilisateur_creation integer REFERENCES public.utilisateurs,
    id_utilisateur_modification integer REFERENCES public.utilisateurs,date_modification timestamptz DEFAULT now());
CREATE TABLE public.transactions_audit(id_audit serial PRIMARY KEY,id_transaction integer,champ_modifie text);
CREATE TABLE public.corrections_financieres(id_correction serial PRIMARY KEY,raison text);
CREATE TABLE public.caisse(id_mouvement serial PRIMARY KEY,date_mouvement timestamptz DEFAULT now(),montant numeric,
    type_mouvement text,statut text,id_transaction integer,id_paiement integer,id_charge integer,id_cession integer);
CREATE TABLE public.mouvements_bancaires(id_mouvement serial PRIMARY KEY,id_compte integer,date_mouvement timestamptz,
    montant numeric,type_mouvement text,source text,reference text,id_paiement integer,id_charge integer);
CREATE TABLE public.egg_sale_allocations(id serial PRIMARY KEY,quantite integer);
GRANT SELECT,INSERT,UPDATE ON public.transactions,public.paiements,public.caisse TO app_runtime;
GRANT ALL ON public.transactions_audit TO app_runtime;
GRANT USAGE,SELECT ON SEQUENCE public.transactions_audit_id_audit_seq TO app_runtime;
GRANT ALL ON public.egg_sale_allocations TO anon,authenticated,app_runtime;
INSERT INTO public.transactions VALUES(1,'2026-10-01','2026-10-10',10,2,20,true,1,1,NULL,now());
INSERT INTO public.paiements VALUES(1,1,'2026-10-02',5,'cash',NULL,NULL,NULL,'valide','original',1,NULL,now());
INSERT INTO public.caisse(montant,type_mouvement,statut) VALUES(10,'ENTREE','active'),(90,'ENTREE','annule');
INSERT INTO public.caisse(montant,type_mouvement,statut,id_cession) VALUES(50,'SORTIE','active',1);
CREATE VIEW public.vue_solde_caisse AS SELECT sum(montant) solde_actuel,max(date_mouvement) derniere_maj FROM public.caisse;
CREATE FUNCTION public.protect_financial_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='paiements' AND (OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
    OR OLD.date_paiement IS DISTINCT FROM NEW.date_paiement OR OLD.montant IS DISTINCT FROM NEW.montant
    OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement OR OLD.id_lc IS DISTINCT FROM NEW.id_lc) THEN
    RAISE EXCEPTION 'Payment financial identity is immutable; void and recreate it';
 END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_protect_payment_identity BEFORE UPDATE ON public.paiements FOR EACH ROW EXECUTE FUNCTION public.protect_financial_identity();
CREATE FUNCTION public.fixture_audit_writer() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN
 INSERT INTO public.transactions_audit(id_transaction,champ_modifie) VALUES(NEW.id_transaction,'fixture');
 RETURN NEW;
END $$;
CREATE TRIGGER trigger_audit_transactions AFTER UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.fixture_audit_writer();
