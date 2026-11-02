import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CreditOperationDialog from './CreditOperationDialog';

const { get, post, announce } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), announce: vi.fn() }));
vi.mock('../../services/api', () => ({ get, post }));
vi.mock('./useCorrectionFlow', () => ({ announceCorrection: announce }));
const preview = { montant: '0.01', dependency_fingerprint: 'a'.repeat(64), money_effect: 'cash', direction: 'ENTREE' };
beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue([]); });
afterEach(cleanup);

async function prepare(props = {}) {
  const saved = vi.fn();
  render(<CreditOperationDialog action="advance" partyType="client" partyId={7} onClose={vi.fn()} onSaved={saved} {...props} />);
  fireEvent.change(screen.getByLabelText(/Montant/), { target: { value: '0.01' } });
  fireEvent.change(screen.getByLabelText(/Commentaire/), { target: { value: 'Avance réellement reçue' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Vérifier' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
  await screen.findByRole('button', { name: 'Confirmer' });
  return saved;
}

it('previews a one-cent advance before saving and broadcasts fresh balances', async () => {
  post.mockResolvedValueOnce(preview).mockResolvedValueOnce({ replayed: false });
  const saved = await prepare();
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][1]).toMatchObject({ action: 'advance', id_client: 7, montant: '0.01', type_paiement: 'cash', id_compte: null });
  expect(screen.getByText(/Argent reçu/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[1][1].command).toEqual(post.mock.calls[0][1]);
  expect(announce).toHaveBeenCalledTimes(1);
});
it('retries the identical operation when the response is lost and blocks dismissal', async () => {
  post.mockResolvedValueOnce(preview).mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({ replayed: true });
  const saved = await prepare();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await screen.findByText(/La réponse n’a pas été reçue/);
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Revenir aux champs' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier l’enregistrement' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[2][1]).toEqual(post.mock.calls[1][1]);
});
it('requires a refreshed preview after a conflict', async () => {
  post.mockResolvedValueOnce(preview).mockRejectedValueOnce({ status: 409, message: 'Le crédit a changé' });
  const saved = await prepare();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await screen.findByText('Le crédit a changé');
  expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled();
  expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revenir aux champs' }));
  expect(screen.getByRole('button', { name: 'Vérifier' })).toBeEnabled();
});
it('explains that allocating an advance creates no new money movement', async () => {
  get.mockResolvedValue([{ id_transaction: 27, produit_nom: 'Œufs', montant_restant: '1.50' }]);
  post.mockResolvedValueOnce({ ...preview, money_effect: 'unchanged', source_after: '1.99', target_remaining_after: '1.49', target_transaction: 27 });
  render(<CreditOperationDialog action="allocate" advance={{ id_avance: 'advance-id', available: '2' }} onClose={vi.fn()} onSaved={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: /Transaction à régler/ })).toBeEnabled());
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Transaction à régler/ }));
  fireEvent.click(await screen.findByRole('option', { name: /N° 27/ }));
  fireEvent.change(screen.getByLabelText(/Montant/), { target: { value: '0.01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
  await screen.findByText(/Aucun nouveau mouvement de caisse ou de banque/);
  expect(post.mock.calls[0][1]).toMatchObject({ action: 'allocate', id_avance: 'advance-id', id_transaction_cible: 27, montant: '0.01' });
});
