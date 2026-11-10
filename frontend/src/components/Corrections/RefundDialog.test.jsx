import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RefundDialog from './RefundDialog';

const { get, post, announce } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), announce: vi.fn() }));
vi.mock('../../services/api', () => ({ get, post }));
vi.mock('./useCorrectionFlow', () => ({ announceCorrection: announce }));

const preview = { dependency_fingerprint: 'a'.repeat(64), montant: '2.50', credit_after: '2.50', date_paiement: '2026-11-01', type_paiement: 'cash' };
beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue([]); });
afterEach(cleanup);

async function prepare(supplier = false) {
  const saved = vi.fn();
  const closed = vi.fn();
  render(<RefundDialog transaction={{ id_transaction: 27, id_client: supplier ? null : 7, id_fournisseur: supplier ? 2 : null }}
    credit={5} onClose={closed} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText(/Montant remboursé/), { target: { value: '2.50' } });
  expect(screen.queryByLabelText(/Motif du remboursement/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier le remboursement' }));
  await screen.findByText(/Crédit restant après remboursement/);
  return { saved, closed };
}

it.each([false, true])('reviews the money direction and saves only on confirmation (supplier=%s)', async supplier => {
  post.mockImplementation(path => Promise.resolve(path.endsWith('/preview') ? preview : { record: { nature: 'remboursement' } }));
  const { saved } = await prepare(supplier);
  expect(screen.getByText(supplier ? 'Entrée en caisse' : 'Sortie de caisse')).toBeVisible();
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][1].reason).toBe('Remboursement enregistré');
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[1][1]).toMatchObject({ id_transaction: 27, montant: '2.50', dependency_fingerprint: preview.dependency_fingerprint });
  expect(announce).toHaveBeenCalledTimes(1);
});

it('retains the identical request after an ambiguous save and disables dismissal', async () => {
  post.mockResolvedValueOnce(preview).mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({ replayed: true });
  const { saved } = await prepare();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));
  await screen.findByText(/La réponse n’a pas été reçue/);
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Revenir aux champs' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier l’enregistrement' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[2][1]).toEqual(post.mock.calls[1][1]);
});

it('requires a fresh preview after a stale balance conflict', async () => {
  post.mockResolvedValueOnce(preview).mockRejectedValueOnce({ status: 409, message: 'Le solde a changé' });
  const { saved } = await prepare();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));
  await screen.findByText('Le solde a changé');
  expect(screen.getByRole('button', { name: 'Confirmer le remboursement' })).toBeDisabled();
  expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revenir aux champs' }));
  expect(screen.getByRole('button', { name: 'Vérifier le remboursement' })).toBeEnabled();
});
