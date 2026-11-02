import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdvanceSettlementDialog from './AdvanceSettlementDialog';
import { get, post } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));
const targets = [{ id_transaction: 10, date_transaction: '2026-10-01', produit_nom: 'Œufs', before: '10.00', capacity: '10.00', montant: '6.00', after: '4.00' }];
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async path => path === '/comptes-bancaires' ? [] : { available: '6.00', montant_avance: '6.00', targets });
  post.mockImplementation(async (path, payload) => path.endsWith('/preview') ? { available: '6.00', montant_avance: '6.00', payment_amount: payload.paiement?.montant || '0',
    advance_after: '0.00', money_effect: payload.paiement ? 'cash' : 'unchanged', targets: [{ ...targets[0], after: payload.paiement ? '0.00' : '4.00' }], dependency_fingerprint: 'a'.repeat(64) } : { record: {} });
});
afterEach(cleanup);
it('suggests the advance and complement, previews once, and confirms a frozen combined payment', async () => {
  const saved = vi.fn();
  render(<AdvanceSettlementDialog transaction={{ id_transaction: 10, id_client: 7 }} onClose={vi.fn()} onSaved={saved} />);
  expect(await screen.findByRole('spinbutton', { name: 'Avance à utiliser (MAD)' })).toHaveValue(6);
  expect(screen.getByRole('spinbutton', { name: 'Complément à encaisser (MAD)' })).toHaveValue(4);
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier le règlement' }));
  await screen.findByRole('button', { name: 'Confirmer le règlement' });
  expect(post.mock.calls[0][1]).toMatchObject({ id_transaction: 10, montant_avance: '6.00', paiement: { montant: '4.00', type_paiement: 'cash', id_compte: null } });
  expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le règlement' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(post.mock.calls[1][1].command).toEqual(post.mock.calls[0][1]);
});
it('allows the oldest-first proposal to be adjusted and submits all destinations together', async () => {
  get.mockImplementation(async path => path === '/comptes-bancaires' ? [] : { available: '6', montant_avance: '6', targets: [...targets, { ...targets[0], id_transaction: 11, montant: '0' }] });
  render(<AdvanceSettlementDialog partyType="fournisseur" partyId={3} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.change(await screen.findByRole('spinbutton', { name: /Achat n°10/ }), { target: { value: '2' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: /Achat n°11/ }), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier le règlement' }));
  await screen.findByRole('button', { name: 'Confirmer le règlement' });
  expect(post.mock.calls[0][1]).toMatchObject({ id_fournisseur: 3, cibles: [{ id_transaction: 10, montant: '2' }, { id_transaction: 11, montant: '4' }] });
});
it('retries an uncertain combined save with the same operation and payload', async () => {
  render(<AdvanceSettlementDialog transaction={{ id_transaction: 10, id_client: 7 }} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Vérifier le règlement' }));
  await screen.findByRole('button', { name: 'Confirmer le règlement' });
  post.mockRejectedValueOnce(Object.assign(new Error('Timeout'), { status: 504 }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le règlement' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Vérifier l’enregistrement' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
  expect(post.mock.calls[1][1]).toEqual(post.mock.calls[2][1]);
});
it('keeps dates and the other-payment escape available after options fail', async () => {
  get.mockRejectedValue(new Error('Une opération liée doit être réconciliée'));
  const other = vi.fn();
  render(<AdvanceSettlementDialog transaction={{ id_transaction: 10, id_client: 7 }} onClose={vi.fn()} onSaved={vi.fn()} onOtherPayment={other} />);
  await screen.findByText('Une opération liée doit être réconciliée');
  expect(screen.getByRole('textbox', { name: /^Date du règlement/ })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Chèque, LC ou autre règlement' }));
  expect(other).toHaveBeenCalledOnce();
});
