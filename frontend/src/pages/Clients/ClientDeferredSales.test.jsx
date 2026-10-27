import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClientDeferredSales from './ClientDeferredSales';
import { get } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn() }));
const base = { id_transaction: 7, id_produit: 2, est_promesse: true, est_actif: true,
  quantite: 1000, date_livraison_prevue: '2026-10-25', nom_batiment_source: 'Bâtiment A',
  quantite_couverte: 600, quantite_completee: 600, quantite_en_attente: 400, quantite_reservee: 0,
  statut_paiement: 'paye', montant_paye: 1500 };
let sales;
const renderSales = () => render(<MemoryRouter><ClientDeferredSales clientId="12" produitsMap={new Map([[2, 'Œufs moyens']])} /></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks();
  sales = [base];
  get.mockImplementation(async () => sales);
});
afterEach(cleanup);

it('shows a partial reservation for a paid deferred sale without a manual completion action', async () => {
  renderSales();
  expect(await screen.findByText('600 / 1 000 œufs')).toBeVisible();
  expect(screen.getByText('400 à produire')).toBeVisible();
  expect(screen.queryByText('Stock partiellement réservé')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Détails et historique' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /compléter/i })).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/transactions', { params: { id_client: 12, est_promesse: true, est_actif: true, skip: 0, limit: 100 } });
});

it('labels a fully reserved sale as reserved and keeps it in reservation history', async () => {
  sales = [{ ...base, quantite_couverte: 1000, quantite_completee: 1000, quantite_en_attente: 0, quantite_reservee: 0 }];
  renderSales();
  fireEvent.click(await screen.findByRole('button', { name: 'Réservations complètes' }));
  expect(await screen.findByText('1 000 / 1 000 œufs')).toBeVisible();
  expect(screen.getByText('Promesse complétée')).toBeVisible();
  expect(screen.queryByRole('button', { name: /compléter/i })).not.toBeInTheDocument();
});

it('retries a failed client query without reporting an empty history', async () => {
  get.mockRejectedValueOnce(new Error('Indisponible'));
  renderSales();
  fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByText('600 / 1 000 œufs')).toBeVisible();
});
