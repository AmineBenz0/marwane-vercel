BEGIN;
-- Table: audit_connexions

-- Search foundation. Alembic is the canonical production migration path.
-- This block keeps fresh SQL bootstrap databases compatible with the application.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = public, extensions
AS $$ SELECT unaccent(input) $$;

CREATE TABLE audit_connexions (
	id_audit_connexion SERIAL NOT NULL, 
	email_utilisateur VARCHAR(255) NOT NULL, 
	date_tentative TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	succes BOOLEAN NOT NULL, 
	adresse_ip VARCHAR(45), 
	user_agent TEXT, 
	PRIMARY KEY (id_audit_connexion)
)

;
-- Table: batiments

CREATE TABLE batiments (
	id_batiment SERIAL NOT NULL, 
	nom VARCHAR(50) NOT NULL, 
	description VARCHAR(255), 
	est_actif BOOLEAN NOT NULL, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id_batiment), 
	UNIQUE (nom)
)

;

-- Initial production buildings
INSERT INTO batiments (nom, description, est_actif)
VALUES
    ('Bâtiment A', 'Bâtiment A', TRUE),
    ('Bâtiment B', 'Bâtiment B', TRUE),
    ('Bâtiment C', 'Bâtiment C', TRUE)
ON CONFLICT (nom) DO UPDATE
SET description = EXCLUDED.description,
    est_actif = TRUE

-- Table: comptes_bancaires

CREATE TABLE comptes_bancaires (
	id_compte SERIAL NOT NULL, 
	nom_banque VARCHAR(100) NOT NULL, 
	numero_compte VARCHAR(50) NOT NULL, 
	solde_actuel NUMERIC(15, 2) NOT NULL, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	date_modification TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id_compte), 
	UNIQUE (numero_compte)
)

;
-- Table: produits

CREATE TABLE produits (
	id_produit SERIAL NOT NULL, 
	nom_produit VARCHAR(255) NOT NULL, 
	type_produit VARCHAR(20) NOT NULL, 
	est_actif BOOLEAN NOT NULL, 
	pour_clients BOOLEAN NOT NULL, 
	pour_fournisseurs BOOLEAN NOT NULL, 
	PRIMARY KEY (id_produit), 
	CONSTRAINT check_au_moins_un_type CHECK (pour_clients = true OR pour_fournisseurs = true), 
	UNIQUE (nom_produit)
)

;
-- Table: utilisateurs

CREATE TABLE utilisateurs (
	id_utilisateur SERIAL NOT NULL, 
	nom_utilisateur VARCHAR(255) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	mot_de_passe_hash VARCHAR(255) NOT NULL, 
	role VARCHAR(50), 
	est_actif BOOLEAN NOT NULL, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	date_modification TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id_utilisateur)
)

;
-- Table: charges

CREATE TABLE charges (
	id_charge SERIAL NOT NULL, 
	libelle VARCHAR(200) NOT NULL, 
	montant NUMERIC(15, 2) NOT NULL, 
	date_charge DATE NOT NULL, 
	categorie VARCHAR(50) NOT NULL, 
	notes TEXT, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	date_modification TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur_creation INTEGER, 
	id_utilisateur_modification INTEGER, 
	id_compte INTEGER, 
	PRIMARY KEY (id_charge), 
	FOREIGN KEY(id_utilisateur_creation) REFERENCES utilisateurs (id_utilisateur), 
	FOREIGN KEY(id_utilisateur_modification) REFERENCES utilisateurs (id_utilisateur), 
	FOREIGN KEY(id_compte) REFERENCES comptes_bancaires (id_compte)
)

;
-- Table: clients

CREATE TABLE clients (
	id_client SERIAL NOT NULL, 
	nom_client VARCHAR(255) NOT NULL, 
	est_actif BOOLEAN NOT NULL, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	date_modification TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur_creation INTEGER, 
	id_utilisateur_modification INTEGER, 
	PRIMARY KEY (id_client), 
	FOREIGN KEY(id_utilisateur_creation) REFERENCES utilisateurs (id_utilisateur), 
	FOREIGN KEY(id_utilisateur_modification) REFERENCES utilisateurs (id_utilisateur)
)

;
-- Table: fournisseurs

CREATE TABLE fournisseurs (
	id_fournisseur SERIAL NOT NULL, 
	nom_fournisseur VARCHAR(255) NOT NULL, 
	est_actif BOOLEAN NOT NULL, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	date_modification TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur_creation INTEGER, 
	id_utilisateur_modification INTEGER, 
	PRIMARY KEY (id_fournisseur), 
	FOREIGN KEY(id_utilisateur_creation) REFERENCES utilisateurs (id_utilisateur), 
	FOREIGN KEY(id_utilisateur_modification) REFERENCES utilisateurs (id_utilisateur)
)

