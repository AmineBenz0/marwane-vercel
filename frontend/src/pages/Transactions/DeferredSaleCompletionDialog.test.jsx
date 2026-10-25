import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DeferredSaleCompletionDialog from './DeferredSaleCompletionDialog';
import { get, post } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));
const proposal = {
  id_transaction: 7, quantite_couverte: 600, quantite_en_attente: 400,
  quantite_proposee: 300, empreinte_stock: 'a'.repeat(64),
  repartition_stock: [{ id_production: 11, date_production: '2026-10-26', quantite: 200 },
    { id_production: 12, date_production: '2026-10-27', quantite: 100 }],
};
beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue(proposal); });
afterEach(cleanup);

describe('deferred sale completion', () => {
  it('proposes the available 300 eggs and confirms against the original sale only', async () => {
    const done = vi.fn();
    post.mockResolvedValue({ id_transaction: 7, quantite_couverte: 900, quantite_en_attente: 100 });
    render(<DeferredSaleCompletionDialog open transactionId={7} onClose={vi.fn()} onCompleted={done} />);
    expect(await screen.findByLabelText('Quantité à compléter')).toHaveValue(300);
    expect(screen.queryByText('26/10/26')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stock à utiliser' }));
    expect(await screen.findByText('26/10/26')).toBeVisible();
    expect(screen.getByText('27/10/26')).toBeVisible();
    expect(screen.getByText(/Après confirmation : 100/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer 300 œufs' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith({ id_transaction: 7, quantite_couverte: 900, quantite_en_attente: 100 }));
    expect(post).toHaveBeenCalledExactlyOnceWith('/transactions/7/completion', {
      quantite: 300, quantite_couverte_attendue: 600, empreinte_stock: proposal.empreinte_stock,
    });
  });

  it('updates the proposed deduction and rejects fractions or over-completion', async () => {
    render(<DeferredSaleCompletionDialog open transactionId={7} onClose={vi.fn()} onCompleted={vi.fn()} />);
    const quantity = await screen.findByLabelText('Quantité à compléter');
    fireEvent.change(quantity, { target: { value: '100' } });
    expect(screen.getByText(/Après confirmation : 300/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmer 100 œufs' })).toBeEnabled();
    for (const value of ['301', '0', '-1', '1.5']) {
      fireEvent.change(quantity, { target: { value } });
      expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled();
    }
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks resubmission of a stale proposal until stock is reloaded', async () => {
    post.mockRejectedValue({ status: 409, message: 'Le stock a changé.' });
    render(<DeferredSaleCompletionDialog open transactionId={7} onClose={vi.fn()} onCompleted={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer 300 œufs' }));
    expect(await screen.findByText('Le stock a changé.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmer 300 œufs' })).toBeDisabled();
    get.mockResolvedValue({ ...proposal, quantite_couverte: 900, quantite_en_attente: 100, quantite_proposee: 100, empreinte_stock: 'b'.repeat(64) });
    fireEvent.click(screen.getByRole('button', { name: 'Recharger' }));
    expect(await screen.findByRole('button', { name: 'Confirmer 100 œufs' })).toBeEnabled();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('offers reloading after new production when no stock is available', async () => {
    get.mockResolvedValue({ ...proposal, quantite_proposee: 0, repartition_stock: [] });
    render(<DeferredSaleCompletionDialog open transactionId={7} onClose={vi.fn()} onCompleted={vi.fn()} />);
    expect(await screen.findByText(/En attente de production/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled();
    get.mockResolvedValue(proposal);
    fireEvent.click(screen.getByRole('button', { name: 'Recharger le stock' }));
    expect(await screen.findByLabelText('Quantité à compléter')).toHaveValue(300);
  });
});

it('shows identity and remaining stock once while hiding a redundant full-availability badge', async () => {
  get.mockResolvedValue({ ...proposal, quantite_en_attente: 300, nom_client: 'Client A', nom_produit: 'Œufs moyens', nom_batiment: 'Bâtiment A' });
  render(<DeferredSaleCompletionDialog open transactionId={7} onClose={vi.fn()} onCompleted={vi.fn()} />);
  expect(await screen.findByText('Client A')).toBeVisible();
  expect(screen.getByText('Œufs moyens · Bâtiment A')).toBeVisible();
  expect(screen.getByText('Reste à compléter')).toBeVisible();
  expect(screen.queryByText(/Stock disponible :/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Son montant et ses paiements/)).not.toBeInTheDocument();
});
