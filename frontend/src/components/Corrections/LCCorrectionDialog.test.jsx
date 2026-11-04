import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LCCorrectionDialog from './LCCorrectionDialog';
import { get, post } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));
const lc = { id_lc: 3, numero_reference: 'LC-TEST', numero_serie: null, banque_emettrice: null, version_utilisation: 2, montant: '5.00', notes: null, type_detenteur: 'client', id_client: 7,
  id_fournisseur: null, statut: 'utilisee', date_emission: '2026-10-01', date_disponibilite: '2026-10-02' };
const context = { usage: 'deposit', date_effet: '2026-10-03', id_compte: 2 };
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async path => path.endsWith('/correction-context') ? { plan: context }
    : path === '/comptes-bancaires' ? [{ id_compte: 2, nom_banque: 'Banque test', numero_compte: 'TEST' }]
      : path === '/clients' ? [{ id_client: 7, nom_client: 'Client test' }] : []);
  post.mockImplementation(async (path, payload) => path.endsWith('/preview')
    ? { before: lc, after: { ...lc, ...payload.changes }, usage: 'deposit', montant: payload.changes.montant,
      id_compte: 2, date_effet: context.date_effet, remaining_after: null, money_effect: 'replaced', dependency_fingerprint: 'a'.repeat(64) }
    : { record: lc });
});
afterEach(cleanup);

it('previews the linked deposit, freezes the opening version and confirms separately', async () => {
  const saved = vi.fn();
  const view = render(<LCCorrectionDialog lc={lc} onClose={vi.fn()} onSaved={saved} />);
  const amount = await screen.findByRole('spinbutton', { name: 'Montant de la LC (MAD)' });
  fireEvent.change(amount, { target: { value: '6.50' } });
  view.rerender(<LCCorrectionDialog lc={{ ...lc, version_utilisation: 9 }} onClose={vi.fn()} onSaved={saved} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await screen.findByRole('button', { name: 'Enregistrer les modifications' });
  expect(post.mock.calls[0]).toEqual(['/lettres-credit/corrections/preview', expect.objectContaining({ expected_version: 2, changes: { montant: '6.50' } })]);
  expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
});

it('retries an uncertain save using the same operation and payload', async () => {
  const saved = vi.fn();
  render(<LCCorrectionDialog lc={lc} cancelUsage onClose={vi.fn()} onSaved={saved} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await screen.findByRole('button', { name: 'Enregistrer les modifications' });
  post.mockRejectedValueOnce(Object.assign(new Error('Timeout'), { status: 504 }));
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
  const retry = await screen.findByRole('button', { name: 'Vérifier l’enregistrement' });
  expect(screen.getByRole('button', { name: 'Annuler', exact: true })).toBeDisabled();
  fireEvent.click(retry);
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(post.mock.calls[1][1]).toEqual(post.mock.calls[2][1]);
  expect(post.mock.calls[1][1].command).toMatchObject({ action: 'cancel_usage', changes: {} });
});

it('keeps the preview visible and disables confirmation after a conflict', async () => {
  render(<LCCorrectionDialog lc={lc} cancelUsage onClose={vi.fn()} onSaved={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await screen.findByRole('button', { name: 'Enregistrer les modifications' });
  post.mockRejectedValueOnce(Object.assign(new Error('Aperçu périmé'), { status: 409 }));
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
  await screen.findByText('Aperçu périmé');
  expect(screen.getByRole('button', { name: 'Enregistrer les modifications' })).toBeDisabled();
});

it('labels surplus as credit instead of a negative amount due', async () => {
  post.mockResolvedValue({ before: lc, after: { ...lc, montant: '6.00' }, usage: 'payment',
    remaining_after: '-1.00', balance_side: 'client', money_effect: 'replaced', dependency_fingerprint: 'a'.repeat(64) });
  render(<LCCorrectionDialog lc={lc} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Montant de la LC (MAD)' }), { target: { value: '6.00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findByText(/Crédit client après correction/)).toHaveTextContent('1 MAD');
  expect(screen.queryByText(/Reste à régler après/)).not.toBeInTheDocument();
});

it('previews reference and issuer changes through the audited endpoint', async () => {
  const saved = vi.fn();
  render(<LCCorrectionDialog lc={lc} onClose={vi.fn()} onSaved={saved} />);
  fireEvent.change(await screen.findByLabelText('Référence LC', { exact: false }), { target: { value: 'LC-CORRECTED' } });
  expect(screen.queryByLabelText('Numéro de série')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Banque émettrice'), { target: { value: 'Banque corrigée' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await screen.findByRole('button', { name: 'Enregistrer les modifications' });
  expect(post.mock.calls[0][1].changes).toEqual({ numero_reference: 'LC-CORRECTED', banque_emettrice: 'Banque corrigée' });
  expect(screen.getByText(/Référence LC : LC-TEST/)).toHaveTextContent('LC-CORRECTED');
  expect(screen.getByText(/Banque émettrice : Non renseigné/)).toHaveTextContent('Banque corrigée');
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(post.mock.calls[1][1].command).toEqual(post.mock.calls[0][1]);
  expect(post.mock.calls[0][1].reason).toBe('Modification des informations de la LC');
});

it('clears optional issuer without changing the reference or hidden serial', async () => {
  render(<LCCorrectionDialog lc={{ ...lc, banque_emettrice: 'Ancienne banque', numero_serie: 'SERIE-OLD' }} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.queryByLabelText('Numéro de série')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Banque émettrice'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(post.mock.calls[0][1].changes).toEqual({ banque_emettrice: null }));
});
