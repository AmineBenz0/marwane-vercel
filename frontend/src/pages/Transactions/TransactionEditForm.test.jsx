import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TransactionEditForm from './TransactionEditForm';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
const transaction = {
  id_transaction: 7, id_client: 1, date_transaction: '2026-10-20', date_echeance: '2026-10-25',
  quantite: 10, prix_unitaire: '2.50', montant_total: '25.00', est_actif: true,
  paiements: [{ id_paiement: 1, statut: 'valide' }],
};
const setup = (overrides = {}) => {
  const onSubmit = vi.fn().mockResolvedValue({});
  render(<TransactionEditForm open onClose={vi.fn()} onSubmit={onSubmit} initialValues={{ ...transaction, ...overrides }} />);
  return onSubmit;
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it.each(['valide', 'annule'])('locks financial values with %s payment history and saves only the due date', async statut => {
  const submit = setup({ paiements: [{ id_paiement: 1, statut }] });
  expect(screen.getByRole('spinbutton', { name: /^Quantité/ })).toHaveAttribute('readonly');
  expect(screen.getByRole('spinbutton', { name: /^Prix unitaire/ })).toHaveAttribute('readonly');
  fireEvent.change(screen.getByLabelText('Date d’échéance du paiement (optionnel)'), { target: { value: '30/10/26' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith({ date_echeance: '2026-10-30' }));
});

it('allows clearing the due date without resubmitting payment records', async () => {
  const submit = setup();
  fireEvent.change(screen.getByLabelText('Date d’échéance du paiement (optionnel)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith({ date_echeance: null }));
});

it('allows quantity and price changes on a deferred sale without payment history', async () => {
  const submit = setup({ est_promesse: true, paiements: [], quantite_couverte: 5 });
  fireEvent.change(screen.getByRole('spinbutton', { name: /^Quantité/ }), { target: { value: '12' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: /^Prix unitaire/ }), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith({ quantite: 12, prix_unitaire: 3 }));
});

it('blocks a due date before the sale and provides access to dedicated actions', async () => {
  const submit = setup();
  fireEvent.change(screen.getByLabelText('Date d’échéance du paiement (optionnel)'), { target: { value: '01/10/26' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findByText('La date d’échéance ne peut pas précéder la transaction.')).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le détail et les actions' }));
  expect(navigate).toHaveBeenCalledWith('/transactions/7');
});

it('does not save unchanged or canceled records', () => {
  setup({ est_actif: false });
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  expect(screen.getByLabelText('Date d’échéance du paiement (optionnel)')).toBeDisabled();
});
