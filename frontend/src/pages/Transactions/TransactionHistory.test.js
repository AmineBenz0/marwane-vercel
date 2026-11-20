import { describe, expect, it } from 'vitest';
import { buildHistory } from './TransactionHistory';

const at = '2026-11-20T19:37:31.025410Z';
const audit = [
  { id_audit: 5, date_changement: '2026-11-20T19:38:49Z', champ_modifie: 'est_actif', ancienne_valeur: 'true', nouvelle_valeur: 'false', nom_utilisateur: 'Gérant' },
  { id_audit: 4, date_changement: at, champ_modifie: 'id_utilisateur_modification', ancienne_valeur: 'NULL', nouvelle_valeur: '1', nom_utilisateur: 'Gérant' },
  { id_audit: 3, date_changement: at, champ_modifie: 'montant_total', ancienne_valeur: '850.00', nouvelle_valeur: '765.00', nom_utilisateur: 'Gérant' },
];
const corrections = [{
  recorded_at: '2026-11-20T19:37:31.025410+00:00', actor_name: 'Gérant', reason: 'Correction des informations enregistrées',
  target: { entity_type: 'transaction', entity_id: 6 },
  before: { quantite: 10, montant_total: 850, prix_unitaire: 85, row_version: 1 },
  after: { quantite: 9, montant_total: '765.00', prix_unitaire: '85.00', row_version: 2 },
}];

describe('transaction history', () => {
  it('merges a correction with its audit rows and hides technical fields', () => {
    const events = buildHistory({ audit, corrections, isSale: false, createdAt: '2026-11-20T16:00:00Z' });
    expect(events.map((e) => e.title)).toEqual(['Achat annulé', 'Achat corrigé', 'Achat enregistré']);
    const correction = events[1];
    expect(correction.lines.map((l) => l.text)).toEqual(['Quantité : 10 → 9', expect.stringMatching(/^Montant total : 850,00.MAD → 765,00.MAD$/)]);
    expect(correction.reason).toBe('');
    expect(JSON.stringify(events)).not.toContain('Utilisateur');
  });

  it('uses the feminine form for sales and shows audit-only changes', () => {
    const events = buildHistory({ audit: [
      { date_changement: '2026-11-21T10:00:00Z', champ_modifie: 'est_actif', ancienne_valeur: 'false', nouvelle_valeur: 'true' },
      { date_changement: '2026-11-21T09:00:00Z', champ_modifie: 'date_transaction', ancienne_valeur: '2026-11-19', nouvelle_valeur: '2026-11-20' },
    ], isSale: true });
    expect(events.map((e) => e.title)).toEqual(['Vente réactivée', 'Vente modifiée']);
    expect(events[1].lines[0].text).toBe('Date de la transaction : 19/11/26 → 20/11/26');
  });
});
