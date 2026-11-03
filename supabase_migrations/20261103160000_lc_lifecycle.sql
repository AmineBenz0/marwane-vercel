-- Additive LC lifecycle model. Existing payments, cessions and bank movements
-- remain untouched and continue to be the immutable event history.

ALTER TABLE public.lettres_credit
  ADD COLUMN IF NOT EXISTS id_client_origine integer REFERENCES public.clients(id_client),
  ADD COLUMN IF NOT EXISTS date_reception date,
  ADD COLUMN IF NOT EXISTS statut_cycle varchar(20) NOT NULL DEFAULT 'a_verifier';

ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS role_lc varchar(20);

ALTER TABLE public.paiements
  ADD CONSTRAINT check_paiement_role_lc
  CHECK (role_lc IS NULL OR (type_paiement = 'lc' AND id_lc IS NOT NULL AND role_lc IN ('reception', 'utilisation')))
  NOT VALID;
ALTER TABLE public.paiements VALIDATE CONSTRAINT check_paiement_role_lc;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_payment_role_active
  ON public.paiements (id_lc, role_lc)
  WHERE id_lc IS NOT NULL AND role_lc IS NOT NULL AND statut <> 'annule';

ALTER TABLE public.lettres_credit
  ADD CONSTRAINT check_lc_statut_cycle_valide
  CHECK (statut_cycle IN ('detenue', 'transferee', 'deposee', 'annulee', 'a_verifier'))
  NOT VALID;
ALTER TABLE public.lettres_credit VALIDATE CONSTRAINT check_lc_statut_cycle_valide;

-- Restore the origin only when the legacy holder or transfer history identifies
-- one unambiguous client. Never infer a receipt date from registration time.
WITH cession_origins AS (
  SELECT id_lc, min(id_cedant_client) AS id_client, count(DISTINCT id_cedant_client) AS n
  FROM public.cessions_lc
  WHERE id_cession_origine IS NULL AND type_cedant = 'client' AND id_cedant_client IS NOT NULL
  GROUP BY id_lc
)
UPDATE public.lettres_credit lc
SET id_client_origine = COALESCE(co.id_client, lc.id_client)
FROM cession_origins co
WHERE lc.id_lc = co.id_lc AND lc.id_client_origine IS NULL
  AND co.n = 1;

UPDATE public.lettres_credit
SET id_client_origine = id_client
WHERE id_client_origine IS NULL AND id_client IS NOT NULL AND type_detenteur = 'client'
  AND NOT EXISTS (
    SELECT 1 FROM public.cessions_lc c
    WHERE c.id_lc = lettres_credit.id_lc AND c.id_cession_origine IS NULL
      AND c.type_cedant = 'client' AND c.id_cedant_client IS NOT NULL
  );

-- Every LC payment belongs to a side of the lifecycle, based on the linked
-- transaction. Cancelled rows remain classified as historical events.
UPDATE public.paiements p
SET role_lc = CASE WHEN t.id_client IS NOT NULL THEN 'reception'
                   WHEN t.id_fournisseur IS NOT NULL THEN 'utilisation'
                   ELSE NULL END
FROM public.transactions t
WHERE p.id_transaction = t.id_transaction
  AND p.id_lc IS NOT NULL AND p.type_paiement = 'lc' AND p.role_lc IS NULL;

WITH receipt_dates AS (
  SELECT p.id_lc, min(p.date_paiement) AS date_reception, count(*) AS n
  FROM public.paiements p
  WHERE p.id_lc IS NOT NULL AND p.role_lc = 'reception' AND p.statut = 'valide'
  GROUP BY p.id_lc
)
UPDATE public.lettres_credit lc
SET date_reception = rd.date_reception
FROM receipt_dates rd
WHERE lc.id_lc = rd.id_lc AND rd.n = 1 AND lc.date_reception IS NULL;

