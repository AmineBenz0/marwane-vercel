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

-- 6. Shared production arrivals and building allocations.
-- Shared arrival lots; safe to replay on an existing SQL-managed database.
-- Run with the maintenance connection before deploying the shared-lot release.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.lots_production (
    id_lot SERIAL PRIMARY KEY,
    nom_lot VARCHAR(100) NOT NULL,
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
    id_utilisateur_creation INTEGER REFERENCES public.utilisateurs(id_utilisateur),
    id_utilisateur_modification INTEGER REFERENCES public.utilisateurs(id_utilisateur)
);
ALTER TABLE public.cycles_production ADD COLUMN IF NOT EXISTS id_lot INTEGER;
DO $migration$
DECLARE old_cycle RECORD; new_lot INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.cycles_production'::regclass AND conname = 'fk_cycles_production_lot') THEN
        ALTER TABLE public.cycles_production ADD CONSTRAINT fk_cycles_production_lot
            FOREIGN KEY (id_lot) REFERENCES public.lots_production(id_lot);
    END IF;
    -- Never guess which historical buildings shared an arrival.
    -- Each existing cycle becomes its own parent, keeping all original record IDs.
    FOR old_cycle IN SELECT * FROM public.cycles_production WHERE id_lot IS NULL ORDER BY id_cycle
    LOOP
        INSERT INTO public.lots_production (
            nom_lot, souche, date_debut, age_depart_semaines, effectif_initial,
            duree_semaines, date_fin_prevue, date_fin_reelle, statut, notes,
            date_creation, date_modification, id_utilisateur_creation, id_utilisateur_modification
        ) VALUES (
            old_cycle.nom_cycle, old_cycle.souche, old_cycle.date_debut,
            old_cycle.age_depart_semaines, old_cycle.effectif_initial, old_cycle.duree_semaines,
            old_cycle.date_fin_prevue, old_cycle.date_fin_reelle,
            CASE WHEN old_cycle.statut = 'a_cloturer' THEN 'actif' ELSE old_cycle.statut END,
            old_cycle.notes, old_cycle.date_creation, old_cycle.date_modification,
            old_cycle.id_utilisateur_creation, old_cycle.id_utilisateur_modification
        ) RETURNING id_lot INTO new_lot;
        UPDATE public.cycles_production SET id_lot = new_lot,
            statut = CASE WHEN statut = 'a_cloturer' THEN 'actif' ELSE statut END
            WHERE id_cycle = old_cycle.id_cycle;
    END LOOP;
END $migration$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cycle_lot_batiment ON public.cycles_production(id_lot, id_batiment);
CREATE INDEX IF NOT EXISTS ix_cycles_production_id_lot ON public.cycles_production(id_lot);
CREATE INDEX IF NOT EXISTS ix_lots_production_date_debut ON public.lots_production(date_debut);
CREATE INDEX IF NOT EXISTS ix_lots_production_statut ON public.lots_production(statut);
CREATE INDEX IF NOT EXISTS ix_lots_production_id_lot ON public.lots_production(id_lot);

ALTER TABLE public.lots_production ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lots_production FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.lots_production_id_lot_seq FROM PUBLIC;
DO $security$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON public.lots_production FROM anon;
        REVOKE ALL ON SEQUENCE public.lots_production_id_lot_seq FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON public.lots_production FROM authenticated;
        REVOKE ALL ON SEQUENCE public.lots_production_id_lot_seq FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        GRANT SELECT, INSERT, UPDATE ON public.lots_production TO app_runtime;
        GRANT USAGE, SELECT ON SEQUENCE public.lots_production_id_lot_seq TO app_runtime;
        DROP POLICY IF EXISTS app_runtime_access ON public.lots_production;
        CREATE POLICY app_runtime_access ON public.lots_production
            FOR ALL TO app_runtime USING (true) WITH CHECK (true);
    END IF;
END $security$;

-- BEGIN correction_history_foundation (canonical migration)
ALTER TABLE public.caisse ADD COLUMN IF NOT EXISTS id_cession integer REFERENCES public.cessions_lc(id_cession);
-- Correction foundation. Run atomically, with the maintenance role.
-- Replay-safe; no balance repairs, source inference, or financial unlock.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.correction_operations (
    operation_id uuid PRIMARY KEY,
    request_hash varchar(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    id_utilisateur integer NOT NULL REFERENCES public.utilisateurs(id_utilisateur),
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
    request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
    result_payload jsonb NOT NULL CHECK (jsonb_typeof(result_payload) = 'object'),
    recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_correction_operations_actor_time
    ON public.correction_operations(id_utilisateur, recorded_at);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);
ALTER TABLE public.paiements ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

CREATE TABLE IF NOT EXISTS public.entity_revisions (
    id_revision bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    entity_type varchar(20) NOT NULL CHECK (entity_type IN ('transaction', 'paiement')),
    entity_id integer NOT NULL CHECK (entity_id > 0),
    revision bigint NOT NULL CHECK (revision > 0),
    operation_id uuid REFERENCES public.correction_operations(operation_id),
    event_kind varchar(12) NOT NULL CHECK (event_kind IN ('baseline', 'insert', 'update')),
    before_snapshot jsonb,
    after_snapshot jsonb NOT NULL CHECK (jsonb_typeof(after_snapshot) = 'object'),
    id_utilisateur integer REFERENCES public.utilisateurs(id_utilisateur),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_entity_revision UNIQUE(entity_type, entity_id, revision),
    CONSTRAINT check_revision_after_version CHECK (coalesce(after_snapshot ? 'row_version' AND (after_snapshot->>'row_version')::bigint = revision,false)),
    CONSTRAINT check_revision_identity CHECK (
        coalesce(after_snapshot ? (CASE WHEN entity_type='transaction' THEN 'id_transaction' ELSE 'id_paiement' END)
        AND (after_snapshot->>(CASE WHEN entity_type='transaction' THEN 'id_transaction' ELSE 'id_paiement' END))::integer=entity_id,false)
    ),
    CONSTRAINT check_revision_before CHECK (
        (event_kind IN ('baseline','insert') AND before_snapshot IS NULL)
        OR (event_kind='update' AND before_snapshot IS NOT NULL
            AND jsonb_typeof(before_snapshot)='object' AND before_snapshot ? 'row_version'
            AND coalesce((before_snapshot->>'row_version')::bigint = revision - 1,false))
    )
);
CREATE INDEX IF NOT EXISTS ix_entity_revisions_operation ON public.entity_revisions(operation_id);
CREATE INDEX IF NOT EXISTS ix_entity_revisions_time ON public.entity_revisions(recorded_at);
ALTER TABLE public.corrections_financieres ADD COLUMN IF NOT EXISTS operation_id uuid;
DO $foundation$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_financial_correction_operation'
                   AND conrelid='public.corrections_financieres'::regclass) THEN
        ALTER TABLE public.corrections_financieres ADD CONSTRAINT fk_financial_correction_operation
            FOREIGN KEY(operation_id) REFERENCES public.correction_operations(operation_id);
    END IF;
