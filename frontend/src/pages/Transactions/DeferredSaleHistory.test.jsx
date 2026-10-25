import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DeferredSaleHistory from './DeferredSaleHistory';
import { get } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn() }));
afterEach(cleanup);
it('shows the initial stock and dated completions with origins on demand', async () => {
  get.mockResolvedValue([
    { id: 'initial', type: 'initial', date: '2026-10-23', quantite: 600, id_utilisateur: 4,
      repartition_stock: [{ id_production: 1, date_production: '2026-10-23', quantite: 600 }] },
    { id: 1, date: '2026-10-25', quantite: 300, quantite_couverte: 900, id_utilisateur: 4,
      repartition_stock: [{ id_production: 3, date_production: '2026-10-24', quantite: 300 }] },
    { id: 2, date: '2026-10-26', quantite: 100, quantite_couverte: 1000, id_utilisateur: 4, repartition_stock: [] },
  ]);
  render(<DeferredSaleHistory transactionId={7} refreshKey={1000} />);
  expect(await screen.findByText('Stock à la création')).toBeVisible();
  expect(screen.getByText('600 œufs')).toBeVisible();
  expect(screen.getByText('300 œufs')).toBeVisible();
  expect(screen.queryByText(/après ce complément/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Production du/)).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Origine du stock' })[1]);
  expect(await screen.findByText('Production du 24/10/26')).toBeVisible();
  fireEvent.click(screen.getAllByRole('button', { name: 'Origine du stock' })[2]);
  expect(await screen.findByText(/cet ancien complément/)).toBeVisible();
  expect(get).toHaveBeenCalledWith('/transactions/7/completion-history', { params: { include_initial: true } });
});
