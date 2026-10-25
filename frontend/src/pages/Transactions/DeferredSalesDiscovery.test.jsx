import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeferredSalesCard from './DeferredSalesCard';
import TransactionsList from './TransactionsList';
import ProductionDeferredNotice from '../Production/ProductionDeferredNotice';
import { get, post } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }));
vi.mock('./TransactionForm', () => ({ default: () => null }));
vi.mock('../../components/Filters/SmartFilterPanel', () => ({ default: () => null }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../utils/exportToExcel', () => ({ exportToExcelAdvanced: vi.fn() }));
vi.mock('../../utils/exportToPDF', () => ({ exportToPDF: vi.fn() }));
const paid = {
  id_transaction: 7, id_client: 1, id_fournisseur: null, id_produit: 1, id_batiment: 1,
  est_actif: true, est_promesse: true, allocation_automatique: true,
  quantite: 1000, quantite_couverte: 600, quantite_en_attente: 400, quantite_reservee: 300,
  prix_unitaire: 1.5, montant_total: 1500, montant_paye: 1500, montant_restant: 0,
  statut_paiement: 'paye', date_transaction: '2026-10-24', paiements: [],
};
const waiting = { ...paid, id_transaction: 8, id_client: 2, quantite_reservee: 0 };
const closed = { ...paid, id_transaction: 9, id_client: 3, quantite_couverte: 1000, quantite_en_attente: 0, quantite_reservee: 0 };
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
    if (path === '/transactions/7/completion') return {
      quantite_couverte: 600, quantite_en_attente: 400, quantite_proposee: 300,
      empreinte_stock: 'a'.repeat(64), repartition_stock: [{ id_production: 1, date_production: '2026-10-25', quantite: 300 }],
    };
    return [];
  });
  post.mockImplementation(async () => {
    const updated = { ...paid, quantite_couverte: 900, quantite_en_attente: 100, quantite_reservee: 0 };
    sales = [updated, waiting, closed];
    return updated;
  });
});
afterEach(cleanup);

describe('deferred sale discovery', () => {
  it('keeps paid sales actionable and refreshes the dashboard after partial completion', async () => {
    renderAt(<DeferredSalesCard />);
    expect(await screen.findByText('300 œufs disponibles sur 400 restants')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la vente 7' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer 300 œufs' }));
    expect(await screen.findByText('Vente #7 : 100 œufs restent à fournir.')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Compléter la vente 7' })).not.toBeInTheDocument());
    expect(screen.getByText('2 vente(s) en attente de production')).toBeVisible();
    expect(post).toHaveBeenCalledExactlyOnceWith('/transactions/7/completion', {
      quantite: 300, quantite_couverte_attendue: 600, empreinte_stock: 'a'.repeat(64),
    });
  });
  it('collapses waiting rows and retains completed sales in the filtered register', async () => {
    renderAt(<DeferredSalesCard />);
    fireEvent.click(await screen.findByRole('button', { name: '1 vente(s) en attente de production' }));
    expect(screen.getByText('Client 2 · #8')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les ventes' }));
    expect(await screen.findByRole('button', { name: 'Stock complet' })).toBeVisible();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/transactions', expect.objectContaining({ params: expect.objectContaining({ est_promesse: true }) })));
    fireEvent.click(screen.getByRole('button', { name: 'Stock complet' }));
    expect(await screen.findByText('Client 3')).toBeVisible();
    expect(screen.queryByText('Client 1')).not.toBeInTheDocument();
  });
  it('opens the same completion dialog directly from a paid transaction row', async () => {
    render(<MemoryRouter initialEntries={['/transactions?view=deferred&stock=ready']}><TransactionsList /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Compléter la vente 7' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compléter la livraison différée' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Confirmer 300 œufs' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Compléter la vente 7' })).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('checks stock only after production save and links to ready deferred sales without a popup', async () => {
    const view = renderAt(<ProductionDeferredNotice refreshKey={0} />);
    expect(get).not.toHaveBeenCalled();
    view.rerender(<MemoryRouter><ProductionDeferredNotice refreshKey={1} /></MemoryRouter>);
    expect(await screen.findByText(/Du stock est disponible pour compléter 1 vente/)).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('shows a retry instead of reporting no pending sales when discovery fails', async () => {
    get.mockRejectedValueOnce(new Error('Connexion interrompue'));
    renderAt(<DeferredSalesCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('300 œufs disponibles sur 400 restants')).toBeVisible();
  });
});
