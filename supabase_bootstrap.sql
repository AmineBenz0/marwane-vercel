-- Complete bootstrap for a NEW, EMPTY PostgreSQL/Supabase database.
-- Run this file once (for example, in the Supabase SQL Editor).
-- It creates the current application schema and seeds the three known buildings.
-- It intentionally does not create an administrator with a shared/default password.
-- Do not run on an existing database: use reviewed migrations for upgrades.
-- All DDL and seed data are in one transaction; any error rolls everything back.
BEGIN;
--
-- This consolidates supabase_init.sql and the current-model, LC, and search
-- compatibility migrations. Keep it aligned with backend SQLAlchemy metadata.
-- 1. Base tables and known reference data.
-- Table: audit_connexions

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
    est_actif = TRUE;

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
	statut VARCHAR(20) DEFAULT 'active' NOT NULL,
	id_cession_inverse INTEGER,
	motif_annulation TEXT,
	date_annulation TIMESTAMP WITH TIME ZONE,
	id_utilisateur_annulation INTEGER, 
	date_creation TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id_utilisateur_creation INTEGER, 
	PRIMARY KEY (id_cession), 
	FOREIGN KEY(id_lc) REFERENCES lettres_credit (id_lc), 
	FOREIGN KEY(id_cedant_client) REFERENCES clients (id_client), 
	FOREIGN KEY(id_cedant_fournisseur) REFERENCES fournisseurs (id_fournisseur), 
	FOREIGN KEY(id_cessionnaire_client) REFERENCES clients (id_client), 
	FOREIGN KEY(id_cessionnaire_fournisseur) REFERENCES fournisseurs (id_fournisseur), 
	FOREIGN KEY(id_utilisateur_creation) REFERENCES utilisateurs (id_utilisateur),
	FOREIGN KEY(id_cession_inverse) REFERENCES cessions_lc (id_cession) ON DELETE SET NULL,
	FOREIGN KEY(id_utilisateur_annulation) REFERENCES utilisateurs (id_utilisateur),
	CONSTRAINT check_cessions_lc_statut_valide CHECK (statut IN ('active', 'annulee'))
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

-- 2. Remaining tables and fields used by the current application models.
-- Additive migration for the current SQLAlchemy models.
-- Prerequisite: the baseline schema in supabase_init.sql must already exist.
-- This file does not drop data or create credentials.

CREATE TABLE IF NOT EXISTS cycles_production (
    id_cycle SERIAL PRIMARY KEY,
    id_batiment INTEGER NOT NULL REFERENCES batiments(id_batiment),
    nom_cycle VARCHAR(100) NOT NULL,
    souche VARCHAR(100),
    date_debut DATE NOT NULL,
    age_depart_semaines INTEGER NOT NULL DEFAULT 0,
    effectif_initial INTEGER,
    duree_semaines INTEGER NOT NULL DEFAULT 100,
    date_fin_prevue DATE NOT NULL,
    date_fin_reelle DATE,
    statut VARCHAR(30) NOT NULL DEFAULT 'actif',
    notes TEXT,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_utilisateur_creation INTEGER REFERENCES utilisateurs(id_utilisateur),
    id_utilisateur_modification INTEGER REFERENCES utilisateurs(id_utilisateur)
);

