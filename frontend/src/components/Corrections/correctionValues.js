import { formatShortDate } from '../../utils/dateFormatting';
import { formatMontant } from '../../utils/formatNumber';

export const fieldLabels = {
  date_transaction: 'Date de la transaction', date_echeance: 'Échéance du paiement',
  quantite: 'Quantité', prix_unitaire: 'Prix unitaire', montant_total: 'Montant total',
  id_client: 'Client', id_fournisseur: 'Fournisseur', id_produit: 'Produit',
  id_batiment: 'Bâtiment', id_production: 'Production', date_paiement: 'Date du paiement',
  montant: 'Montant du paiement', type_paiement: 'Mode de paiement',
  id_compte: 'Compte bancaire', source_reglement: 'Source du règlement', notes: 'Notes',
};
export const methods = { cash: 'Espèces', virement: 'Virement', carte: 'Carte bancaire',
  compensation: 'Compensation', autre: 'Autre', cheque: 'Chèque', lc: 'Lettre de crédit' };
export const money = value => formatMontant(value, { useCompactNotation: false, minimumFractionDigits: 2 });
export const eggCategory = name => ({
  'oeufs - demarrage': ['normal', 'demarrage'], 'oeufs - moyen': ['normal', 'moyen'],
  'oeufs - gros': ['normal', 'gros'], 'oeufs - double jaune': ['double_jaune', null],
  'oeufs - blancs': ['blanc', null], 'oeufs - casses': ['casse', null],
})[String(name || '').trim().toLowerCase().replaceAll('œ', 'oe')] || null;
export function displayValue(field, value, names = {}) {
  if (value === null || value === undefined || value === '') return 'Non renseigné';
  if (names[field]?.[value]) return names[field][value];
  if (field.startsWith('date_')) return formatShortDate(value);
  if (['prix_unitaire', 'montant_total', 'montant'].includes(field)) return money(value);
  if (field === 'type_paiement') return methods[value] || value;
  if (field === 'source_reglement') return value === 'banque' ? 'Compte bancaire' : 'Caisse';
  if (field.startsWith('id_')) return `N° ${value}`;
  return String(value);
}
export function changedValues(values, original) {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => {
    const before = original[key] ?? null;
    if (['quantite', 'prix_unitaire', 'montant_total', 'montant', 'id_compte', 'id_client', 'id_fournisseur', 'id_produit', 'id_batiment', 'id_production'].includes(key)) {
      return value === null || before === null ? value !== before : Number(value) !== Number(before);
    }
    return (value ?? null) !== before;
  }));
}
