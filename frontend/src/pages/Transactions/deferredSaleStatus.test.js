import { expect, it } from 'vitest';
import { deferredSaleStatus } from './deferredSaleStatus';

it('distinguishes a closed remainder from a fully fulfilled delivery', () => {
  const base = { est_promesse: true, est_actif: true, quantite_couverte: 600, quantite: 1000, quantite_en_attente: 0 };
  expect(deferredSaleStatus({ ...base, quantite_annulee: 400 }).label).toBe('Reste clôturé');
  expect(deferredSaleStatus({ ...base, quantite_annulee: 0 }).label).toBe('Réservation complète');
});
