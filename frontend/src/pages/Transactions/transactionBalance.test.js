import { expect, it } from 'vitest';
import { transactionBalance } from './transactionBalance';

it('keeps every cent visible and distinguishes debt, credit and history', () => {
  const sale = { id_client: 1, est_actif: true };
  expect(transactionBalance(sale, -0.01)).toMatchObject({ label: 'Crédit client', amount: 0.01, credit: true });
  expect(transactionBalance(sale, 0.01)).toMatchObject({ label: 'Reste à encaisser', amount: 0.01, credit: false });
  expect(transactionBalance({ id_fournisseur: 1 }, -5)).toMatchObject({ label: 'Crédit fournisseur', amount: 5, credit: true });
  expect(transactionBalance({ ...sale, est_actif: false }, -5)).toMatchObject({ label: 'Solde (historique)', amount: -5, credit: false });
  expect(transactionBalance(sale, null)).toMatchObject({ label: 'Solde indisponible', amount: null });
});
