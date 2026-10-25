import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DeferredSaleHistory from './DeferredSaleHistory';
import { get } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn() }));
afterEach(cleanup);
it('shows immutable dated quantities, production sources, and legacy omissions', async () => {
  get.mockResolvedValue([
    { id: 1, date: '2026-10-25', quantite: 300, quantite_couverte: 900, id_utilisateur: 4,
      repartition_stock: [{ id_production: 3, date_production: '2026-10-24', quantite: 300 }] },
    { id: 2, date: '2026-10-26', quantite: 100, quantite_couverte: 1000, id_utilisateur: 4, repartition_stock: [] },
  ]);
  render(<DeferredSaleHistory transactionId={7} refreshKey={1000} />);
  expect(await screen.findByText(/300 œufs ajoutés/)).toBeVisible();
  expect(screen.getByText(/Production du .*300 œufs/)).toBeVisible();
  expect(screen.getByText(/cet ancien complément/)).toBeVisible();
});
