// Detect the exact field changes eligible for the audited correction path.
// A field outside the allowlist or an edited payment keeps the existing route.
const fields = [
  'date_transaction', 'date_echeance', 'id_client', 'id_fournisseur',
  'id_produit', 'id_production', 'id_batiment', 'id_cycle',
  'quantite', 'prix_unitaire', 'est_actif', 'est_promesse',
  'allocation_automatique', 'date_livraison_prevue',
];
const auditedFields = new Set(['date_echeance', 'prix_unitaire', 'id_client']);
const booleanFields = new Set(['est_actif', 'est_promesse', 'allocation_automatique']);

const normal = (key, value) => {
  if (value === undefined || value === null || value === '') return null;
  if (key.startsWith('date_')) return String(value).slice(0, 10);
  if (booleanFields.has(key)) return Boolean(value);
  return Number(value);
};
const text = (value) => value == null ? '' : String(value);
const paymentEqual = (submitted, original) => {
  if (!submitted.id_paiement || Number(submitted.id_paiement) !== Number(original.id_paiement)) return false;
  const pairs = [
    [submitted.date_paiement, original.date_paiement, true],
    [submitted.montant, original.montant, false],
    [submitted.type_paiement, original.type_paiement],
    [submitted.numero_cheque, original.numero_cheque],
    [submitted.banque, original.banque],
    [submitted.reference_virement, original.reference_virement],
    [submitted.id_compte, original.id_compte, false],
    [submitted.source_reglement, original.source_reglement],
    [submitted.id_lc, original.id_lc, false],
    [submitted.notes, original.notes],
  ];
  return pairs.every(([next, previous, dateField]) => {
    if (dateField) return String(next || '').slice(0, 10) === String(previous || '').slice(0, 10);
    if (typeof next === 'number' || typeof previous === 'number') return normal('quantity', next) === normal('quantity', previous);
    return text(next) === text(previous);
  });
};

export const auditedCorrectionChanges = (original, transactionData, payments = [], oldPayments = []) => {
  if (!original?.id_transaction || !original.row_version) return null;
  const changed = fields.filter(key => key in transactionData
    && normal(key, original[key]) !== normal(key, transactionData[key]));
  if (!changed.length || !changed.every(key => auditedFields.has(key))) return null;
  if (payments.length) {
    if (payments.length !== oldPayments.length) return null;
    const originalById = new Map(oldPayments.map(p => [Number(p.id_paiement), p]));
    if (!payments.every(p => {
      const previous = originalById.get(Number(p.id_paiement));
      return previous && paymentEqual(p, previous);
    })) return null;
  }
  return Object.fromEntries(changed.map(key => [key, transactionData[key]]));
};
