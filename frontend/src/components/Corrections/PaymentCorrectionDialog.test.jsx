import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PaymentCorrectionDialog from './PaymentCorrectionDialog';
import { get, post } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));
const payment = { id_paiement: 9, row_version: 4, type_paiement: 'virement', id_compte: 2,
  source_reglement: 'banque', montant: '5.00', date_paiement: '2026-10-20', statut: 'valide', notes: null };
const transaction = { id_transaction: 7, id_fournisseur: 3, montant_total: '10.00', montant_restant: '5.00', est_actif: true };
beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue([{ id_compte: 2, nom_banque: 'Banque B', numero_compte: '002' }]);
  post.mockImplementation(async (path, cmd) => ({ ...cmd, before: payment, after: { ...payment, ...cmd.changes },
    dependency_fingerprint: 'a'.repeat(64), impact: {} }));
});
afterEach(cleanup);
it('offers only active methods when correcting an ordinary payment', async () => {
  render(<PaymentCorrectionDialog payment={payment} transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Mode de paiement' }));
  expect(await screen.findByRole('option', { name: 'Espèces' })).toBeVisible();
  expect(screen.getByRole('option', { name: 'Virement' })).toBeVisible();
  expect(screen.queryByRole('option', { name: 'Carte bancaire' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Autre' })).not.toBeInTheDocument();
});

it.each(['carte', 'autre'])('preserves the existing %s method during an ordinary date correction', async method => {
  render(<PaymentCorrectionDialog payment={{ ...payment, type_paiement: method }} transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.queryByLabelText('Notes (optionnel)')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Date du paiement' }), { target: { value: '21/10/26' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  await waitFor(() => expect(post.mock.calls[0][1].changes).toEqual({ date_paiement: '2026-10-21' }));
});


it('previews bank-to-cash funding and explicitly clears the old account', async () => {
  const saved = vi.fn();
  render(<PaymentCorrectionDialog payment={payment} transaction={transaction} onClose={vi.fn()} onSaved={saved} />);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Source du règlement' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Caisse' }));
  expect(screen.queryByRole('combobox', { name: 'Compte bancaire' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  await screen.findByRole('button', { name: 'Confirmer la correction' });
  expect(post.mock.calls[0][1]).toMatchObject({ changes: { source_reglement: 'caisse', id_compte: null }, target: { expected_version: 4 } });
  expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la correction' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
});
it.each(['cheque', 'lc'])('keeps the %s amount and method locked without an optional notes field', async method => {
  render(<PaymentCorrectionDialog payment={{ ...payment, type_paiement: method, id_lc: method === 'lc' ? 3 : null,
    id_compte: null, source_reglement: null }} transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.getByRole('spinbutton', { name: /^Montant/ })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Mode de paiement' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.queryByLabelText('Notes (optionnel)')).not.toBeInTheDocument();
  if (method === 'lc') expect(screen.getByRole('link', { name: 'Modifier la lettre de crédit liée' })).toHaveAttribute('href', '/lettres-credit/3');
});


it('preserves legacy supplier bank funding when changing only the payment method', async () => {
  render(<PaymentCorrectionDialog payment={{ ...payment, source_reglement: null }} transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Compte bancaire' })).toHaveTextContent('Banque B'));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Mode de paiement' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Espèces' }));
  expect(screen.getByRole('combobox', { name: 'Compte bancaire' })).toHaveTextContent('Banque B');
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  await waitFor(() => expect(post.mock.calls[0][1].changes).toEqual({ type_paiement: 'cash', source_reglement: 'banque' }));
});

it('previews a cleared-cheque status correction while preserving amount and funding', async () => {
  render(<PaymentCorrectionDialog payment={{ ...payment, type_paiement: 'cheque', statut_cheque: 'encaisse', date_encaissement_effective: '2026-10-21' }} transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.getByRole('spinbutton', { name: /^Montant/ })).toBeDisabled();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Statut du chèque' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Rejeté' }));
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  await waitFor(() => expect(post.mock.calls[0][1].changes).toEqual({ statut_cheque: 'rejete', date_encaissement_effective: null }));
});

it('does not offer an editable correction for a cancelled cheque', async () => {
  render(<PaymentCorrectionDialog payment={{ ...payment, type_paiement: 'cheque', statut: 'annule',
    statut_cheque: 'encaisse', date_encaissement_effective: '2026-10-21' }} transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.getByRole('textbox', { name: /^Date du paiement/ })).toBeDisabled();
  expect(screen.getByRole('spinbutton', { name: /^Montant/ })).toBeDisabled();
  expect(screen.queryByLabelText('Notes (optionnel)')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  expect(await screen.findByText('Aucune valeur n’a changé.')).toBeVisible();
  expect(post).not.toHaveBeenCalled();

});
