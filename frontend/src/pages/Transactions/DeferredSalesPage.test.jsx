import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeferredSalesPage from './DeferredSalesPage';
import { get } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn() }));
const sale = { id_transaction: 7, id_client: 1, id_produit: 1, est_promesse: true, est_actif: true, quantite: 70, quantite_couverte: 65, quantite_en_attente: 5, date_transaction: '2026-10-24', date_livraison_prevue: '2026-10-25', montant_total: 105, montant_paye: 105, montant_restant: 0, repartition_stock: [{ id_production: 1, date_production: '2026-10-24', quantite: 65 }] };
const summary = { ...sale, nom_client: 'Marché Central', nom_produit: 'Œufs démarrage', nom_batiment: 'Bâtiment A' };
const later = { ...summary, id_transaction: 8, nom_client: 'Épicerie', quantite_couverte: 0, quantite_en_attente: 50, date_livraison_prevue: '2030-01-01' };
const show = (url = '/livraisons-a-suivre') => render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/livraisons-a-suivre" element={<DeferredSalesPage />} /><Route path="/dashboard" element={<h1>Accueil quotidien</h1>} /><Route path="/transactions/:id" element={<h1>Vente et paiements</h1>} /></Routes></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async path => {
    if (path === '/transactions/deferred-sales') return [later, summary, { ...summary, id_transaction: 9, quantite_en_attente: 0 }, { ...summary, id_transaction: 10, est_actif: false }];
    if (path === '/transactions/7') return sale;
    return [];
  });
});
afterEach(cleanup);
it('orders pending sales by expected date, searches clients without accents and returns home', async () => {
  show();
  expect(await screen.findByText('2 ventes · 55 œufs à produire')).toBeVisible();
  const cards = screen.getAllByRole('button', { name: /Voir le détail de la vente/ });
  expect(cards).toHaveLength(2);
  expect(cards[0]).toHaveAccessibleName(/#7/);
  expect(cards[1]).toHaveAccessibleName(/#8/);
  fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), { target: { value: 'EPICERIE' } });
  expect(screen.queryByText('Marché Central')).not.toBeInTheDocument();
  expect(screen.getByText('Épicerie')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retour à l’accueil' }));
  expect(await screen.findByRole('heading', { name: 'Accueil quotidien' })).toBeVisible();
});
it('opens stock origins and existing payment totals directly, then closes the panel', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Voir le détail de la vente #7/ }));
  const panel = await screen.findByRole('dialog', { name: 'Vente #7' });
  expect(await within(panel).findByText('65 œufs')).toBeVisible();
  const payment = within(panel).getByRole('region', { name: 'Paiement de la vente' });
  expect(within(payment).getByText('0 MAD')).toBeVisible();
  expect(within(payment).getAllByText('105 MAD')).toHaveLength(2);
  fireEvent.click(within(panel).getByRole('button', { name: 'Fermer le détail' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('offers retry for failed detail requests without showing another sale’s data', async () => {
  let fail = true;
  get.mockImplementation(async path => {
    if (path === '/transactions/deferred-sales') return [summary];
    if (path === '/transactions/7' && fail) throw new Error('Vente indisponible');
    return sale;
  });
  show('/livraisons-a-suivre?vente=7');
  expect(await screen.findByText('Vente indisponible')).toBeVisible();
  expect(screen.queryByText('105 MAD')).not.toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByText('65 œufs')).toBeVisible();
});
it('keeps the home return available when the list is empty or fails', async () => {
  get.mockRejectedValueOnce(new Error('Connexion interrompue'));
  show();
  expect(await screen.findByText('Connexion interrompue')).toBeVisible();
  get.mockResolvedValueOnce([]);
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByText('Aucune livraison en attente de production.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Retour à l’accueil' })).toBeVisible();
});