CREATE TABLE IF NOT EXISTS corrections_financieres (
    id_correction SERIAL PRIMARY KEY,
    type_entite VARCHAR(30) NOT NULL,
    id_entite INTEGER NOT NULL,
    action VARCHAR(30) NOT NULL,
    id_mouvement_original INTEGER,
    id_mouvement_inverse INTEGER,
    raison TEXT NOT NULL,
    details TEXT,
    id_utilisateur INTEGER REFERENCES utilisateurs(id_utilisateur),
    date_correction TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mouvements_stock (
    id_mouvement_stock SERIAL PRIMARY KEY,
    id_produit INTEGER NOT NULL REFERENCES produits(id_produit),
    quantite_delta NUMERIC(15,3) NOT NULL CHECK (quantite_delta <> 0),
    cout_unitaire NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (cout_unitaire >= 0),
    type_mouvement VARCHAR(40) NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_id INTEGER,
    cle_idempotence VARCHAR(120) UNIQUE,
    id_mouvement_inverse INTEGER REFERENCES mouvements_stock(id_mouvement_stock),
    date_mouvement TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_utilisateur INTEGER REFERENCES utilisateurs(id_utilisateur),
    notes TEXT,
    CONSTRAINT uq_stock_source_movement UNIQUE (source_type, source_id, type_mouvement, id_produit, id_mouvement_inverse)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_source_movement_active
    ON mouvements_stock(source_type, source_id, type_mouvement, id_produit)
    WHERE id_mouvement_inverse IS NULL;

CREATE TABLE IF NOT EXISTS job_executions (
    id_execution SERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    statut VARCHAR(20) NOT NULL DEFAULT 'running'
        CHECK (statut IN ('running', 'succeeded', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_count INTEGER NOT NULL DEFAULT 0 CHECK (created_count >= 0),
    failure_type VARCHAR(100),
    failure_message TEXT
);

CREATE TABLE IF NOT EXISTS nomenclatures (
    id_nomenclature SERIAL PRIMARY KEY,
    id_produit_sortie INTEGER NOT NULL REFERENCES produits(id_produit),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    est_active BOOLEAN NOT NULL DEFAULT TRUE,
    date_debut DATE,
    date_fin DATE,
    quantite_sortie NUMERIC(15,3) NOT NULL DEFAULT 1 CHECK (quantite_sortie > 0),
    rendement_pct NUMERIC(5,2) NOT NULL DEFAULT 100
        CHECK (rendement_pct > 0 AND rendement_pct <= 100),
    notes TEXT,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_utilisateur INTEGER REFERENCES utilisateurs(id_utilisateur),
    CONSTRAINT uq_bom_product_version UNIQUE (id_produit_sortie, version)
);

CREATE TABLE IF NOT EXISTS nomenclature_lignes (
    id_ligne SERIAL PRIMARY KEY,
    id_nomenclature INTEGER NOT NULL REFERENCES nomenclatures(id_nomenclature),
    id_produit_entree INTEGER NOT NULL REFERENCES produits(id_produit),
    quantite NUMERIC(15,3) NOT NULL CHECK (quantite > 0),
    CONSTRAINT uq_bom_input_product UNIQUE (id_nomenclature, id_produit_entree)
);

CREATE TABLE IF NOT EXISTS taches (
    id_tache SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut TIMESTAMPTZ NOT NULL,
    date_fin TIMESTAMPTZ,
    est_toute_la_journee BOOLEAN NOT NULL DEFAULT FALSE,
    statut VARCHAR(20) NOT NULL DEFAULT 'en_attente'
        CHECK (statut IN ('en_attente', 'en_cours', 'complete', 'annule')),
    priorite VARCHAR(20) NOT NULL DEFAULT 'moyenne'
        CHECK (priorite IN ('basse', 'moyenne', 'haute')),
    categorie VARCHAR(50),
    id_utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id_utilisateur),
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alertes (
    id_alerte SERIAL PRIMARY KEY,
    id_transaction INTEGER REFERENCES transactions(id_transaction),
    type_alerte VARCHAR(40) NOT NULL,
    titre VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    date_reference DATE NOT NULL,
    est_lue BOOLEAN NOT NULL DEFAULT FALSE,
    date_lecture TIMESTAMPTZ,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_alert_transaction_type_date
        UNIQUE (id_transaction, type_alerte, date_reference)
);

ALTER TABLE productions
    ADD COLUMN IF NOT EXISTS id_cycle INTEGER REFERENCES cycles_production(id_cycle),
    ADD COLUMN IF NOT EXISTS mortalite INTEGER,
    ADD COLUMN IF NOT EXISTS consommation_aliment_kg NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS formule VARCHAR(100),
    ADD COLUMN IF NOT EXISTS est_actif BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
    ADD COLUMN IF NOT EXISTS id_utilisateur_annulation INTEGER REFERENCES utilisateurs(id_utilisateur);

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS id_batiment INTEGER REFERENCES batiments(id_batiment),
    ADD COLUMN IF NOT EXISTS id_cycle INTEGER REFERENCES cycles_production(id_cycle),
    ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
    ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS id_utilisateur_annulation INTEGER REFERENCES utilisateurs(id_utilisateur);

ALTER TABLE transformations
    ADD COLUMN IF NOT EXISTS id_nomenclature INTEGER REFERENCES nomenclatures(id_nomenclature),
    ADD COLUMN IF NOT EXISTS quantite_sortie NUMERIC(15,3),
    ADD COLUMN IF NOT EXISTS cout_total NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS cle_idempotence VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transformations_cle_idempotence
    ON transformations(cle_idempotence) WHERE cle_idempotence IS NOT NULL;

ALTER TABLE charges
    ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
    ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS statut VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE charges DROP CONSTRAINT IF EXISTS check_statut_charge_valide;
ALTER TABLE charges ADD CONSTRAINT check_statut_charge_valide
    CHECK (statut IN ('active', 'annule'));

ALTER TABLE paiements
    ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
    ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cle_idempotence VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS uq_paiements_cle_idempotence
    ON paiements(cle_idempotence) WHERE cle_idempotence IS NOT NULL;

ALTER TABLE caisse
    ADD COLUMN IF NOT EXISTS statut VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
    ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS id_utilisateur_annulation INTEGER REFERENCES utilisateurs(id_utilisateur),
    ADD COLUMN IF NOT EXISTS id_mouvement_inverse INTEGER REFERENCES caisse(id_mouvement);
ALTER TABLE caisse DROP CONSTRAINT IF EXISTS check_statut_caisse_valide;
ALTER TABLE caisse ADD CONSTRAINT check_statut_caisse_valide
    CHECK (statut IN ('active', 'annule'));

ALTER TABLE mouvements_bancaires
    ADD COLUMN IF NOT EXISTS statut VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS cle_idempotence VARCHAR(120),
    ADD COLUMN IF NOT EXISTS id_utilisateur_creation INTEGER REFERENCES utilisateurs(id_utilisateur),
    ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
    ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS id_utilisateur_annulation INTEGER REFERENCES utilisateurs(id_utilisateur),
    ADD COLUMN IF NOT EXISTS id_mouvement_inverse INTEGER REFERENCES mouvements_bancaires(id_mouvement);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mouvements_bancaires_cle_idempotence
    ON mouvements_bancaires(cle_idempotence) WHERE cle_idempotence IS NOT NULL;
ALTER TABLE mouvements_bancaires DROP CONSTRAINT IF EXISTS check_statut_mouvement_bancaire_valide;
ALTER TABLE mouvements_bancaires ADD CONSTRAINT check_statut_mouvement_bancaire_valide
    CHECK (statut IN ('active', 'annule'));

CREATE INDEX IF NOT EXISTS ix_cycles_production_batiment ON cycles_production(id_batiment);
CREATE INDEX IF NOT EXISTS ix_cycles_production_statut ON cycles_production(statut);
CREATE INDEX IF NOT EXISTS ix_productions_cycle ON productions(id_cycle);
CREATE INDEX IF NOT EXISTS ix_productions_est_actif ON productions(est_actif);
CREATE INDEX IF NOT EXISTS ix_transactions_batiment ON transactions(id_batiment);
CREATE INDEX IF NOT EXISTS ix_transactions_cycle ON transactions(id_cycle);
CREATE INDEX IF NOT EXISTS ix_alertes_transaction ON alertes(id_transaction);
CREATE INDEX IF NOT EXISTS ix_alertes_type ON alertes(type_alerte);
CREATE INDEX IF NOT EXISTS ix_alertes_date_reference ON alertes(date_reference);
CREATE INDEX IF NOT EXISTS ix_taches_date_debut ON taches(date_debut);
CREATE INDEX IF NOT EXISTS ix_taches_utilisateur ON taches(id_utilisateur);

-- 3. LC cession cancellation fields and relationships.
-- Track LC cession cancellations and their compensating cession rows.
ALTER TABLE cessions_lc
    ADD COLUMN IF NOT EXISTS statut VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS id_cession_inverse INTEGER,
    ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
    ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS id_utilisateur_annulation INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_cessions_lc_statut_valide'
    ) THEN
        ALTER TABLE cessions_lc
            ADD CONSTRAINT check_cessions_lc_statut_valide
            CHECK (statut IN ('active', 'annulee'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_cessions_lc_inverse'
    ) THEN
        ALTER TABLE cessions_lc
            ADD CONSTRAINT fk_cessions_lc_inverse
            FOREIGN KEY (id_cession_inverse)
            REFERENCES cessions_lc (id_cession)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_cessions_lc_utilisateur_annulation'
    ) THEN
        ALTER TABLE cessions_lc
            ADD CONSTRAINT fk_cessions_lc_utilisateur_annulation
            FOREIGN KEY (id_utilisateur_annulation)
            REFERENCES utilisateurs (id_utilisateur);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_cessions_lc_id_cession_inverse
    ON cessions_lc (id_cession_inverse);
CREATE INDEX IF NOT EXISTS ix_cessions_lc_date_annulation
    ON cessions_lc (date_annulation);

-- 4. LC usage versioning, reversal integrity, and status constraints.
-- Apply before deploying the LC reuse code. Safe to replay on an existing DB.
-- Preserve legacy cancellation audit columns; their removal is a separate migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.lettres_credit, public.cessions_lc,
    public.paiements, public.mouvements_bancaires IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
    needs_backfill BOOLEAN :=
        NOT EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'lettres_credit'
                AND column_name = 'version_utilisation')
        OR NOT EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'cessions_lc'
                AND column_name = 'id_cession_origine');
BEGIN
    ALTER TABLE public.lettres_credit
        ADD COLUMN IF NOT EXISTS version_utilisation INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.cessions_lc
        ADD COLUMN IF NOT EXISTS id_cession_origine INTEGER;

    IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cessions_lc'
            AND column_name = 'id_cession_inverse')
        AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cessions_lc'
            AND column_name = 'statut') THEN
        -- Reject ambiguous history instead of reactivating an already reversed use.
        IF EXISTS (
            SELECT 1 FROM public.cessions_lc original
            LEFT JOIN public.cessions_lc reversal
                ON reversal.id_cession = original.id_cession_inverse
            WHERE original.statut = 'annulee' AND (
                reversal.id_cession IS NULL
                OR reversal.id_cession_inverse IS DISTINCT FROM original.id_cession
                OR reversal.statut IS DISTINCT FROM 'active'
                OR reversal.id_lc IS DISTINCT FROM original.id_lc
            )
        ) THEN
            RAISE EXCEPTION 'LC migration: an existing cancellation has no unambiguous reversal';
        END IF;

        -- A bilateral link must become ONE pointer: reversal -> cancelled original.
        UPDATE public.cessions_lc reversal
        SET id_cession_origine = original.id_cession
        FROM public.cessions_lc original
        WHERE original.statut = 'annulee' AND reversal.statut = 'active'
            AND original.id_cession_inverse = reversal.id_cession
            AND reversal.id_cession_inverse = original.id_cession
            AND reversal.id_cession_origine IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.cessions_lc reversal
        JOIN public.cessions_lc original
            ON original.id_cession = reversal.id_cession_origine
        WHERE original.id_cession_origine IS NOT NULL
            OR original.id_lc <> reversal.id_lc
    ) THEN
        RAISE EXCEPTION 'LC migration: invalid reversal chain';
    END IF;

    IF needs_backfill THEN
        UPDATE public.lettres_credit lc
        SET statut = CASE WHEN
            EXISTS (SELECT 1 FROM public.paiements p
                WHERE p.id_lc = lc.id_lc AND p.statut <> 'annule')
            OR EXISTS (SELECT 1 FROM public.mouvements_bancaires mb
                WHERE mb.source = 'lc' AND mb.reference = lc.numero_reference
                    AND mb.statut = 'active')
            OR EXISTS (SELECT 1 FROM public.cessions_lc c
                WHERE c.id_lc = lc.id_lc AND c.id_cession_origine IS NULL
                    AND NOT EXISTS (SELECT 1 FROM public.cessions_lc r
                        WHERE r.id_cession_origine = c.id_cession))
            THEN 'utilisee' ELSE 'active' END;
        UPDATE public.lettres_credit
        SET version_utilisation = GREATEST(version_utilisation, 1)
        WHERE statut = 'utilisee';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.cessions_lc'::regclass
            AND conname = 'fk_cessions_lc_origine') THEN
        ALTER TABLE public.cessions_lc
            ADD CONSTRAINT fk_cessions_lc_origine
            FOREIGN KEY (id_cession_origine)
            REFERENCES public.cessions_lc(id_cession) ON DELETE SET NULL;
    END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cessions_lc_one_reversal
    ON public.cessions_lc(id_cession_origine);
ALTER TABLE public.lettres_credit DROP CONSTRAINT IF EXISTS check_lc_statut_valide;
ALTER TABLE public.lettres_credit ADD CONSTRAINT check_lc_statut_valide
    CHECK (statut IN ('active', 'utilisee'));

-- 5. Search functions and operational indexes.
-- Compatibility bootstrap for SQL-based fresh database setup.
-- Canonical production migration: backend/alembic/versions/20260911_search_performance.py
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = public, extensions
AS $$ SELECT unaccent(value) $$;

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

COMMIT;
