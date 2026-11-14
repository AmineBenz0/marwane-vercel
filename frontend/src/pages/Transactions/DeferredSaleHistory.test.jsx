import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DeferredSaleHistory from './DeferredSaleHistory';
import { get } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn() }));
afterEach(cleanup);
it('shows initial and automatic stock reservations with origins on demand', async () => {
  get.mockResolvedValue([
    { id: 'initial', type: 'initial', date: '2026-10-23', quantite: 600, id_utilisateur: 4,
      repartition_stock: [{ id_production: 1, date_production: '2026-10-23', quantite: 600 }] },
    { id: 1, type: 'reservation', date: '2026-10-25', quantite: 300, quantite_couverte: 900, id_utilisateur: 4,
      repartition_stock: [{ id_production: 3, date_production: '2026-10-24', quantite: 300 }] },
    { id: 2, type: 'completion', date: '2026-10-26', quantite: 100, quantite_couverte: 1000, id_utilisateur: 4, repartition_stock: [] },
  ]);
  render(<DeferredSaleHistory transactionId={7} refreshKey={1000} />);
  expect(await screen.findByText('Stock réservé à la création')).toBeVisible();
  expect(screen.getByText('Stock réservé automatiquement')).toBeVisible();
  expect(screen.getByText('Stock complété')).toBeVisible();
  expect(screen.getAllByText('600 œufs')).toHaveLength(2);
  expect(screen.getAllByText('300 œufs')).toHaveLength(2);
  expect(screen.queryByText(/après ce complément/)).not.toBeInTheDocument();
  expect(screen.getByText('Production du 24/10/26')).toBeVisible();
  expect(screen.getByText(/cet ancien ajout/)).toBeVisible();
  expect(screen.queryByText(/Opérateur #4/)).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/transactions/7/completion-history', { params: { include_initial: true } });
});

it('displays an audited commercial avoir on cancellation without pretending it is stock reserved', async () => {
  get.mockResolvedValue([
    { id: 'initial', type: 'initial', date: '2026-10-01', quantite: 600, repartition_stock: [] },
    { id: 22, type: 'cancel_remainder', date: '2026-11-11',
      quantite: 400, montant_avoir: '600.00', repartition_stock: [],
    },
  ]);
  render(<DeferredSaleHistory transactionId={7} refreshKey="600:400" />);
  expect(await screen.findByText('Annulation des œufs restants')).toBeVisible();
  expect(screen.getByText('−400 œufs')).toBeVisible();
  expect(screen.getByText(/Avoir commercial : .*600/)).toBeVisible();
  expect(screen.getByText(/Aucun remboursement automatique/)).toBeVisible();
  expect(screen.queryByText('Répartition détaillée non enregistrée pour cet ancien ajout.')).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/transactions/7/completion-history', {
    params: { include_initial: true },
  });
});
