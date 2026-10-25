import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClientDeferredSales from './ClientDeferredSales';
import { get, post } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));
const base = { id_transaction: 7, id_produit: 2, est_promesse: true, est_actif: true,
  quantite: 1000, date_livraison_prevue: '2026-10-25', nom_batiment_source: 'Bâtiment A',
  quantite_couverte: 600, quantite_en_attente: 400, quantite_reservee: 300,
  statut_paiement: 'paye', montant_paye: 1500 };
let sale;
beforeEach(() => {
  vi.clearAllMocks(); sale = base;
  get.mockImplementation(async path => path.endsWith('/completion') ? {
    quantite_couverte: 600, quantite_en_attente: 400, quantite_proposee: 300,
    empreinte_stock: 'a'.repeat(64), repartition_stock: [{ id_production: 1, date_production: '2026-10-25', quantite: 300 }],
  } : [sale]);
  post.mockImplementation(async () => (sale = { ...base, quantite_couverte: 900, quantite_en_attente: 100, quantite_reservee: 0 }));
});
afterEach(cleanup);
it('shows paid deferred sales and reloads quantities after partial completion', async () => {
  const completed = vi.fn();
  render(<MemoryRouter><ClientDeferredSales clientId="12" produitsMap={new Map([[2, 'Œufs moyens']])} onCompleted={completed} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Compléter 300 œufs' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmer 300 œufs' }));
  expect(await screen.findByText('900 / 1 000 œufs')).toBeVisible();
  expect(screen.getByText('100 restants')).toBeVisible();
  expect(screen.getByText('En attente de production')).toBeVisible();
  expect(completed).toHaveBeenCalledOnce();
  expect(post).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith('/transactions', { params: { id_client: 12, est_promesse: true, est_actif: true, skip: 0, limit: 100 } });
});
it('keeps completed sales visible with a history link and no completion action', async () => {
  sale = { ...base, quantite_couverte: 1000, quantite_en_attente: 0, quantite_reservee: 0 };
  render(<MemoryRouter><ClientDeferredSales clientId="12" produitsMap={new Map()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Voir l’historique (1)' }));
  expect(await screen.findByText('Stock complet')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Détails et historique' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Compléter 300 œufs' })).not.toBeInTheDocument();
});
it('retries a failed client query without reporting an empty history', async () => {
  get.mockRejectedValueOnce(new Error('Indisponible'));
  render(<MemoryRouter><ClientDeferredSales clientId="12" produitsMap={new Map()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Compléter 300 œufs' })).toBeVisible());
});

it('keeps a just-completed sale visible with one clear stock status', async () => {
  sale = { ...base, quantite_couverte: 900, quantite_en_attente: 100, quantite_reservee: 100 };
  get.mockImplementation(async path => path.endsWith('/completion') ? {
    quantite_couverte: 900, quantite_en_attente: 100, quantite_proposee: 100,
    empreinte_stock: 'a'.repeat(64), repartition_stock: [{ id_production: 1, date_production: '2026-10-25', quantite: 100 }],
  } : [sale]);
  post.mockImplementation(async () => (sale = { ...sale, quantite_couverte: 1000, quantite_en_attente: 0, quantite_reservee: 0 }));
  render(<MemoryRouter><ClientDeferredSales clientId="12" produitsMap={new Map()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Compléter 100 œufs' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmer 100 œufs' }));
  expect(await screen.findByText('Stock complet')).toBeVisible();
  expect(screen.queryByText('0 restants')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Compléter 100 œufs' })).not.toBeInTheDocument();
});