CREATE TABLE IF NOT EXISTS public.utilisations_lettre_credit (
  id_utilisation serial PRIMARY KEY,
  id_lc integer NOT NULL REFERENCES public.lettres_credit(id_lc) ON DELETE RESTRICT,
  type_utilisation varchar(20) NOT NULL,
  date_utilisation date NOT NULL,
  id_fournisseur integer REFERENCES public.fournisseurs(id_fournisseur),
  id_compte integer REFERENCES public.comptes_bancaires(id_compte),
  id_paiement integer REFERENCES public.paiements(id_paiement) ON DELETE RESTRICT,
  id_cession integer REFERENCES public.cessions_lc(id_cession) ON DELETE RESTRICT,
  id_mouvement_bancaire integer REFERENCES public.mouvements_bancaires(id_mouvement) ON DELETE RESTRICT,
  statut varchar(20) NOT NULL DEFAULT 'active',
  motif_annulation text,
  date_creation timestamptz NOT NULL DEFAULT now(),
  id_utilisateur_creation integer REFERENCES public.utilisateurs(id_utilisateur),
  CONSTRAINT check_lc_usage_type CHECK (type_utilisation IN ('fournisseur', 'banque')),
  CONSTRAINT check_lc_usage_status CHECK (statut IN ('active', 'annulee')),
  CONSTRAINT check_lc_usage_target CHECK (
    (type_utilisation = 'fournisseur' AND id_fournisseur IS NOT NULL AND id_compte IS NULL
      AND id_mouvement_bancaire IS NULL AND (id_paiement IS NOT NULL OR id_cession IS NOT NULL))
    OR
    (type_utilisation = 'banque' AND id_fournisseur IS NULL AND id_compte IS NOT NULL
      AND id_paiement IS NULL AND id_cession IS NULL AND id_mouvement_bancaire IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_utilisations_lettre_credit_id_lc
  ON public.utilisations_lettre_credit (id_lc);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_one_active_usage
  ON public.utilisations_lettre_credit (id_lc) WHERE statut = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_usage_payment
  ON public.utilisations_lettre_credit (id_paiement) WHERE id_paiement IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_usage_cession
  ON public.utilisations_lettre_credit (id_cession) WHERE id_cession IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_usage_bank_movement
  ON public.utilisations_lettre_credit (id_mouvement_bancaire) WHERE id_mouvement_bancaire IS NOT NULL;

-- Build an outgoing-use row only when exactly one live legacy event identifies
-- it. Multiple possible events are left in their original tables and marked
-- for reconciliation rather than guessed into one use.
WITH candidates AS (
  SELECT p.id_lc, 'fournisseur'::varchar AS type_utilisation, p.date_paiement AS date_utilisation,
         t.id_fournisseur, NULL::integer AS id_compte, p.id_paiement,
         NULL::integer AS id_cession, NULL::integer AS id_mouvement_bancaire,
         p.id_utilisateur_creation
  FROM public.paiements p
  JOIN public.transactions t ON t.id_transaction = p.id_transaction
  WHERE p.type_paiement = 'lc' AND p.role_lc = 'utilisation' AND p.statut = 'valide'
    AND t.id_fournisseur IS NOT NULL
  UNION ALL
  SELECT c.id_lc, 'fournisseur', c.date_cession, c.id_cessionnaire_fournisseur,
         NULL::integer, NULL::integer, c.id_cession, NULL::integer, c.id_utilisateur_creation
  FROM public.cessions_lc c
  WHERE c.type_cessionnaire = 'fournisseur' AND c.statut = 'active'
    AND c.id_cession_origine IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.cessions_lc r WHERE r.id_cession_origine = c.id_cession)
  UNION ALL
  SELECT lc.id_lc, 'banque', mb.date_mouvement::date, NULL::integer, mb.id_compte,
         NULL::integer, NULL::integer, mb.id_mouvement, mb.id_utilisateur_creation
  FROM public.mouvements_bancaires mb
  JOIN public.lettres_credit lc ON lc.numero_reference = mb.reference
  WHERE mb.source = 'lc' AND mb.statut = 'active' AND mb.type_mouvement = 'ENTREE'
), counted AS (
  SELECT candidates.*, count(*) OVER (PARTITION BY id_lc) AS candidate_count
  FROM candidates
)
INSERT INTO public.utilisations_lettre_credit
  (id_lc, type_utilisation, date_utilisation, id_fournisseur, id_compte,
   id_paiement, id_cession, id_mouvement_bancaire, id_utilisateur_creation)
SELECT id_lc, type_utilisation, date_utilisation, id_fournisseur, id_compte,
       id_paiement, id_cession, id_mouvement_bancaire, id_utilisateur_creation
FROM counted WHERE candidate_count = 1;

WITH usage_counts AS (
  SELECT id_lc, count(*) AS n, min(type_utilisation) AS type_utilisation
  FROM public.utilisations_lettre_credit WHERE statut = 'active' GROUP BY id_lc
), raw_candidates AS (
  SELECT id_lc FROM public.paiements WHERE type_paiement = 'lc' AND role_lc = 'utilisation' AND statut = 'valide'
  UNION ALL
  SELECT c.id_lc FROM public.cessions_lc c
  WHERE c.type_cessionnaire = 'fournisseur' AND c.statut = 'active' AND c.id_cession_origine IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.cessions_lc r WHERE r.id_cession_origine = c.id_cession)
  UNION ALL
  SELECT lc.id_lc FROM public.mouvements_bancaires mb
  JOIN public.lettres_credit lc ON lc.numero_reference = mb.reference
  WHERE mb.source = 'lc' AND mb.statut = 'active' AND mb.type_mouvement = 'ENTREE'
), ambiguous AS (
  SELECT id_lc, count(*) AS n FROM raw_candidates GROUP BY id_lc HAVING count(*) > 1
)
UPDATE public.lettres_credit lc
SET statut_cycle = CASE
  WHEN a.id_lc IS NOT NULL THEN 'a_verifier'
  WHEN u.type_utilisation = 'banque' THEN 'deposee'
  WHEN u.type_utilisation = 'fournisseur' THEN 'transferee'
  WHEN lc.statut = 'active' THEN 'detenue'
  ELSE 'a_verifier'
END
FROM (SELECT id_lc, max(type_utilisation) AS type_utilisation FROM usage_counts GROUP BY id_lc) u
FULL JOIN ambiguous a ON a.id_lc = u.id_lc
WHERE lc.id_lc = COALESCE(u.id_lc, a.id_lc);

UPDATE public.lettres_credit lc SET statut_cycle = 'detenue'
WHERE lc.statut_cycle = 'a_verifier' AND lc.statut = 'active' AND lc.id_client_origine IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.utilisations_lettre_credit u WHERE u.id_lc = lc.id_lc AND u.statut = 'active');

-- Legacy rows without a verifiable client receipt date or source client remain
-- visible, but are not spendable until reviewed.
UPDATE public.lettres_credit
SET statut_cycle = 'a_verifier'
WHERE date_reception IS NULL OR id_client_origine IS NULL;