;
-- Table: productions

CREATE TABLE productions (
	id_production SERIAL NOT NULL, 
	date_production DATE NOT NULL, 
	id_batiment INTEGER NOT NULL, 
	type_oeuf VARCHAR(50) NOT NULL, 
	calibre VARCHAR(50), 
	nombre_oeufs INTEGER NOT NULL, 
	grammage NUMERIC(10, 2) NOT NULL, 
	nombre_cartons INTEGER NOT NULL, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	date_modification TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur_creation INTEGER, 
	id_utilisateur_modification INTEGER, 
	PRIMARY KEY (id_production), 
	CONSTRAINT check_nombre_oeufs_positif CHECK (nombre_oeufs >= 0), 
	CONSTRAINT check_grammage_positif CHECK (grammage >= 0), 
	FOREIGN KEY(id_batiment) REFERENCES batiments (id_batiment), 
	FOREIGN KEY(id_utilisateur_creation) REFERENCES utilisateurs (id_utilisateur), 
	FOREIGN KEY(id_utilisateur_modification) REFERENCES utilisateurs (id_utilisateur)
)

;
-- Table: transformations

CREATE TABLE transformations (
	id_transformation SERIAL NOT NULL, 
	date_transformation DATE NOT NULL, 
	notes VARCHAR(500), 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur INTEGER, 
	PRIMARY KEY (id_transformation), 
	FOREIGN KEY(id_utilisateur) REFERENCES utilisateurs (id_utilisateur)
)

;
-- Table: lettres_credit

CREATE TABLE lettres_credit (
	id_lc SERIAL NOT NULL, 
	numero_reference VARCHAR(50) NOT NULL, 
	numero_serie VARCHAR(50), 
	banque_emettrice VARCHAR(100), 
	montant NUMERIC(15, 2) NOT NULL, 
	date_emission DATE NOT NULL, 
	date_disponibilite DATE NOT NULL, 
	statut VARCHAR(20) NOT NULL, 
	type_detenteur VARCHAR(20) NOT NULL, 
	id_client INTEGER, 
	id_fournisseur INTEGER, 
	notes TEXT, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	date_modification TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur_creation INTEGER, 
	id_utilisateur_modification INTEGER, 
	PRIMARY KEY (id_lc), 
	CONSTRAINT check_lc_montant_positif CHECK (montant > 0), 
	CONSTRAINT check_lc_statut_valide CHECK (statut IN ('active', 'utilisee', 'cedee', 'expiree', 'annulee')), 
	CONSTRAINT check_lc_type_detenteur_valide CHECK (type_detenteur IN ('client', 'fournisseur')), 
	CONSTRAINT check_lc_detenteur_unifie CHECK ((id_client IS NOT NULL AND id_fournisseur IS NULL) OR (id_fournisseur IS NOT NULL AND id_client IS NULL)), 
	FOREIGN KEY(id_client) REFERENCES clients (id_client), 
	FOREIGN KEY(id_fournisseur) REFERENCES fournisseurs (id_fournisseur), 
	FOREIGN KEY(id_utilisateur_creation) REFERENCES utilisateurs (id_utilisateur), 
	FOREIGN KEY(id_utilisateur_modification) REFERENCES utilisateurs (id_utilisateur)
)

;
-- Table: transactions

CREATE TABLE transactions (
	id_transaction SERIAL NOT NULL, 
	date_transaction DATE NOT NULL, 
	id_produit INTEGER NOT NULL, 
	quantite INTEGER NOT NULL, 
	prix_unitaire NUMERIC(15, 2) NOT NULL, 
	montant_total NUMERIC(15, 2) NOT NULL, 
	est_actif BOOLEAN NOT NULL, 
	id_client INTEGER, 
	id_fournisseur INTEGER, 
	date_echeance DATE, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	date_modification TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur_creation INTEGER, 
	id_utilisateur_modification INTEGER, 
	PRIMARY KEY (id_transaction), 
	CONSTRAINT check_montant_positif CHECK (montant_total > 0), 
	CONSTRAINT check_quantite_positive CHECK (quantite > 0), 
	CONSTRAINT check_prix_unitaire_positive CHECK (prix_unitaire > 0), 
	CONSTRAINT check_client_ou_fournisseur CHECK ((id_client IS NOT NULL AND id_fournisseur IS NULL) OR (id_fournisseur IS NOT NULL AND id_client IS NULL)), 
	FOREIGN KEY(id_produit) REFERENCES produits (id_produit), 
	FOREIGN KEY(id_client) REFERENCES clients (id_client), 
	FOREIGN KEY(id_fournisseur) REFERENCES fournisseurs (id_fournisseur), 
	FOREIGN KEY(id_utilisateur_creation) REFERENCES utilisateurs (id_utilisateur), 
	FOREIGN KEY(id_utilisateur_modification) REFERENCES utilisateurs (id_utilisateur)
)

