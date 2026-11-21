import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { get, patch } from '../../services/api';
import ReactivationReviewDialog from './ReactivationReviewDialog';

vi.mock('../../services/api', () => ({ get: vi.fn(), patch: vi.fn() }));

const transaction = { id_transaction: 7, id_client: 1 };
const review = {
  id_transaction: 7,
  expected_version: 4,
  dependency_fingerprint: 'a'.repeat(64),
  product_name: 'Produit test',
  stock_kind: 'general',
  stock_effect: 'sortie',
  stock_quantity: 5,
  cancelled_payments_count: 2,
};
const confirm = () => screen.getByRole('button', { name: 'Confirmer la réactivation' });
const stock = () => screen.findByRole('checkbox', { name: 'Confirmer l’effet sur le stock' });

beforeEach(() => {
  vi.resetAllMocks();
  get.mockResolvedValue(review);
  patch.mockResolvedValue({});
});
afterEach(cleanup);

it('requires explicit stock confirmation and preserves cancelled payments', async () => {
  const saved = vi.fn();
  render(<ReactivationReviewDialog transaction={transaction} onClose={vi.fn()} onSaved={saved} />);
  expect(await screen.findByText(/Sortie · 5 unités/)).toBeVisible();
  expect(screen.getByText(/2 paiement.*resteront dans l’historique/)).toBeVisible();
  expect(confirm()).toBeDisabled();
  expect(patch).not.toHaveBeenCalled();
  fireEvent.click(await stock());
  fireEvent.click(confirm());
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(patch).toHaveBeenCalledExactlyOnceWith('/transactions/7/reactivate', {
    expected_version: 4,
    dependency_fingerprint: review.dependency_fingerprint,
    restore_stock: true,
    restore_cancelled_payments: false,
  }, { silent: true });
});

it('requires a new review and confirmation after stock changes', async () => {
  patch.mockRejectedValueOnce({ status: 409, message: 'Le stock a changé.' });
  render(<ReactivationReviewDialog transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.click(await stock());
  fireEvent.click(confirm());
  expect(await screen.findByText('Le stock a changé.')).toBeVisible();
  expect(confirm()).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
  expect(await stock()).not.toBeChecked();
  expect(confirm()).toBeDisabled();
  expect(patch).toHaveBeenCalledOnce();
});

it('allows confirmation without a stock checkbox for a service', async () => {
  get.mockResolvedValueOnce({ ...review, stock_kind: 'aucun', stock_effect: 'aucun', stock_quantity: 0 });
  render(<ReactivationReviewDialog transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(await screen.findByText(/ne modifie pas le stock suivi/)).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.click(confirm());
  await waitFor(() => expect(patch).toHaveBeenCalledOnce());
});
