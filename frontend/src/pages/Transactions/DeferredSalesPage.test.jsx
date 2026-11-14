import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeferredSalesPage from './DeferredSalesPage';
import { get, patch, post } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));
const sale = { id_transaction: 7, id_client: 1, id_produit: 1, est_promesse: true, est_actif: true, quantite: 70, quantite_couverte: 65, quantite_en_attente: 5, date_transaction: '2026-10-24', date_livraison_prevue: '2026-10-25', montant_total: 105, montant_paye: 105, montant_restant: 0, row_version: 1, repartition_stock: [{ id_production: 1, date_production: '2026-10-24', quantite: 65 }] };
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
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
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
it('opens clear stock coverage and existing payment totals, then closes the panel', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Voir le détail de la vente #7/ }));
  const panel = await screen.findByRole('dialog', { name: 'Vente #7' });
  expect(await within(panel).findByText('Stock couvert')).toBeVisible();
  expect(within(panel).getByText('65')).toBeVisible();
  expect(within(panel).getByText('À produire')).toBeVisible();
  expect(within(panel).queryByText('Production utilisée')).not.toBeInTheDocument();
  const payment = within(panel).getByRole('region', { name: 'Paiement de la vente' });
  expect(within(payment).getByText(/0,00.*MAD/)).toBeVisible();
  expect(within(payment).getAllByText(/105,00.*MAD/)).toHaveLength(2);
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
  expect(await screen.findByText('Stock couvert')).toBeVisible();
  expect(screen.getByText('65')).toBeVisible();
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

it('counts stock reserved for completion separately from eggs still to produce', async () => {
  const reserved = { ...summary, quantite_reservee: 3 };
  get.mockImplementation(async path => path === '/transactions/deferred-sales' ? [reserved] : sale);
  show();
  expect(await screen.findByText('1 vente · 2 œufs à produire')).toBeVisible();
  expect(screen.getByText(/65 \/ 70 couverts/)).toBeVisible();
  expect(screen.getByText(/3 prêts à compléter/)).toBeVisible();
  expect(screen.getByText(/2 à produire/)).toBeVisible();
});

it('changes only the expected delivery date using the versioned delivery endpoint', async () => {
  patch.mockResolvedValueOnce({ ...sale, date_livraison_prevue: '2026-12-12', row_version: 2 });
  show('/livraisons-a-suivre?vente=7');
  const panel = await screen.findByRole('dialog', { name: 'Vente #7' });
  await within(panel).findByRole('button', { name: 'Modifier la date prévue' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Modifier la date prévue' }));
  fireEvent.change(within(panel).getByLabelText('Nouvelle date prévue'), { target: { value: '2026-12-12' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Enregistrer la date' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/transactions/7/delivery-date', {
    date_livraison_prevue: '2026-12-12', expected_version: 1,
  }));
  expect(post).not.toHaveBeenCalled();
});

it('does not offer stock-only remainder closure before the financial workflow is ready', async () => {
  show('/livraisons-a-suivre?vente=7');
  const panel = await screen.findByRole('dialog', { name: 'Vente #7' });
  expect(within(panel).queryByRole('button', { name: 'Clore le reste à produire' })).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});


it('confirms a server-quoted financial avoir and keeps delivery history visible after the sale leaves the queue', async () => {
  vi.stubEnv('VITE_ENABLE_DEFERRED_CANCELLATION_WRITES', 'true');
  const quote = {
    id_transaction: 7, expected_version: 1, quantite_en_attente_attendue: 5,
    quantite_couverte: 65, quantite_annulee: 5, quantite_annulee_cumulee: 5,
    date_effet: '2026-11-11', montant_initial: '105.00', montant_avoir: '7.50',
    montant_avoirs_cumule: '7.50', montant_net: '97.50',
    montant_paye: '105.00', montant_restant: '-7.50', credit_client: '7.50',
  };
  let closed = false;
  const canceled = {
    ...sale, quantite_en_attente: 0, quantite_annulee: 5,
    montant_avoir: '7.50', montant_net: '97.50', montant_restant: '-7.50',
    row_version: 2,
    avoirs_livraison_differee: [
      { id_avoir: 'abc', date_effet: '2026-11-11', quantite_annulee: 5,
        montant_avoir: '7.50', avoir_cumule: '7.50' },
    ],
  };
  get.mockImplementation(async path => {
    if (path === '/transactions/deferred-sales') return closed ? [] : [summary];
    if (path === '/transactions/7') return closed ? canceled : sale;
    if (path === '/transactions/7/cancel-remainder/preview') return quote;
    if (path === '/transactions/7/completion-history') return closed ? [{
      id: 8, date: '2026-11-11', type: 'cancel_remainder',
      quantite: 5, montant_avoir: '7.50', repartition_stock: [],
    }] : [];
    return [];
  });
  post.mockImplementation(async () => {
    closed = true;
    return {
      ...quote, id_avoir: 'abc', quantite_en_attente: 0, rejoue: false,
    };
  });
  show('/livraisons-a-suivre?vente=7');
  const panel = await screen.findByRole('dialog', { name: 'Vente #7' });
  fireEvent.click(await within(panel).findByRole('button', { name: 'Annuler les œufs restants' }));
  const confirmation = await screen.findByRole('dialog', { name: 'Annuler les œufs restants ?' });
  expect(await within(confirmation).findByText('Œufs à annuler')).toBeVisible();
  expect(within(confirmation).getByText('5 œufs')).toBeVisible();
  expect(within(confirmation).getAllByText(/7,50/).length).toBeGreaterThan(0);
  expect(within(confirmation).getByText(/Aucun remboursement ni mouvement de caisse/)).toBeVisible();
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(within(confirmation).getByRole('button', { name: "Confirmer l'annulation des œufs restants" }));
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post).toHaveBeenCalledWith('/transactions/7/cancel-remainder', {
    operation_id: expect.stringMatching(/^[a-f0-9-]{36}$/i),
    expected_version: 1, quantite_en_attente_attendue: 5,
    montant_paye_attendu: '105.00', date_effet_attendue: '2026-11-11',
  });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Annuler les œufs restants ?' })).not.toBeInTheDocument());
  expect(within(panel).getByText(/Avoir de .*7,50/)).toBeVisible();
  const payment = within(panel).getByRole('region', { name: 'Paiement de la vente' });
  expect(within(payment).getByText('Crédit client')).toBeVisible();
  expect(within(payment).getByText('Montant net')).toBeVisible();
  expect(within(panel).queryByRole('button', { name: 'Annuler les œufs restants' })).not.toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: 'Historique du stock et des avoirs' }));
  expect(await within(panel).findByText('Annulation des œufs restants')).toBeVisible();
  expect(within(panel).getByText(/Avoir commercial : .*7,50/)).toBeVisible();
  expect(await screen.findByText('Aucune livraison en attente de production.')).toBeVisible();
  expect(within(panel).getByText('Marché Central')).toBeVisible();
});
