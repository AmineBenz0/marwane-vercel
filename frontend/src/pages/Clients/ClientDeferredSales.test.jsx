import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClientDeferredSales from './ClientDeferredSales';
import { get, post } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));
const base = { id_transaction: 7, id_produit: 2, est_promesse: true, est_actif: true,
  date_livraison_prevue: '2026-10-25', nom_batiment_source: 'Bâtiment A',
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
  fireEvent.click(await screen.findByRole('button', { name: 'Compléter la vente #7' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmer 300 œufs' }));
  expect(await screen.findByText('900 œufs couverts · 100 restants · 0 réservés disponibles')).toBeVisible();
  expect(completed).toHaveBeenCalledOnce();
  expect(post).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith('/transactions', { params: { id_client: 12, est_promesse: true, est_actif: true, skip: 0, limit: 100 } });
});
it('keeps completed sales visible with a history link and no completion action', async () => {
  sale = { ...base, quantite_couverte: 1000, quantite_en_attente: 0, quantite_reservee: 0 };
  render(<MemoryRouter><ClientDeferredSales clientId="12" produitsMap={new Map()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Voir 1 livraison(s) complétée(s)' }));
  expect(await screen.findByText('Stock complet')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Détails et historique' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Compléter la vente #7' })).not.toBeInTheDocument();
});
it('retries a failed client query without reporting an empty history', async () => {
  get.mockRejectedValueOnce(new Error('Indisponible'));
  render(<MemoryRouter><ClientDeferredSales clientId="12" produitsMap={new Map()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
  await waitFor(() => expect(screen.getByText('À compléter')).toBeVisible());
});