;
-- Table: transformation_lignes

CREATE TABLE transformation_lignes (
	id_ligne SERIAL NOT NULL, 
	id_transformation INTEGER NOT NULL, 
	id_produit INTEGER NOT NULL, 
	quantite NUMERIC(15, 2) NOT NULL, 
	type_ligne VARCHAR(10) NOT NULL, 
	PRIMARY KEY (id_ligne), 
	FOREIGN KEY(id_transformation) REFERENCES transformations (id_transformation), 
	FOREIGN KEY(id_produit) REFERENCES produits (id_produit)
)

;
-- Table: cessions_lc

CREATE TABLE cessions_lc (
	id_cession SERIAL NOT NULL, 
	id_lc INTEGER NOT NULL, 
	type_cedant VARCHAR(20) NOT NULL, 
	id_cedant_client INTEGER, 
	id_cedant_fournisseur INTEGER, 
	type_cessionnaire VARCHAR(20) NOT NULL, 
	id_cessionnaire_client INTEGER, 
	id_cessionnaire_fournisseur INTEGER, 
	date_cession DATE NOT NULL, 
	motif TEXT, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur_creation INTEGER, 
	PRIMARY KEY (id_cession), 
	FOREIGN KEY(id_lc) REFERENCES lettres_credit (id_lc), 
	FOREIGN KEY(id_cedant_client) REFERENCES clients (id_client), 
	FOREIGN KEY(id_cedant_fournisseur) REFERENCES fournisseurs (id_fournisseur), 
	FOREIGN KEY(id_cessionnaire_client) REFERENCES clients (id_client), 
	FOREIGN KEY(id_cessionnaire_fournisseur) REFERENCES fournisseurs (id_fournisseur), 
	FOREIGN KEY(id_utilisateur_creation) REFERENCES utilisateurs (id_utilisateur)
)

;
-- Table: paiements

CREATE TABLE paiements (
	id_paiement SERIAL NOT NULL, 
	id_transaction INTEGER NOT NULL, 
	id_lc INTEGER, 
	date_paiement DATE NOT NULL, 
	montant NUMERIC(15, 2) NOT NULL, 
	type_paiement VARCHAR(20) NOT NULL, 
	numero_cheque VARCHAR(50), 
	banque VARCHAR(100), 
	date_encaissement_prevue DATE, 
	date_encaissement_effective DATE, 
	statut_cheque VARCHAR(20), 
	motif_rejet TEXT, 
	reference_virement VARCHAR(100), 
	notes TEXT, 
	statut VARCHAR(20) NOT NULL, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	date_modification TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur_creation INTEGER, 
	id_utilisateur_modification INTEGER, 
	PRIMARY KEY (id_paiement), 
	CONSTRAINT check_paiement_montant_positif CHECK (montant > 0), 
	CONSTRAINT check_type_paiement_valide CHECK (type_paiement IN ('cash', 'cheque', 'virement', 'carte', 'compensation', 'lc', 'autre')), 
	CONSTRAINT check_statut_paiement_valide CHECK (statut IN ('valide', 'en_attente', 'rejete', 'annule')), 
	CONSTRAINT check_statut_cheque_valide CHECK (statut_cheque IS NULL OR statut_cheque IN ('emis', 'a_encaisser', 'encaisse', 'rejete', 'annule')), 
	FOREIGN KEY(id_transaction) REFERENCES transactions (id_transaction), 
	FOREIGN KEY(id_lc) REFERENCES lettres_credit (id_lc), 
	FOREIGN KEY(id_utilisateur_creation) REFERENCES utilisateurs (id_utilisateur), 
	FOREIGN KEY(id_utilisateur_modification) REFERENCES utilisateurs (id_utilisateur)
)

;
-- Table: transactions_audit

CREATE TABLE transactions_audit (
	id_audit SERIAL NOT NULL, 
	id_transaction INTEGER NOT NULL, 
	id_utilisateur INTEGER NOT NULL, 
	date_changement TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	champ_modifie VARCHAR(255), 
	ancienne_valeur TEXT, 
	nouvelle_valeur TEXT, 
	PRIMARY KEY (id_audit), 
	FOREIGN KEY(id_transaction) REFERENCES transactions (id_transaction), 
	FOREIGN KEY(id_utilisateur) REFERENCES utilisateurs (id_utilisateur)
)

