import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DeferredSaleHistory from './DeferredSaleHistory';
import { get } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn() }));
afterEach(cleanup);
it('shows initial and automatic stock reservations with immediately visible origins', async () => {
  get.mockResolvedValue([
    { id: 'initial', type: 'initial', date: '2026-10-23', quantite: 600, id_utilisateur: 4,
      repartition_stock: [{ id_production: 1, date_production: '2026-10-23', quantite: 600 }] },
    { id: 1, type: 'reservation', date: '2026-10-25', quantite: 300, quantite_couverte: 900, id_utilisateur: 4,
      repartition_stock: [{ id_production: 3, date_production: '2026-10-24', quantite: 300 }] },
    { id: 2, type: 'completion', date: '2026-10-26', quantite: 100, quantite_couverte: 1000, id_utilisateur: 4, repartition_stock: [] },
  ]);
  render(<DeferredSaleHistory transactionId={7} refreshKey={1000} />);
  expect(await screen.findByText('Réservé à la création')).toBeVisible();
  expect(screen.getByText('Réservé automatiquement')).toBeVisible();
  expect(screen.getByText('Stock ajouté manuellement')).toBeVisible();
  expect(screen.getAllByText('600 œufs')).toHaveLength(2);
  expect(screen.getAllByText('300 œufs')).toHaveLength(2);
  expect(screen.queryByText(/après ce complément/)).not.toBeInTheDocument();
  expect(screen.getByText('Production du 23/10/26')).toBeVisible();
  expect(screen.getByText('Production du 24/10/26')).toBeVisible();
  expect(screen.getByText(/cet ancien ajout/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Origine du stock' })).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/transactions/7/completion-history', { params: { include_initial: true } });
});

it('embeds the history without a duplicate heading or operator attribution', async () => {
  get.mockResolvedValue([{ id: 'initial', type: 'initial', date: '2026-10-23', quantite: 24,
    operateur: 'Admin', repartition_stock: [{ id_production: 1, date_production: '2026-10-12', quantite: 24 }] }]);
  render(<DeferredSaleHistory transactionId={7} embedded />);
  expect(await screen.findByText('Production du 12/10/26')).toBeVisible();
  expect(screen.queryByText(/Enregistré par/)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
});
