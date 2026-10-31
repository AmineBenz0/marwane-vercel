import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CorrectionHistory from './CorrectionHistory';
import { get } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn() }));
const entry = { operation_id: 'first', reason: 'Prix corrigé', recorded_at: '2026-10-29T12:00:00Z', actor_name: 'Propriétaire',
  target: { entity_type: 'transaction', entity_id: 7 }, before: { prix_unitaire: '1.50' }, after: { prix_unitaire: '2.00' },
  reuse_changes: { prix_unitaire: '1.50' }, impact: {} };
beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue({ items: [entry], has_more: false, next_offset: 1 }); });
afterEach(cleanup);
it('shows a date correction without unchanged money in different numeric formats', async () => {
  get.mockResolvedValue({ items: [{ ...entry,
    target: { entity_type: 'paiement', entity_id: 14 },
    before: { date_paiement: '2026-10-31', montant: 1.5 },
    after: { date_paiement: '2026-10-30', montant: '1.50' },
    reuse_changes: { date_paiement: '2026-10-31' },
  }], has_more: false });
  render(<CorrectionHistory transactionId={7} revision={1} onReuse={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Historique des corrections' }));
  expect(await screen.findByText(/Date du paiement :/)).toHaveTextContent('31/10/26 → 30/10/26');
  expect(screen.queryByText(/Montant du paiement :/)).not.toBeInTheDocument();
});
it('loads history on demand and proposes previous values without saving anything', async () => {
  const reuse = vi.fn(); render(<CorrectionHistory transactionId={7} revision={1} onReuse={reuse} />);
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Historique des corrections' }));
  expect(await screen.findByText('Prix corrigé')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Reprendre les valeurs précédentes' }));
  expect(reuse).toHaveBeenCalledExactlyOnceWith(entry);
});
it('reloads expanded history after a correction and hides reuse for a related sale', async () => {
  const props = { transactionId: 7, onReuse: vi.fn() };
  const view = render(<CorrectionHistory {...props} revision={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Historique des corrections' }));
  await screen.findByText('Prix corrigé');
  get.mockResolvedValue({ items: [{ ...entry, target: { entity_type: 'transaction', entity_id: 8 } }], has_more: false });
  view.rerender(<CorrectionHistory {...props} revision={2} />);
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Transaction n° 8')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Reprendre les valeurs précédentes' })).not.toBeInTheDocument();
});
