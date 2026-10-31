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
it.each(['cheque', 'lc'])('gates %s financial edits while allowing notes through the audited path', async method => {
  render(<PaymentCorrectionDialog payment={{ ...payment, type_paiement: method, id_compte: null, source_reglement: null }} transaction={transaction} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.getByRole('spinbutton', { name: /^Montant/ })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Mode de paiement' })).toHaveAttribute('aria-disabled', 'true');
  fireEvent.change(screen.getByLabelText('Notes (optionnel)'), { target: { value: 'Note corrigée' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les modifications' }));
  await waitFor(() => expect(post.mock.calls[0][1].changes).toEqual({ notes: 'Note corrigée' }));
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
