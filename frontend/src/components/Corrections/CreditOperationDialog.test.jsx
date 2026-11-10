import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CreditOperationDialog from './CreditOperationDialog';

const { get, post, announce } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), announce: vi.fn() }));
vi.mock('../../services/api', () => ({ get, post }));
vi.mock('./useCorrectionFlow', () => ({ announceCorrection: announce }));
const preview = { montant: '0.01', dependency_fingerprint: 'a'.repeat(64), money_effect: 'cash', direction: 'ENTREE' };
beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue([]); });
afterEach(cleanup);

it.each([
  { action: 'advance', reason: 'Enregistrer une avance', props: { partyType: 'client', partyId: 7 } },
  { action: 'return_advance', reason: 'Restituer une avance', props: { advance: { id_avance: 'advance-id', available: '0.01' } } },
  { action: 'cancel_advance', reason: 'Annuler l’avance', props: { advance: { id_avance: 'advance-id' } } },
  { action: 'cancel_allocation', reason: 'Annuler l’affectation', props: { allocation: { id_affectation: 'allocation-id' } } },
])('saves $action without a user comment and preserves the generated audit description', async ({ action, reason, props }) => {
  post.mockResolvedValueOnce(preview).mockResolvedValueOnce({ replayed: false });
  const saved = vi.fn();
  render(<CreditOperationDialog action={action} onClose={vi.fn()} onSaved={saved} {...props} />);
  expect(screen.queryByRole('textbox', { name: /Commentaire/ })).not.toBeInTheDocument();
  if (action === 'advance') fireEvent.change(screen.getByLabelText(/Montant/), { target: { value: '0.01' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Vérifier' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
  await screen.findByRole('button', { name: 'Confirmer' });
  expect(post.mock.calls[0][1].reason).toBe(reason);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(post.mock.calls[1][1].command.reason).toBe(reason);
});

async function prepare(props = {}) {
  const saved = vi.fn();
  render(<CreditOperationDialog action="advance" partyType="client" partyId={7} onClose={vi.fn()} onSaved={saved} {...props} />);
  fireEvent.change(screen.getByLabelText(/Montant/), { target: { value: '0.01' } });
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
  expect(post.mock.calls[0][1].reason).toBe('Enregistrer une avance');
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
