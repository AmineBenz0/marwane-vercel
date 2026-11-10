import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TransactionAuditHistory from './TransactionAuditHistory';
import { get } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn() }));

const change = (id, overrides = {}) => ({
  id_audit: id,
  id_transaction: 17,
  id_utilisateur: 1,
  nom_utilisateur: 'Responsable',
  date_changement: '2026-11-09T15:20:00Z',
  champ_modifie: 'montant_total',
  ancienne_valeur: '100.00',
  nouvelle_valeur: '150.00',
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  get.mockImplementation(async (path) => path === '/corrections/history'
    ? { items: [], names: {}, has_more: false, next_offset: 0 }
    : []);
});
afterEach(cleanup);

it('loads audit records only after opening and renders readable before/after values', async () => {
  get.mockResolvedValueOnce([
    change(2),
    change(1, { champ_modifie: 'est_actif', ancienne_valeur: 'true', nouvelle_valeur: 'false',
      nom_utilisateur: null }),
  ]);
  render(<TransactionAuditHistory transactionId={17} />);
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  expect(await screen.findByText('Montant total')).toBeVisible();
  expect(screen.getByText('État de la transaction')).toBeVisible();
  expect(screen.getByText(text => text.replace(/\s/g, ' ').includes('100,00 MAD'))).toBeVisible();
  expect(screen.getByText(text => text.replace(/\s/g, ' ').includes('150,00 MAD'))).toBeVisible();
  expect(screen.getByText('Active')).toBeVisible();
  expect(screen.getByText('Annulée')).toBeVisible();
  expect(screen.getByText(/Auteur non identifié/)).toBeVisible();
  expect(screen.getByText(/Responsable/)).toBeVisible();
  expect(get).toHaveBeenCalledWith('/transactions/17/audit', { params: { skip: 0, limit: 10 } });
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  expect(get).toHaveBeenCalledTimes(2);
  expect(get).toHaveBeenCalledWith('/corrections/history', {
    params: { transaction_id: 17, offset: 0, limit: 20 },
  });
});

it('paginates without duplicating records and keeps the section read-only', async () => {
  get.mockImplementation(async (_path, options = {}) => Number(options.params?.skip ?? 0) === 0
    ? Array.from({ length: 10 }, (_, i) => change(i + 1))
    : [change(11)]);
  render(<TransactionAuditHistory transactionId={17} />);
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  await waitFor(() => expect(screen.getAllByText('Montant total')).toHaveLength(10), { timeout: 8000 });
  expect(get).toHaveBeenCalledWith('/transactions/17/audit', { params: { skip: 0, limit: 10 } });
  const more = await screen.findByRole('button', { name: 'Afficher les modifications précédentes' },
    {}, { timeout: 8000 });
  fireEvent.click(more);
  await waitFor(() => expect(get).toHaveBeenCalledWith('/transactions/17/audit',
    { params: { skip: 10, limit: 10 } }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Afficher les modifications précédentes' }))
    .not.toBeInTheDocument());
  expect(screen.getAllByText('Montant total')).toHaveLength(11);
  expect(screen.queryByRole('button', { name: /annuler|modifier|corriger|appliquer/i })).not.toBeInTheDocument();
});

it('explains empty history and distinguishes it from missing payment history', async () => {
  get.mockImplementation(async () => []);
  render(<TransactionAuditHistory transactionId={17} />);
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  expect(await screen.findByText('Aucune modification enregistrée.',
    {}, { timeout: 8000 })).toBeVisible();
  expect(get).toHaveBeenCalledWith('/transactions/17/audit', { params: { skip: 0, limit: 10 } });
  expect(screen.getByText(/Les paiements ne sont pas inclus/)).toBeVisible();
});

it('shows an error instead of an empty audit and supports retry', async () => {
  let calls = 0;
  get.mockImplementation(async () => {
    calls += 1;
    if (calls === 1) throw new Error('API unavailable');
    return [change(4)];
  });
  render(<TransactionAuditHistory transactionId={17} />);
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  const error = await screen.findByRole('alert');
  expect(within(error).getByText(/Impossible de charger/)).toBeVisible();
  fireEvent.click(within(error).getByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByText('Montant total')).toBeVisible();
  expect(get.mock.calls.filter(([path]) => path === '/transactions/17/audit')).toHaveLength(2);
  expect(get.mock.calls.filter(([path]) => path === '/corrections/history')).toHaveLength(1);
});


it('shows grouped verified corrections without hiding the legacy audit', async () => {
  get.mockImplementation(async (path) => {
    if (path === '/corrections/history') return {
      items: [{
        operation_id: 'test-operation', reason: 'Correction de la transaction',
        recorded_at: '2026-11-10T10:00:00Z', actor_name: 'Responsable',
        changes: { date_echeance: '2026-12-01' },
        before: { date_echeance: '2026-11-30' },
        after: { date_echeance: '2026-12-01' },
      }],
      names: {}, has_more: false, next_offset: 1,
    };
    return [change(2)];
  });
  render(<TransactionAuditHistory transactionId={17} />);
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  expect(await screen.findByText('Corrections vérifiées')).toBeVisible();
  expect(screen.getByText('Correction de la transaction')).toBeVisible();
  expect(screen.getByText('Montant total')).toBeVisible();
  expect(screen.getByText('Date d’échéance')).toBeVisible();
});
