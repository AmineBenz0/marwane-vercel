import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TransactionEditForm from './TransactionEditForm';
import { get, post } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));
const transaction = { id_transaction: 7, row_version: 3, id_client: 1, id_produit: 1,
  date_transaction: '2026-10-20', date_echeance: '2026-10-25', quantite: 10, prix_unitaire: '2.50',
  montant_total: '25.00', montant_paye: '30.00', est_actif: true, paiements: [{ id_paiement: 1, statut: 'valide' }] };
const setup = overrides => {
  const saved = vi.fn();
  render(<TransactionEditForm open onClose={vi.fn()} onCorrected={saved} initialValues={{ ...transaction, ...overrides }} />);
  return saved;
};
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async path => {
    if (path === '/produits') return [{ id_produit: 1, nom_produit: 'Service', type_produit: 'service', usage: 'vendu' }];
    if (path === '/clients') return [{ id_client: 1, nom_client: 'Client payé' }];
    if (path === '/transactions/7') return { ...transaction, row_version: 4 };
    return [];
  });
  post.mockImplementation(async (path, data) => path === '/corrections/preview' ? {
    ...data, before: transaction, after: { ...transaction, ...data.changes }, dependency_fingerprint: 'a'.repeat(64),
    impact: { stock: 'unchanged', balance: { remaining: '-5.00', side: 'client' } },
  } : { ...data, record: { ...transaction, row_version: 4 } });
});
afterEach(cleanup);
const verifyPrice = async () => {
  fireEvent.change(screen.getByRole('spinbutton', { name: /^Prix unitaire/ }), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  await screen.findByRole('button', { name: 'Confirmer la correction' });
};
it.each(['valide', 'annule'])('previews a paid transaction with %s history and commits once after confirmation', async statut => {
  const saved = setup({ paiements: [{ id_paiement: 1, statut }] });
  expect(screen.getByRole('spinbutton', { name: /^Prix unitaire/ })).not.toHaveAttribute('readonly');
  await verifyPrice();
  expect(post).toHaveBeenCalledTimes(1);
  const previewRequest = post.mock.calls[0][1];
  expect(previewRequest).toMatchObject({ changes: { prix_unitaire: '3' }, target: { expected_version: 3 } });
  expect(screen.getByText(/Crédit client après correction/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la correction' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(post.mock.calls[1]).toEqual(['/corrections/apply', { ...previewRequest, dependency_fingerprint: 'a'.repeat(64) }]);
});
it('keeps the exact operation for a timeout retry and prevents editing an uncertain save', async () => {
  setup(); await verifyPrice();
  post.mockRejectedValueOnce({ status: null, message: 'Timeout' });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la correction' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Vérifier et réessayer' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
  expect(post.mock.calls[2][1]).toEqual(post.mock.calls[1][1]);
});
it('retains the draft and refreshes the record revision after a stale preview', async () => {
  setup(); await verifyPrice();
  post.mockRejectedValueOnce({ status: 409, message: 'Le stock a changé.' });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la correction' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Actualiser l’aperçu' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
  expect(post.mock.calls[2][1]).toMatchObject({ target: { expected_version: 4 }, changes: { prix_unitaire: '3' } });
});
it('validates due dates and allows clearing them without resending payments', async () => {
  setup();
  fireEvent.change(screen.getByLabelText('Date d’échéance du paiement (optionnel)'), { target: { value: '01/10/26' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  expect(await screen.findByText('La date d’échéance ne peut pas précéder la transaction.')).toBeVisible();
  expect(post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Date d’échéance du paiement (optionnel)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  await waitFor(() => expect(post.mock.calls[0][1].changes).toEqual({ date_echeance: null }));
});
it('does not submit unchanged or inactive records', async () => {
  setup(); fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  expect(await screen.findByText('Aucune valeur n’a changé.')).toBeVisible(); expect(post).not.toHaveBeenCalled();
  cleanup(); setup({ est_actif: false }); expect(screen.getByRole('button', { name: 'Vérifier les modifications' })).toBeDisabled();
});

it('keeps the opening revision and only the intended fields when another tab refreshes the parent', async () => {
  const props = { open: true, onClose: vi.fn(), onCorrected: vi.fn() };
  const view = render(<TransactionEditForm {...props} initialValues={transaction} />);
  fireEvent.change(screen.getByRole('spinbutton', { name: /^Prix unitaire/ }), { target: { value: '3' } });
  view.rerender(<TransactionEditForm {...props} initialValues={{ ...transaction, row_version: 4, quantite: 20 }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post.mock.calls[0][1]).toMatchObject({ target: { expected_version: 3 }, changes: { prix_unitaire: '3' } });
});
