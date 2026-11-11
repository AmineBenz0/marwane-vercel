import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DeferredSaleCancellationDialog from './DeferredSaleCancellationDialog';
import { get, post } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));
const quote = {
  id_transaction: 7, expected_version: 3, quantite_en_attente_attendue: 400,
  quantite_couverte: 600, quantite_annulee: 400, quantite_annulee_cumulee: 400,
  date_effet: '2026-11-11', montant_initial: '1500.00', montant_avoir: '600.00',
  montant_avoirs_cumule: '600.00', montant_net: '900.00',
  montant_paye: '1500.00', montant_restant: '-600.00', credit_client: '600.00',
};
const props = () => ({
  open: true, transactionId: 7,
  onClose: vi.fn(), onCompleted: vi.fn(), onStale: vi.fn(),
});
beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(quote);
});
afterEach(cleanup);

it('quotes exactly before rendering its irreversible confirmation, with no optional form', async () => {
  const actions = props();
  render(<DeferredSaleCancellationDialog {...actions} />);
  const dialog = await screen.findByRole('dialog', { name: 'Annuler les œufs restants ?' });
  expect(await within(dialog).findByText('Œufs à annuler')).toBeVisible();
  expect(within(dialog).getByText('400 œufs')).toBeVisible();
  expect(within(dialog).getByText('11/11/26')).toBeVisible();
  expect(within(dialog).getByText('Crédit client')).toBeVisible();
  expect(within(dialog).getByText(/Aucun remboursement ni mouvement de caisse/)).toBeVisible();
  expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/transactions/7/cancel-remainder/preview');
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Retour' }));
  expect(actions.onClose).toHaveBeenCalledOnce();
  expect(post).not.toHaveBeenCalled();
});

it('uses identical UUID and stock snapshot on lost-response retry, never an automatic second action', async () => {
  const actions = props();
  post.mockRejectedValueOnce(new Error('Connexion interrompue')).mockResolvedValueOnce({
    ...quote, id_avoir: 'posted', quantite_en_attente: 0, rejoue: true,
  });
  render(<DeferredSaleCancellationDialog {...actions} />);
  const dialog = await screen.findByRole('dialog', { name: 'Annuler les œufs restants ?' });
  await within(dialog).findByText('Œufs à annuler');
  fireEvent.click(within(dialog).getByRole('button', { name: "Confirmer l'annulation des œufs restants" }));
  expect(await within(dialog).findByText('Connexion interrompue')).toBeVisible();
  expect(actions.onCompleted).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Réessayer' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  const [first, second] = post.mock.calls;
  expect(first[0]).toBe('/transactions/7/cancel-remainder');
  expect(first[1]).toMatchObject({
    operation_id: expect.any(String),
    expected_version: 3,
    quantite_en_attente_attendue: 400,
    montant_paye_attendu: '1500.00', date_effet_attendue: '2026-11-11',
  });
  expect(first[1]).toEqual(second[1]);
  await waitFor(() => expect(actions.onCompleted).toHaveBeenCalledOnce());
  expect(actions.onClose).toHaveBeenCalledOnce();
  expect(get).toHaveBeenCalledOnce();
});

it('blocks stale snapshot resubmission and directs the user to refresh the sale', async () => {
  const actions = props();
  post.mockRejectedValueOnce(Object.assign(new Error('La quantité restante a changé.'), { status: 409 }));
  render(<DeferredSaleCancellationDialog {...actions} />);
  const dialog = await screen.findByRole('dialog', { name: 'Annuler les œufs restants ?' });
  await within(dialog).findByText('Œufs à annuler');
  fireEvent.click(within(dialog).getByRole('button', { name: "Confirmer l'annulation des œufs restants" }));
  expect(await within(dialog).findByText('La quantité restante a changé.')).toBeVisible();
  expect(within(dialog).queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Actualiser la vente' }));
  expect(actions.onStale).toHaveBeenCalledOnce();
  expect(actions.onClose).toHaveBeenCalledOnce();
  expect(post).toHaveBeenCalledOnce();
});

it('does not offer confirmation when the server cannot safely quote the current stock', async () => {
  get.mockRejectedValueOnce(Object.assign(
    new Error('Des œufs réservés mais non livrés demandent un traitement distinct.'),
    { status: 409 },
  ));
  render(<DeferredSaleCancellationDialog {...props()} />);
  const dialog = await screen.findByRole('dialog', { name: 'Annuler les œufs restants ?' });
  expect(await within(dialog).findByText(/Des œufs réservés mais non livrés/)).toBeVisible();
  expect(within(dialog).getByRole('button', { name: "Confirmer l'annulation des œufs restants" })).toBeDisabled();
  expect(post).not.toHaveBeenCalled();
});
