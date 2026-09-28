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
