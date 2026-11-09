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

beforeEach(() => { vi.clearAllMocks(); });
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
  expect(screen.getByText(text => text.replace(/\\s/g, ' ').includes('100,00 MAD'))).toBeVisible();
  expect(screen.getByText(text => text.replace(/\\s/g, ' ').includes('150,00 MAD'))).toBeVisible();
  expect(screen.getByText('Active')).toBeVisible();
  expect(screen.getByText('Annulée')).toBeVisible();
  expect(screen.getByText(/Auteur non identifié/)).toBeVisible();
  expect(screen.getByText(/Responsable/)).toBeVisible();
  expect(get).toHaveBeenCalledWith('/transactions/17/audit', { params: { skip: 0, limit: 10 } });
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  expect(get).toHaveBeenCalledTimes(1);
});

it('paginates without duplicating records and keeps the section read-only', async () => {
  get.mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => change(i + 1)))
    .mockResolvedValueOnce([change(11)]);
  render(<TransactionAuditHistory transactionId={17} />);
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  const more = await screen.findByRole('button', { name: 'Afficher les modifications précédentes' });
  fireEvent.click(more);
  await waitFor(() => expect(get).toHaveBeenCalledWith('/transactions/17/audit',
    { params: { skip: 10, limit: 10 } }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Afficher les modifications précédentes' }))
    .not.toBeInTheDocument());
  expect(screen.getAllByText('Montant total')).toHaveLength(11);
  expect(screen.queryByRole('button', { name: /annuler|modifier|corriger|appliquer/i })).not.toBeInTheDocument();
});

it('explains empty history and distinguishes it from missing payment history', async () => {
  get.mockResolvedValueOnce([]);
  render(<TransactionAuditHistory transactionId={17} />);
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  expect(await screen.findByText('Aucune modification enregistrée.')).toBeVisible();
  expect(screen.getByText(/Les paiements ne sont pas inclus/)).toBeVisible();
});

it('shows an error instead of an empty audit and supports retry', async () => {
  get.mockRejectedValueOnce(new Error('API unavailable')).mockResolvedValueOnce([change(4)]);
  render(<TransactionAuditHistory transactionId={17} />);
  fireEvent.click(screen.getByRole('button', { name: 'Historique des modifications' }));
  const error = await screen.findByRole('alert');
  expect(within(error).getByText(/Impossible de charger/)).toBeVisible();
  fireEvent.click(within(error).getByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByText('Montant total')).toBeVisible();
  expect(get).toHaveBeenCalledTimes(2);
});
