import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReactivationReviewDialog from './ReactivationReviewDialog';
import { get, patch } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), patch: vi.fn() }));

const transaction = { id_transaction: 7, id_client: 1 };
const review = {
  id_transaction: 7, expected_version: 4,
  dependency_fingerprint: 'a'.repeat(64), nature: 'vente',
  product_name: 'Produit test', stock_kind: 'general',
  stock_effect: 'sortie', stock_quantity: 5,
  cancelled_payments_count: 2, restore_cancelled_payments: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(review);
  patch.mockResolvedValue({});
});
afterEach(cleanup);

it('requires deliberate stock confirmation and never restores canceled payments', async () => {
  const saved = vi.fn();
  render(<ReactivationReviewDialog transaction={transaction} onClose={vi.fn()} onSaved={saved} />);
  expect(await screen.findByText(/Stock : sortie de/)).toBeVisible();
  expect(screen.getByText(/2 paiement\(s\) annulé\(s\)/)).toBeVisible();
  const confirm = screen.getByRole('button', { name: 'Confirmer la réactivation' });
  expect(confirm).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmer la restauration de ce stock' }));
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(patch).toHaveBeenCalledExactlyOnceWith('/transactions/7/reactivate', {
    expected_version: 4, dependency_fingerprint: 'a'.repeat(64),
    restore_stock: true, restore_cancelled_payments: false,
  });
});

it('invalidates the review after a conflict instead of repeating the same write', async () => {
  patch.mockRejectedValueOnce({ status: 409, message: 'Le stock a changé.' });
  render(<ReactivationReviewDialog transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Confirmer la restauration de ce stock' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la réactivation' }));
  expect(await screen.findByText('Le stock a changé.')).toBeVisible();
  expect(patch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Confirmer la réactivation' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
  expect(await screen.findByRole('checkbox', { name: 'Confirmer la restauration de ce stock' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Confirmer la réactivation' })).toBeDisabled();
});

it('needs no artificial stock selection when the transaction has no tracked stock', async () => {
  get.mockResolvedValueOnce({ ...review, stock_kind: 'aucun', stock_effect: 'aucun', stock_quantity: 0 });
  render(<ReactivationReviewDialog transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(await screen.findByText(/ne modifie pas le stock suivi/)).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la réactivation' }));
  await waitFor(() => expect(patch).toHaveBeenCalledOnce());
});
