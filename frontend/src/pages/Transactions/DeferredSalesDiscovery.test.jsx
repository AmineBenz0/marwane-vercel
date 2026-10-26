import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeferredSalesCard from './DeferredSalesCard';
import TransactionsList from './TransactionsList';
import ProductionDeferredNotice from '../Production/ProductionDeferredNotice';
import { get } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }));
vi.mock('./TransactionForm', () => ({ default: () => null }));
vi.mock('../../components/Filters/SmartFilterPanel', () => ({ default: () => null }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../utils/exportToExcel', () => ({ exportToExcelAdvanced: vi.fn() }));
vi.mock('../../utils/exportToPDF', () => ({ exportToPDF: vi.fn() }));
const paid = {
  id_transaction: 7, id_client: 1, id_fournisseur: null, id_produit: 1, id_batiment: 1,
  est_actif: true, est_promesse: true, allocation_automatique: true,
  quantite: 1000, quantite_couverte: 600, quantite_en_attente: 400, quantite_reservee: 600,
  prix_unitaire: 1.5, montant_total: 1500, montant_paye: 1500, montant_restant: 0,
  statut_paiement: 'paye', date_transaction: '2026-10-24', paiements: [],
};
const waiting = { ...paid, id_transaction: 8, id_client: 2, quantite_couverte: 0, quantite_reservee: 0 };
const closed = { ...paid, id_transaction: 9, id_client: 3, quantite_couverte: 1000, quantite_en_attente: 0, quantite_reservee: 1000 };
let sales;
const summary = row => ({ ...row, nom_client: `Client ${row.id_client}`, nom_produit: 'Œufs moyens', nom_batiment: 'Bâtiment A', date_livraison_prevue: '2026-10-25' });
const renderAt = (element, url = '/') => render(<MemoryRouter initialEntries={[url]}><Routes>
  <Route path="*" element={element} />
  <Route path="/transactions" element={<TransactionsList />} />
</Routes></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks();
  sales = [paid, waiting, closed];
  get.mockImplementation(async path => {
    if (path === '/transactions/deferred-sales') return sales.filter(row => row.quantite_en_attente > 0).map(summary);
    if (path === '/transactions') return sales;
    if (path === '/clients') return [1, 2, 3].map(id => ({ id_client: id, nom_client: `Client ${id}` }));
    if (path === '/produits') return [{ id_produit: 1, nom_produit: 'Œufs moyens' }];
    if (path === '/batiments') return [{ id_batiment: 1, nom: 'Bâtiment A' }];
    return [];
  });
});
afterEach(cleanup);

describe('deferred sale stock reservations', () => {
  it('keeps canceled sales in the register without adding them to financial totals or follow-up', async () => {
    sales.push({ ...paid, id_transaction: 99, est_actif: false, montant_total: 999, montant_restant: 999, montant_paye: 0, statut_paiement: 'impaye' });
    render(<MemoryRouter initialEntries={['/transactions']}><TransactionsList /></MemoryRouter>);
    expect(await screen.findByText('Annulée')).toBeVisible();
    expect(screen.getAllByText('4 500 MAD')[0]).toBeVisible();
    expect(screen.getByText(/Entrées 4\s500\sMAD \| Sorties 0\sMAD/)).toBeVisible();
    expect(screen.getByText('Tout est réglé')).toBeVisible();
  });

  it('shows automatic FIFO reservations and pending production without a completion action', async () => {
    renderAt(<DeferredSalesCard />);
    expect(await screen.findByText('600 œufs réservés · 400 à produire')).toBeVisible();
    expect(screen.getByText('1 avec du stock réservé')).toBeVisible();
    expect(screen.queryByRole('button', { name: /compléter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('collapses unreserved promises and filters the register by reservation status', async () => {
    renderAt(<DeferredSalesCard />);
    fireEvent.click(await screen.findByRole('button', { name: '1 vente(s) en attente de production' }));
    expect(screen.getByText('Client 2 · #8')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les ventes' }));
    expect(await screen.findByRole('button', { name: 'Réservation complète' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Réservation complète' }));
    expect(await screen.findByText('Client 3')).toBeVisible();
    expect(screen.queryByText('Client 1')).not.toBeInTheDocument();
  });

  it('reports only assignments made by the saved production, including fully reserved sales', async () => {
    const view = render(<MemoryRouter><ProductionDeferredNotice /></MemoryRouter>);
    expect(get).not.toHaveBeenCalled();
    view.rerender(<MemoryRouter><ProductionDeferredNotice savedProduction={{ id_batiment: 1, reservations_stock: [] }} /></MemoryRouter>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><ProductionDeferredNotice savedProduction={{ id_batiment: 1, reservations_stock: [{id_transaction: 9, quantite: 100}] }} /></MemoryRouter>);
    expect(screen.getByText('100 œufs réservés pour 1 vente.')).toBeVisible();
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a retry instead of reporting no pending sales when discovery fails', async () => {
    get.mockRejectedValueOnce(new Error('Connexion interrompue'));
    renderAt(<DeferredSalesCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('600 œufs réservés · 400 à produire')).toBeVisible();
  });
});

it('preserves the source-building filter when opening stock-reserved sales', async () => {
  render(<MemoryRouter initialEntries={['/transactions?view=deferred&stock=reserved&building=1']}><TransactionsList /></MemoryRouter>);
  await screen.findByText('600 œufs réservés · 400 à produire');
  await waitFor(() => expect(get).toHaveBeenCalledWith('/transactions', expect.objectContaining({ params: expect.objectContaining({ est_promesse: true, id_batiment: 1 }) })));
  expect(screen.getByText('Bâtiment : Bâtiment A')).toBeVisible();
  expect(screen.getByText('Client 3')).toBeVisible();
  expect(screen.queryByText('Client 2')).not.toBeInTheDocument();
  expect(screen.queryByText(/(?:^|· )0 à produire/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /compléter/i })).not.toBeInTheDocument();
});