;
-- Table: caisse

CREATE TABLE caisse (
	id_mouvement SERIAL NOT NULL, 
	date_mouvement TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	montant NUMERIC(15, 2) NOT NULL, 
	type_mouvement VARCHAR(10) NOT NULL, 
	id_transaction INTEGER, 
	id_paiement INTEGER, 
	id_charge INTEGER, 
	PRIMARY KEY (id_mouvement), 
	CONSTRAINT check_montant_caisse_positif CHECK (montant > 0), 
	CONSTRAINT check_type_mouvement CHECK (type_mouvement IN ('ENTREE', 'SORTIE')), 
	CONSTRAINT check_caisse_origine CHECK ((id_transaction IS NOT NULL) OR (id_charge IS NOT NULL)), 
	FOREIGN KEY(id_transaction) REFERENCES transactions (id_transaction), 
	FOREIGN KEY(id_paiement) REFERENCES paiements (id_paiement), 
	FOREIGN KEY(id_charge) REFERENCES charges (id_charge)
)

;
-- Table: mouvements_bancaires

CREATE TABLE mouvements_bancaires (
	id_mouvement SERIAL NOT NULL, 
	id_compte INTEGER NOT NULL, 
	date_mouvement TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	montant NUMERIC(15, 2) NOT NULL, 
	type_mouvement VARCHAR(10) NOT NULL, 
	source VARCHAR(50) NOT NULL, 
	reference VARCHAR(100), 
	notes VARCHAR(255), 
	id_paiement INTEGER, 
	id_charge INTEGER, 
	PRIMARY KEY (id_mouvement), 
	FOREIGN KEY(id_compte) REFERENCES comptes_bancaires (id_compte), 
	FOREIGN KEY(id_paiement) REFERENCES paiements (id_paiement), 
	FOREIGN KEY(id_charge) REFERENCES charges (id_charge)
)

;
-- Table: caisse_solde_historique

CREATE TABLE caisse_solde_historique (
	id_historique SERIAL NOT NULL, 
	date_snapshot TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	solde NUMERIC(15, 2) NOT NULL, 
	id_mouvement INTEGER, 
	PRIMARY KEY (id_historique), 
	FOREIGN KEY(id_mouvement) REFERENCES caisse (id_mouvement)
)

;

-- Initial Admin User
INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe_hash, role, est_actif)
VALUES ('Admin User', 'your-email@example.com', '$2b$12$O451vUQSekbPkMlSmHt.feS4.mhcYcOujPR41uAY2v.UZAoDfoqEy', 'admin', true);
COMMIT;

-- Search and operational indexes. Keep aligned with the Alembic foundation migration.
CREATE INDEX IF NOT EXISTS ix_clients_search_name
  ON clients USING gin (lower(public.immutable_unaccent(nom_client::text)) gin_trgm_ops)
  WHERE est_actif IS TRUE;
CREATE INDEX IF NOT EXISTS ix_fournisseurs_search_name
  ON fournisseurs USING gin (lower(public.immutable_unaccent(nom_fournisseur::text)) gin_trgm_ops)
  WHERE est_actif IS TRUE;
CREATE INDEX IF NOT EXISTS ix_produits_search_name
  ON produits USING gin (lower(public.immutable_unaccent(nom_produit::text)) gin_trgm_ops)
  WHERE est_actif IS TRUE;
CREATE INDEX IF NOT EXISTS ix_charges_search_label
  ON charges USING gin (lower(public.immutable_unaccent(libelle::text)) gin_trgm_ops)
  WHERE statut = 'active';
CREATE INDEX IF NOT EXISTS ix_lettres_credit_search_reference
  ON lettres_credit USING gin (lower(public.immutable_unaccent(numero_reference::text)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_transactions_supplier_due_active
  ON transactions (id_fournisseur, est_actif, date_echeance);
CREATE INDEX IF NOT EXISTS ix_transactions_client_due_active
  ON transactions (id_client, est_actif, date_echeance);
CREATE INDEX IF NOT EXISTS ix_transactions_date_active
  ON transactions (date_transaction, est_actif);
CREATE INDEX IF NOT EXISTS ix_paiements_transaction_state
  ON paiements (id_transaction, statut, statut_cheque);
CREATE INDEX IF NOT EXISTS ix_productions_building_date_active
  ON productions (id_batiment, date_production, est_actif);
CREATE INDEX IF NOT EXISTS ix_productions_cycle_date_active
  ON productions (id_cycle, date_production, est_actif);
CREATE INDEX IF NOT EXISTS ix_cycles_building_status_start
  ON cycles_production (id_batiment, statut, date_debut);