END $foundation$;
CREATE INDEX IF NOT EXISTS ix_financial_correction_operation ON public.corrections_financieres(operation_id);

-- Capture truth as observed at installation, never invented earlier history.
INSERT INTO public.entity_revisions(entity_type,entity_id,revision,event_kind,after_snapshot,id_utilisateur)
SELECT 'transaction',t.id_transaction,t.row_version,'baseline',to_jsonb(t),
       coalesce(t.id_utilisateur_modification,t.id_utilisateur_creation)
FROM public.transactions t
WHERE NOT EXISTS(SELECT 1 FROM public.entity_revisions r WHERE r.entity_type='transaction' AND r.entity_id=t.id_transaction)
ON CONFLICT(entity_type,entity_id,revision) DO NOTHING;
INSERT INTO public.entity_revisions(entity_type,entity_id,revision,event_kind,after_snapshot,id_utilisateur)
SELECT 'paiement',p.id_paiement,p.row_version,'baseline',to_jsonb(p),
       coalesce(p.id_utilisateur_modification,p.id_utilisateur_creation)
FROM public.paiements p
WHERE NOT EXISTS(SELECT 1 FROM public.entity_revisions r WHERE r.entity_type='paiement' AND r.entity_id=p.id_paiement)
ON CONFLICT(entity_type,entity_id,revision) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_correction_row_version() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.row_version IS DISTINCT FROM 1::bigint THEN
            RAISE EXCEPTION 'Initial revision must be one';
        END IF;
    ELSE
        IF NEW.row_version IS DISTINCT FROM OLD.row_version THEN
            RAISE EXCEPTION 'Revision metadata is managed by the database';
        END IF;
        IF (to_jsonb(NEW) - ARRAY['row_version','date_modification'])
            IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['row_version','date_modification']) THEN
            NEW.row_version := OLD.row_version + 1;
        END IF;
    END IF;
    RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.capture_correction_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
    actor integer;
    operation_actor integer;
    operation_uuid uuid;
    kind text;
    record_id integer;
BEGIN
    IF TG_OP='UPDATE' AND NEW.row_version=OLD.row_version THEN RETURN NEW; END IF;
    actor := coalesce(NEW.id_utilisateur_modification,NEW.id_utilisateur_creation);
    operation_uuid := nullif(current_setting('app.correction_operation_id',true),'')::uuid;
    IF operation_uuid IS NOT NULL THEN
        SELECT id_utilisateur INTO operation_actor FROM public.correction_operations
        WHERE operation_id=operation_uuid;
        IF NOT FOUND OR operation_actor IS DISTINCT FROM actor THEN
            RAISE EXCEPTION 'Correction operation does not match the record actor';
        END IF;
    END IF;
    kind := CASE WHEN TG_TABLE_NAME='transactions' THEN 'transaction' ELSE 'paiement' END;
    record_id := CASE WHEN kind='transaction' THEN (to_jsonb(NEW)->>'id_transaction')::integer
                      ELSE (to_jsonb(NEW)->>'id_paiement')::integer END;
    INSERT INTO public.entity_revisions(entity_type,entity_id,revision,operation_id,event_kind,
        before_snapshot,after_snapshot,id_utilisateur)
    VALUES(kind,record_id,NEW.row_version,operation_uuid,lower(TG_OP),
        CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),actor);
    RETURN NEW;
END $fn$;

DO $foundation$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['transactions','paiements'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_correction_version ON public.%I',table_name);
        EXECUTE format('CREATE TRIGGER trg_correction_version BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_correction_row_version()',table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_correction_capture ON public.%I',table_name);
        EXECUTE format('CREATE TRIGGER trg_correction_capture AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_correction_revision()',table_name);
    END LOOP;
END $foundation$;

CREATE OR REPLACE FUNCTION public.reject_correction_history_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'Correction and transaction history is append-only'; END $fn$;

DO $foundation$
DECLARE table_name text; exposed_role text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['correction_operations','entity_revisions','transactions_audit'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_correction_history_immutable ON public.%I',table_name);
        EXECUTE format('CREATE TRIGGER trg_correction_history_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_correction_history_mutation()',table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_correction_history_no_truncate ON public.%I',table_name);
        EXECUTE format('CREATE TRIGGER trg_correction_history_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.reject_correction_history_mutation()',table_name);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',table_name);
        FOR exposed_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
            EXECUTE format('REVOKE ALL ON public.%I FROM %I',table_name,exposed_role);
        END LOOP;
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
            EXECUTE format('REVOKE ALL ON public.%I FROM app_runtime',table_name);
            EXECUTE format('GRANT SELECT,INSERT ON public.%I TO app_runtime',table_name);
            EXECUTE format('DROP POLICY IF EXISTS correction_runtime_access ON public.%I',table_name);
            EXECUTE format('CREATE POLICY correction_runtime_access ON public.%I FOR ALL TO app_runtime USING(true) WITH CHECK(true)',table_name);
        END IF;
    END LOOP;
    REVOKE ALL ON SEQUENCE public.entity_revisions_id_revision_seq FROM PUBLIC;
    FOR exposed_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
        EXECUTE format('REVOKE ALL ON SEQUENCE public.entity_revisions_id_revision_seq FROM %I',exposed_role);
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
        GRANT USAGE,SELECT ON SEQUENCE public.entity_revisions_id_revision_seq TO app_runtime;
    END IF;
    IF to_regclass('public.egg_sale_allocations') IS NOT NULL THEN
        REVOKE ALL ON public.egg_sale_allocations FROM PUBLIC;
        FOR exposed_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
            EXECUTE format('REVOKE ALL ON public.egg_sale_allocations FROM %I',exposed_role);
        END LOOP;
    END IF;
END $foundation$;

-- Version tagging is audit metadata, never an authorization flag. Existing
-- payment/movement identity guards remain installed and unchanged in phase 1.
CREATE OR REPLACE VIEW public.vue_solde_caisse WITH (security_invoker=true) AS
SELECT coalesce(sum(CASE WHEN type_mouvement='ENTREE' THEN montant ELSE -montant END),0) AS solde_actuel,
       max(date_mouvement) AS derniere_maj
FROM public.caisse WHERE statut='active' AND id_cession IS NULL;
REVOKE ALL ON public.vue_solde_caisse FROM PUBLIC;
DO $foundation$
DECLARE exposed_role text;
BEGIN
    FOR exposed_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
        EXECUTE format('REVOKE ALL ON public.vue_solde_caisse FROM %I',exposed_role);
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
        GRANT SELECT ON public.vue_solde_caisse TO app_runtime;
    END IF;
END $foundation$;
-- END correction_history_foundation

COMMIT;


-- BEGIN audited_payment_corrections
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

-- END audited_payment_corrections

BEGIN;
-- BEGIN phase3_cash_bank_payment_corrections
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

-- END phase3_cash_bank_payment_corrections
COMMIT;

BEGIN;
-- BEGIN stock_correction_revisions
-- Allocation-only corrections must advance the parent transaction revision.
-- Existing revision triggers automatically capture this explicit stock marker.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS stock_revision bigint NOT NULL DEFAULT 0
    CONSTRAINT check_stock_revision_nonnegative CHECK (stock_revision >= 0);

-- END stock_correction_revisions

-- BEGIN explicit_transaction_refunds
-- Explicit, positive-valued refunds reuse the settlement ledger.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.paiements ADD COLUMN IF NOT EXISTS nature varchar(20) NOT NULL DEFAULT 'paiement';
DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.paiements'::regclass AND conname='check_paiement_nature') THEN
    ALTER TABLE public.paiements ADD CONSTRAINT check_paiement_nature CHECK (nature IN ('paiement','remboursement'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.paiements'::regclass AND conname='check_remboursement_simple') THEN
    ALTER TABLE public.paiements ADD CONSTRAINT check_remboursement_simple CHECK (
      nature <> 'remboursement' OR (type_paiement IN ('cash','virement') AND id_lc IS NULL AND statut IN ('valide','annule')));
  END IF;
END $block$;

CREATE OR REPLACE FUNCTION public.protect_refund_settlement() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
  parent public.transactions%ROWTYPE;
  net_now numeric;
  net_at_date numeric;
  later_minimum numeric;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.nature='remboursement' THEN
      RAISE EXCEPTION 'Refund history cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.nature IS DISTINCT FROM NEW.nature THEN
      RAISE EXCEPTION 'Settlement nature is immutable';
    END IF;
    IF OLD.nature='remboursement' AND (
      OLD.id_transaction IS DISTINCT FROM NEW.id_transaction OR OLD.montant IS DISTINCT FROM NEW.montant
      OR OLD.date_paiement IS DISTINCT FROM NEW.date_paiement OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
      OR OLD.id_compte IS DISTINCT FROM NEW.id_compte OR OLD.source_reglement IS DISTINCT FROM NEW.source_reglement
      OR OLD.id_lc IS DISTINCT FROM NEW.id_lc OR OLD.notes IS DISTINCT FROM NEW.notes
      OR OLD.cle_idempotence IS DISTINCT FROM NEW.cle_idempotence
      OR OLD.id_utilisateur_creation IS DISTINCT FROM NEW.id_utilisateur_creation
      OR (OLD.statut='annule' AND NEW.statut <> 'annule')) THEN
      RAISE EXCEPTION 'Refund values are immutable; void the erroneous record and record a replacement';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.nature <> 'remboursement' THEN RETURN NEW; END IF;
  SELECT * INTO parent FROM public.transactions WHERE id_transaction=NEW.id_transaction FOR UPDATE;
  IF NOT FOUND OR NOT parent.est_actif OR NEW.date_paiement < parent.date_transaction
    OR NEW.date_paiement > (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Casablanca')::date THEN
    RAISE EXCEPTION 'Refund requires an active transaction and a valid effective date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.paiements p WHERE p.id_transaction=NEW.id_transaction AND p.statut <> 'annule'
    AND (p.type_paiement IN ('cheque','lc') OR p.id_lc IS NOT NULL)) THEN
    RAISE EXCEPTION 'Instrument settlement requires its dedicated dependency workflow';
  END IF;
  SELECT coalesce(sum(CASE WHEN p.nature='remboursement' THEN -p.montant ELSE p.montant END),0),
         coalesce(sum(CASE WHEN p.date_paiement<=NEW.date_paiement THEN CASE WHEN p.nature='remboursement' THEN -p.montant ELSE p.montant END ELSE 0 END),0)
    INTO net_now,net_at_date FROM public.paiements p
    WHERE p.id_transaction=NEW.id_transaction AND p.statut='valide'
      AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse');
  SELECT min(net_at_date + cumulative_delta) INTO later_minimum FROM (
    SELECT sum(sum(CASE WHEN p.nature='remboursement' THEN -p.montant ELSE p.montant END))
      OVER (ORDER BY p.date_paiement) AS cumulative_delta
    FROM public.paiements p WHERE p.id_transaction=NEW.id_transaction AND p.statut='valide'
      AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse')
      AND p.date_paiement>NEW.date_paiement GROUP BY p.date_paiement
  ) dated_balances;
  IF NEW.montant > least(net_now,net_at_date,coalesce(later_minimum,net_at_date))-parent.montant_total THEN
    RAISE EXCEPTION 'Refund exceeds available transaction credit';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.protect_refund_settlement() FROM PUBLIC;
DROP TRIGGER IF EXISTS protect_refund_settlement ON public.paiements;
CREATE TRIGGER protect_refund_settlement BEFORE INSERT OR UPDATE OR DELETE ON public.paiements
FOR EACH ROW EXECUTE FUNCTION public.protect_refund_settlement();

-- END explicit_transaction_refunds

-- BEGIN party_advances_credit_allocation
-- Party-level money events and paired non-cash credit allocations.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public.avances (
 id_avance uuid PRIMARY KEY REFERENCES public.correction_operations(operation_id) DEFERRABLE INITIALLY DEFERRED,
 id_origine uuid REFERENCES public.avances(id_avance) ON DELETE RESTRICT,
 nature varchar(20) NOT NULL DEFAULT 'avance',
 id_client integer REFERENCES public.clients(id_client),
 id_fournisseur integer REFERENCES public.fournisseurs(id_fournisseur),
 date_effet date NOT NULL, montant numeric(15,2) NOT NULL,
 type_paiement varchar(20) NOT NULL, id_compte integer REFERENCES public.comptes_bancaires(id_compte),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
 statut varchar(10) NOT NULL DEFAULT 'active',
 id_utilisateur_creation integer NOT NULL REFERENCES public.utilisateurs(id_utilisateur),
 date_creation timestamptz NOT NULL DEFAULT now(),
 motif_annulation text, date_annulation timestamptz,
 id_utilisateur_annulation integer REFERENCES public.utilisateurs(id_utilisateur),
 CONSTRAINT check_avance_montant CHECK(montant>0),
 CONSTRAINT check_avance_statut CHECK(statut IN ('active','annule')),
 CONSTRAINT check_avance_party CHECK((id_client IS NOT NULL AND id_fournisseur IS NULL) OR (id_client IS NULL AND id_fournisseur IS NOT NULL)),
 CONSTRAINT check_avance_origine CHECK((nature='avance' AND id_origine IS NULL) OR (nature='retour_avance' AND id_origine IS NOT NULL)),
 CONSTRAINT check_avance_compte CHECK((type_paiement='cash' AND id_compte IS NULL) OR (type_paiement='virement' AND id_compte IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.affectations_credit (
 id_affectation uuid PRIMARY KEY REFERENCES public.correction_operations(operation_id) DEFERRABLE INITIALLY DEFERRED,
 id_transaction_source integer REFERENCES public.transactions(id_transaction) ON DELETE RESTRICT,
 id_avance uuid REFERENCES public.avances(id_avance) ON DELETE RESTRICT,
 id_transaction_cible integer NOT NULL REFERENCES public.transactions(id_transaction) ON DELETE RESTRICT,
 montant numeric(15,2) NOT NULL, date_effet date NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
 statut varchar(10) NOT NULL DEFAULT 'active',
 id_utilisateur_creation integer NOT NULL REFERENCES public.utilisateurs(id_utilisateur),
 date_creation timestamptz NOT NULL DEFAULT now(),
 motif_annulation text, date_annulation timestamptz,
 id_utilisateur_annulation integer REFERENCES public.utilisateurs(id_utilisateur),
 CONSTRAINT check_affectation_source CHECK((id_transaction_source IS NOT NULL AND id_avance IS NULL) OR (id_transaction_source IS NULL AND id_avance IS NOT NULL)),
 CONSTRAINT check_affectation_distinct CHECK(id_transaction_source IS NULL OR id_transaction_source <> id_transaction_cible),
 CONSTRAINT check_affectation_montant CHECK(montant>0),
 CONSTRAINT check_affectation_statut CHECK(statut IN ('active','annule'))
);
CREATE INDEX IF NOT EXISTS ix_avance_client ON public.avances(id_client);
CREATE INDEX IF NOT EXISTS ix_avance_fournisseur ON public.avances(id_fournisseur);
CREATE INDEX IF NOT EXISTS ix_avance_origine ON public.avances(id_origine);
CREATE INDEX IF NOT EXISTS ix_avance_date ON public.avances(date_effet);
CREATE INDEX IF NOT EXISTS ix_credit_source ON public.affectations_credit(id_transaction_source);
CREATE INDEX IF NOT EXISTS ix_credit_target ON public.affectations_credit(id_transaction_cible);
CREATE INDEX IF NOT EXISTS ix_credit_avance ON public.affectations_credit(id_avance);
CREATE INDEX IF NOT EXISTS ix_credit_date ON public.affectations_credit(date_effet);
ALTER TABLE public.paiements ADD COLUMN IF NOT EXISTS id_affectation uuid REFERENCES public.affectations_credit(id_affectation) ON DELETE RESTRICT;
ALTER TABLE public.paiements DROP CONSTRAINT IF EXISTS check_paiement_nature;
ALTER TABLE public.paiements ADD CONSTRAINT check_paiement_nature CHECK(nature IN ('paiement','remboursement','credit_recu','credit_transfere'));
ALTER TABLE public.paiements DROP CONSTRAINT IF EXISTS check_paiement_affectation;
ALTER TABLE public.paiements ADD CONSTRAINT check_paiement_affectation CHECK(
 (nature IN ('credit_recu','credit_transfere') AND id_affectation IS NOT NULL AND type_paiement='compensation'
  AND id_compte IS NULL AND id_lc IS NULL AND source_reglement IS NULL AND statut IN ('valide','annule'))
 OR (nature IN ('paiement','remboursement') AND id_affectation IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_affectation_settlement_side ON public.paiements(id_affectation,nature);
CREATE INDEX IF NOT EXISTS ix_paiement_affectation ON public.paiements(id_affectation);
ALTER TABLE public.caisse ADD COLUMN IF NOT EXISTS id_avance uuid REFERENCES public.avances(id_avance) ON DELETE RESTRICT;
ALTER TABLE public.mouvements_bancaires ADD COLUMN IF NOT EXISTS id_avance uuid REFERENCES public.avances(id_avance) ON DELETE RESTRICT;
ALTER TABLE public.caisse DROP CONSTRAINT IF EXISTS check_caisse_mutual_exclusion;
ALTER TABLE public.caisse DROP CONSTRAINT IF EXISTS check_caisse_origine;
ALTER TABLE public.caisse ADD CONSTRAINT check_caisse_origine CHECK(
 (id_avance IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_charge IS NULL AND id_cession IS NULL)
 OR (id_avance IS NULL AND ((id_charge IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_cession IS NULL)
 OR (id_cession IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_charge IS NULL)
 OR (id_charge IS NULL AND id_cession IS NULL AND (id_transaction IS NOT NULL OR id_paiement IS NOT NULL)))));
ALTER TABLE public.mouvements_bancaires DROP CONSTRAINT IF EXISTS check_bank_avance_origin;
ALTER TABLE public.mouvements_bancaires ADD CONSTRAINT check_bank_avance_origin CHECK(id_avance IS NULL OR (id_paiement IS NULL AND id_charge IS NULL));
CREATE INDEX IF NOT EXISTS ix_caisse_avance ON public.caisse(id_avance);
CREATE INDEX IF NOT EXISTS ix_bank_avance ON public.mouvements_bancaires(id_avance);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_cash_avance ON public.caisse(id_avance) WHERE statut='active' AND id_avance IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_bank_avance ON public.mouvements_bancaires(id_avance) WHERE statut='active' AND id_avance IS NOT NULL;

CREATE OR REPLACE FUNCTION public.credit_transaction_capacity(tx integer, day date, want_credit boolean)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 WITH daily AS (
  SELECT p.date_paiement, sum(CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END) AS delta
  FROM public.paiements p WHERE p.id_transaction=tx AND p.statut='valide'
    AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse') GROUP BY p.date_paiement
 ), days AS (SELECT day AS date_effet UNION SELECT date_paiement FROM daily WHERE date_paiement>day),
 balances AS (
  SELECT ((SELECT coalesce(sum(d.delta),0) FROM daily d WHERE d.date_paiement<=dates.date_effet)-t.montant_total)
      * CASE WHEN want_credit THEN 1 ELSE -1 END AS balance
  FROM days dates CROSS JOIN public.transactions t WHERE t.id_transaction=tx
 ) SELECT coalesce(min(balance),0) FROM balances;
$fn$;

CREATE OR REPLACE FUNCTION public.credit_advance_available(advance_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN a.statut='active' AND a.nature='avance' THEN a.montant
  -(SELECT coalesce(sum(c.montant),0) FROM public.affectations_credit c WHERE c.id_avance=a.id_avance AND c.statut='active')
  -(SELECT coalesce(sum(r.montant),0) FROM public.avances r WHERE r.id_origine=a.id_avance AND r.statut='active')
  ELSE 0 END FROM public.avances a WHERE a.id_avance=advance_id;
$fn$;

CREATE OR REPLACE FUNCTION public.protect_credit_record() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE parent public.avances%ROWTYPE; source_tx public.transactions%ROWTYPE; target_tx public.transactions%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Credit history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(OLD)-ARRAY['statut','motif_annulation','date_annulation','id_utilisateur_annulation']) IS DISTINCT FROM
     (to_jsonb(NEW)-ARRAY['statut','motif_annulation','date_annulation','id_utilisateur_annulation'])
     OR (OLD.statut='annule' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)) THEN
   RAISE EXCEPTION 'Credit financial values and canceled history are immutable';
  END IF;
  IF NEW.statut='annule' AND (length(trim(coalesce(NEW.motif_annulation,'')))<3 OR NEW.date_annulation IS NULL OR NEW.id_utilisateur_annulation IS NULL) THEN
   RAISE EXCEPTION 'Credit cancellation requires reason, actor and timestamp';
  END IF;
  IF TG_TABLE_NAME='avances' THEN
   IF OLD.statut='active' AND NEW.statut='annule' AND OLD.nature='avance' THEN
   IF EXISTS(SELECT 1 FROM public.affectations_credit WHERE id_avance=OLD.id_avance AND statut='active')
      OR EXISTS(SELECT 1 FROM public.avances WHERE id_origine=OLD.id_avance AND statut='active') THEN
    RAISE EXCEPTION 'Advance has active allocation or return dependencies';
   END IF;
   END IF;
  END IF;
  IF OLD.statut='active' AND NEW.statut='annule' AND TG_TABLE_NAME='affectations_credit' THEN
   PERFORM 1 FROM public.transactions WHERE id_transaction IN (OLD.id_transaction_source,OLD.id_transaction_cible) ORDER BY id_transaction FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.paiements WHERE id_transaction=OLD.id_transaction_cible AND statut='valide' AND nature IN ('remboursement','credit_transfere')) THEN
    RAISE EXCEPTION 'Allocation has downstream refund or transfer dependencies';
   END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.statut <> 'active' OR NEW.date_effet>(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Casablanca')::date THEN
  RAISE EXCEPTION 'New credit requires active status and a non-future effective date';
 END IF;
 IF TG_TABLE_NAME='avances' THEN
  IF NEW.nature='avance' THEN
   IF NEW.id_client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clients WHERE id_client=NEW.id_client AND est_actif)
    OR NEW.id_fournisseur IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fournisseurs WHERE id_fournisseur=NEW.id_fournisseur AND est_actif) THEN
    RAISE EXCEPTION 'Advance requires an active contact';
   END IF;
  ELSE
   SELECT * INTO parent FROM public.avances WHERE id_avance=NEW.id_origine FOR UPDATE;
   IF NOT FOUND OR parent.statut <> 'active' OR parent.nature <> 'avance' OR parent.id_client IS DISTINCT FROM NEW.id_client
     OR parent.id_fournisseur IS DISTINCT FROM NEW.id_fournisseur OR NEW.date_effet<parent.date_effet
     OR NEW.montant>public.credit_advance_available(parent.id_avance) THEN
    RAISE EXCEPTION 'Advance return exceeds available credit or changes its owner';
   END IF;
  END IF;
 ELSE
  PERFORM 1 FROM public.transactions WHERE id_transaction IN (NEW.id_transaction_source,NEW.id_transaction_cible) ORDER BY id_transaction FOR UPDATE;
  SELECT * INTO target_tx FROM public.transactions WHERE id_transaction=NEW.id_transaction_cible;
  IF NOT FOUND OR NOT target_tx.est_actif OR NEW.date_effet<target_tx.date_transaction
      OR NEW.montant>public.credit_transaction_capacity(NEW.id_transaction_cible,NEW.date_effet,false) THEN
   RAISE EXCEPTION 'Allocation exceeds target debt or has an invalid date';
  END IF;
  IF NEW.id_transaction_source IS NOT NULL THEN
   SELECT * INTO source_tx FROM public.transactions WHERE id_transaction=NEW.id_transaction_source;
   IF NOT FOUND OR NOT source_tx.est_actif OR source_tx.id_client IS DISTINCT FROM target_tx.id_client
    OR source_tx.id_fournisseur IS DISTINCT FROM target_tx.id_fournisseur OR NEW.date_effet<source_tx.date_transaction
    OR NEW.montant>public.credit_transaction_capacity(NEW.id_transaction_source,NEW.date_effet,true) THEN
    RAISE EXCEPTION 'Allocation exceeds source credit or changes its owner';
   END IF;
  ELSE
   SELECT * INTO parent FROM public.avances WHERE id_avance=NEW.id_avance FOR UPDATE;
   IF NOT FOUND OR parent.statut <> 'active' OR parent.nature <> 'avance' OR parent.id_client IS DISTINCT FROM target_tx.id_client
    OR parent.id_fournisseur IS DISTINCT FROM target_tx.id_fournisseur OR NEW.date_effet<parent.date_effet
    OR NEW.montant>public.credit_advance_available(parent.id_avance) THEN
    RAISE EXCEPTION 'Allocation exceeds available advance or changes its owner';
   END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.paiements WHERE id_transaction IN (NEW.id_transaction_source,NEW.id_transaction_cible)
      AND statut <> 'annule' AND (type_paiement IN ('cheque','lc') OR id_lc IS NOT NULL)) THEN
   RAISE EXCEPTION 'Instrument credit requires its dedicated workflow';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.protect_credit_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE allocation public.affectations_credit%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.id_affectation IS NOT NULL THEN RAISE EXCEPTION 'Allocation settlement history cannot be deleted'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.id_affectation IS DISTINCT FROM NEW.id_affectation THEN RAISE EXCEPTION 'Settlement allocation is immutable'; END IF;
 IF NEW.id_affectation IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO allocation FROM public.affectations_credit WHERE id_affectation=NEW.id_affectation;
 IF NOT FOUND OR NEW.nature NOT IN ('credit_recu','credit_transfere') OR NEW.montant IS DISTINCT FROM allocation.montant
  OR NEW.date_paiement IS DISTINCT FROM allocation.date_effet OR NEW.notes IS DISTINCT FROM allocation.reason
  OR NEW.id_utilisateur_creation IS DISTINCT FROM allocation.id_utilisateur_creation
  OR (NEW.nature='credit_recu' AND NEW.id_transaction IS DISTINCT FROM allocation.id_transaction_cible)
  OR (NEW.nature='credit_transfere' AND (allocation.id_transaction_source IS NULL OR NEW.id_transaction IS DISTINCT FROM allocation.id_transaction_source))
  OR (NEW.statut='valide') IS DISTINCT FROM (allocation.statut='active') THEN
  RAISE EXCEPTION 'Settlement does not match its allocation';
 END IF;
 RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.verify_credit_pair() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE ref uuid; allocation public.affectations_credit%ROWTYPE; total integer; matches integer; expected integer;
BEGIN
 IF TG_TABLE_NAME='affectations_credit' THEN ref:=NEW.id_affectation;
 ELSE ref:=CASE WHEN TG_OP='DELETE' THEN OLD.id_affectation ELSE NEW.id_affectation END; END IF;
 IF ref IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO allocation FROM public.affectations_credit WHERE id_affectation=ref;
 IF NOT FOUND THEN RAISE EXCEPTION 'Allocation is missing'; END IF;
 expected:=CASE WHEN allocation.id_transaction_source IS NULL THEN 1 ELSE 2 END;
 SELECT count(*),count(*) FILTER(WHERE montant=allocation.montant AND date_paiement=allocation.date_effet
   AND (statut='valide')=(allocation.statut='active')
   AND ((nature='credit_recu' AND id_transaction=allocation.id_transaction_cible)
        OR (nature='credit_transfere' AND id_transaction=allocation.id_transaction_source)))
 INTO total,matches FROM public.paiements WHERE id_affectation=ref;
 IF total<>expected OR matches<>expected THEN RAISE EXCEPTION 'Allocation must save or cancel all settlement sides together'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.correction_operations WHERE operation_id=ref AND id_utilisateur=allocation.id_utilisateur_creation AND request_payload->>'kind'='credit' AND request_payload->>'action'='allocate') THEN RAISE EXCEPTION 'Allocation operation journal is missing'; END IF;
 IF allocation.statut='active' AND (public.credit_transaction_capacity(allocation.id_transaction_cible,allocation.date_effet,false)<0
  OR (allocation.id_transaction_source IS NOT NULL AND public.credit_transaction_capacity(allocation.id_transaction_source,allocation.date_effet,true)<0)
  OR (allocation.id_avance IS NOT NULL AND public.credit_advance_available(allocation.id_avance)<0)) THEN
  RAISE EXCEPTION 'Allocation overspends source credit or target debt';
 END IF;
 IF EXISTS(SELECT 1 FROM public.caisse c JOIN public.paiements p ON p.id_paiement=c.id_paiement WHERE p.id_affectation=ref AND c.statut='active')
  OR EXISTS(SELECT 1 FROM public.mouvements_bancaires m JOIN public.paiements p ON p.id_paiement=m.id_paiement WHERE p.id_affectation=ref AND m.statut='active') THEN
  RAISE EXCEPTION 'Credit allocation cannot create cash or bank money';
 END IF;
 RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION public.verify_advance_effect() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE ref uuid; advance public.avances%ROWTYPE; total integer; matches integer; direction text;
BEGIN
 ref:=CASE WHEN TG_OP='DELETE' THEN OLD.id_avance ELSE NEW.id_avance END;
 IF ref IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO advance FROM public.avances WHERE id_avance=ref;
 IF NOT FOUND THEN RAISE EXCEPTION 'Advance is missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.correction_operations WHERE operation_id=ref AND id_utilisateur=advance.id_utilisateur_creation AND request_payload->>'kind'='credit' AND request_payload->>'action'=CASE WHEN advance.nature='avance' THEN 'advance' ELSE 'return_advance' END) THEN RAISE EXCEPTION 'Advance operation journal is missing'; END IF;
 IF advance.nature='retour_avance' AND public.credit_advance_available(advance.id_origine)<0 THEN RAISE EXCEPTION 'Advance is overspent'; END IF;
 direction:=CASE WHEN (advance.id_client IS NOT NULL)<>(advance.nature='retour_avance') THEN 'ENTREE' ELSE 'SORTIE' END;
 SELECT count(*),count(*) FILTER(WHERE montant=advance.montant AND type_mouvement=direction AND date_mouvement::date=advance.date_effet
    AND ((advance.id_compte IS NULL AND kind='cash') OR (advance.id_compte IS NOT NULL AND kind='bank' AND id_compte=advance.id_compte AND source=advance.nature)))
 INTO total,matches FROM (
  SELECT montant,type_mouvement,date_mouvement,'cash' AS kind,NULL::integer AS id_compte,NULL::text AS source FROM public.caisse WHERE id_avance=ref AND statut='active'
  UNION ALL SELECT montant,type_mouvement,date_mouvement,'bank',id_compte,source FROM public.mouvements_bancaires WHERE id_avance=ref AND statut='active'
 ) effects;
 IF (advance.statut='active' AND (total<>1 OR matches<>1)) OR (advance.statut='annule' AND total<>0) THEN
  RAISE EXCEPTION 'Advance must have exactly its saved cash or bank effect';
 END IF;
 RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION public.protect_credit_transaction_party() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 IF (OLD.id_client IS DISTINCT FROM NEW.id_client OR OLD.id_fournisseur IS DISTINCT FROM NEW.id_fournisseur OR NOT NEW.est_actif)
  AND EXISTS(SELECT 1 FROM public.affectations_credit WHERE statut='active' AND NEW.id_transaction IN (id_transaction_source,id_transaction_cible)) THEN
  RAISE EXCEPTION 'Handle linked credit allocations before changing owner or withdrawing the transaction';
 END IF;
 RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.protect_credit_ledger() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.id_avance IS DISTINCT FROM NEW.id_avance THEN RAISE EXCEPTION 'Advance movement origin is immutable'; END IF;
  IF OLD.id_avance IS NOT NULL AND (
   (to_jsonb(OLD)-ARRAY['statut','motif_annulation','date_annulation','id_utilisateur_annulation','id_mouvement_inverse']) IS DISTINCT FROM
   (to_jsonb(NEW)-ARRAY['statut','motif_annulation','date_annulation','id_utilisateur_annulation','id_mouvement_inverse'])
   OR (OLD.statut='annule' AND NEW.statut <> 'annule')) THEN
   RAISE EXCEPTION 'Advance movement values and canceled history are immutable';
  END IF;
 END IF;
 IF NEW.id_paiement IS NOT NULL AND NEW.statut='active' AND EXISTS(
  SELECT 1 FROM public.paiements WHERE id_paiement=NEW.id_paiement AND nature IN ('credit_recu','credit_transfere')) THEN
  RAISE EXCEPTION 'Credit allocation cannot create cash or bank money';
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS protect_credit_ledger ON public.caisse;
CREATE TRIGGER protect_credit_ledger BEFORE INSERT OR UPDATE ON public.caisse FOR EACH ROW EXECUTE FUNCTION public.protect_credit_ledger();
DROP TRIGGER IF EXISTS protect_credit_ledger ON public.mouvements_bancaires;
CREATE TRIGGER protect_credit_ledger BEFORE INSERT OR UPDATE ON public.mouvements_bancaires FOR EACH ROW EXECUTE FUNCTION public.protect_credit_ledger();

DROP TRIGGER IF EXISTS protect_credit_record ON public.avances;
CREATE TRIGGER protect_credit_record BEFORE INSERT OR UPDATE OR DELETE ON public.avances FOR EACH ROW EXECUTE FUNCTION public.protect_credit_record();
DROP TRIGGER IF EXISTS protect_credit_record ON public.affectations_credit;
CREATE TRIGGER protect_credit_record BEFORE INSERT OR UPDATE OR DELETE ON public.affectations_credit FOR EACH ROW EXECUTE FUNCTION public.protect_credit_record();
DROP TRIGGER IF EXISTS protect_credit_payment ON public.paiements;
CREATE TRIGGER protect_credit_payment BEFORE INSERT OR UPDATE OR DELETE ON public.paiements FOR EACH ROW EXECUTE FUNCTION public.protect_credit_payment();
DROP TRIGGER IF EXISTS protect_credit_transaction_party ON public.transactions;
CREATE TRIGGER protect_credit_transaction_party BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.protect_credit_transaction_party();
DROP TRIGGER IF EXISTS verify_credit_pair ON public.affectations_credit;
CREATE CONSTRAINT TRIGGER verify_credit_pair AFTER INSERT OR UPDATE ON public.affectations_credit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_credit_pair();
DROP TRIGGER IF EXISTS verify_credit_pair ON public.paiements;
CREATE CONSTRAINT TRIGGER verify_credit_pair AFTER INSERT OR UPDATE OR DELETE ON public.paiements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_credit_pair();
DROP TRIGGER IF EXISTS verify_advance_effect ON public.avances;
CREATE CONSTRAINT TRIGGER verify_advance_effect AFTER INSERT OR UPDATE ON public.avances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_advance_effect();
DROP TRIGGER IF EXISTS verify_advance_effect ON public.caisse;
CREATE CONSTRAINT TRIGGER verify_advance_effect AFTER INSERT OR UPDATE OR DELETE ON public.caisse DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_advance_effect();
DROP TRIGGER IF EXISTS verify_advance_effect ON public.mouvements_bancaires;
CREATE CONSTRAINT TRIGGER verify_advance_effect AFTER INSERT OR UPDATE OR DELETE ON public.mouvements_bancaires DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_advance_effect();

ALTER TABLE public.avances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affectations_credit ENABLE ROW LEVEL SECURITY;
DO $permissions$
DECLARE t text; r text; f text;
BEGIN
 FOREACH t IN ARRAY ARRAY['avances','affectations_credit'] LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
   EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r);
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON public.%I TO app_runtime',t);
   EXECUTE format('GRANT UPDATE(statut,motif_annulation,date_annulation,id_utilisateur_annulation) ON public.%I TO app_runtime',t);
   EXECUTE format('DROP POLICY IF EXISTS credit_runtime_access ON public.%I',t);
   EXECUTE format('CREATE POLICY credit_runtime_access ON public.%I FOR ALL TO app_runtime USING(true) WITH CHECK(true)',t);
  END IF;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['credit_transaction_capacity(integer,date,boolean)','credit_advance_available(uuid)',
  'protect_credit_record()','protect_credit_ledger()','protect_credit_payment()','verify_credit_pair()','verify_advance_effect()','protect_credit_transaction_party()'] LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||f||' FROM PUBLIC';
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN
   EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||f||' TO app_runtime';
  END IF;
 END LOOP;
END $permissions$;

-- Refund bounds include the non-cash settlement sides as well.
CREATE OR REPLACE FUNCTION public.protect_refund_settlement() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
  parent public.transactions%ROWTYPE;
  net_now numeric;
  net_at_date numeric;
  later_minimum numeric;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.nature='remboursement' THEN
      RAISE EXCEPTION 'Refund history cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.nature IS DISTINCT FROM NEW.nature THEN
      RAISE EXCEPTION 'Settlement nature is immutable';
    END IF;
    IF OLD.nature='remboursement' AND (
      OLD.id_transaction IS DISTINCT FROM NEW.id_transaction OR OLD.montant IS DISTINCT FROM NEW.montant
      OR OLD.date_paiement IS DISTINCT FROM NEW.date_paiement OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
      OR OLD.id_compte IS DISTINCT FROM NEW.id_compte OR OLD.source_reglement IS DISTINCT FROM NEW.source_reglement
      OR OLD.id_lc IS DISTINCT FROM NEW.id_lc OR OLD.notes IS DISTINCT FROM NEW.notes
      OR OLD.cle_idempotence IS DISTINCT FROM NEW.cle_idempotence
      OR OLD.id_utilisateur_creation IS DISTINCT FROM NEW.id_utilisateur_creation
      OR (OLD.statut='annule' AND NEW.statut <> 'annule')) THEN
      RAISE EXCEPTION 'Refund values are immutable; void the erroneous record and record a replacement';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.nature <> 'remboursement' THEN RETURN NEW; END IF;
  SELECT * INTO parent FROM public.transactions WHERE id_transaction=NEW.id_transaction FOR UPDATE;
  IF NOT FOUND OR NOT parent.est_actif OR NEW.date_paiement < parent.date_transaction
    OR NEW.date_paiement > (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Casablanca')::date THEN
    RAISE EXCEPTION 'Refund requires an active transaction and a valid effective date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.paiements p WHERE p.id_transaction=NEW.id_transaction AND p.statut <> 'annule'
    AND (p.type_paiement IN ('cheque','lc') OR p.id_lc IS NOT NULL)) THEN
    RAISE EXCEPTION 'Instrument settlement requires its dedicated dependency workflow';
  END IF;
  SELECT coalesce(sum(CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END),0),
         coalesce(sum(CASE WHEN p.date_paiement<=NEW.date_paiement THEN CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END ELSE 0 END),0)
    INTO net_now,net_at_date FROM public.paiements p
    WHERE p.id_transaction=NEW.id_transaction AND p.statut='valide'
      AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse');
  SELECT min(net_at_date + cumulative_delta) INTO later_minimum FROM (
    SELECT sum(sum(CASE WHEN p.nature IN ('remboursement','credit_transfere') THEN -p.montant ELSE p.montant END))
      OVER (ORDER BY p.date_paiement) AS cumulative_delta
    FROM public.paiements p WHERE p.id_transaction=NEW.id_transaction AND p.statut='valide'
      AND (p.type_paiement <> 'cheque' OR p.statut_cheque='encaisse')
      AND p.date_paiement>NEW.date_paiement GROUP BY p.date_paiement
  ) dated_balances;
  IF NEW.montant > least(net_now,net_at_date,coalesce(later_minimum,net_at_date))-parent.montant_total THEN
    RAISE EXCEPTION 'Refund exceeds available transaction credit';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.protect_refund_settlement() FROM PUBLIC;
DROP TRIGGER IF EXISTS protect_refund_settlement ON public.paiements;
CREATE TRIGGER protect_refund_settlement BEFORE INSERT OR UPDATE OR DELETE ON public.paiements
FOR EACH ROW EXECUTE FUNCTION public.protect_refund_settlement();

-- END party_advances_credit_allocation
COMMIT;
