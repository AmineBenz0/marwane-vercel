import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TransactionDetail from './TransactionDetail';
import { get, post } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '7' }), useLocation: () => ({ search: '' }), useNavigate: () => vi.fn() }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../components/PaiementForm', () => ({ default: () => null }));
vi.mock('../../components/PaiementForm/MultiPaiementForm', () => ({ default: () => null }));
const sale = {
  id_transaction: 7, id_client: 1, id_produit: 1, id_batiment: 1,
  est_actif: true, est_promesse: true, allocation_automatique: true,
  quantite_reservee: 40, quantite: 1000, quantite_couverte: 900, quantite_en_attente: 100,
  prix_unitaire: 1.5, montant_total: 1500, montant_paye: 1500, montant_restant: 0,
  statut_paiement: 'paye', pourcentage_paye: 100, date_transaction: '2026-10-25',
  date_livraison_prevue: '2026-10-26', repartition_stock: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async path => {
    if (path === '/transactions/7') return sale;
    if (path === '/paiements/transaction/7/statut') return sale;
    if (path === '/produits') return [{ id_produit: 1, nom_produit: 'Oeufs - Moyen' }];
    if (path === '/clients') return [{ id_client: 1, nom_client: 'Client payé' }];
    if (path === '/paiements') return [{ id_paiement: 15, id_transaction: 7, date_paiement: '2026-10-25', montant: 1500, type_paiement: 'cash', statut: 'valide' }];
    if (path === '/transactions/7/completion-history') return [];
    return [];
  });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it('shows reserved stock on a paid deferred sale without presenting it as delivered', async () => {
  render(<TransactionDetail />);
  expect(await screen.findByText('Stock partiellement réservé')).toBeVisible();
  expect(screen.getByText('900 / 1 000 œufs')).toBeVisible();
  expect(screen.getByText('60 œufs à produire')).toBeVisible();
  expect(screen.getByText('40 prêts à compléter')).toBeVisible();
  expect(screen.queryByRole('button', { name: /compléter/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: /compléter/i })).not.toBeInTheDocument();
});

it('refreshes the adjusted sale totals after recording a payment', async () => {
  let paid = false;
  const unpaid = {
    ...sale, quantite_reservee: 0, quantite_en_attente: 0,
    quantite_annulee: 5, montant_total: 24.65, montant_avoir: 0.05,
    montant_net: 24.60, montant_paye: 0, montant_restant: 24.60,
    statut_paiement: 'impaye',
    avoirs_livraison_differee: [{ id_avoir: 'a', date_effet: '2026-11-13', quantite_annulee: 5, montant_avoir: 0.05 }],
  };
  get.mockImplementation(async path => {
    const current = paid ? { ...unpaid, montant_paye: 1.23, montant_restant: 23.37, statut_paiement: 'partiel' } : unpaid;
    if (path === '/transactions/7' || path === '/paiements/transaction/7/statut') return current;
    if (path === '/paiements') return paid ? [{ id_paiement: 1, montant: 1.23, type_paiement: 'cash', statut: 'valide' }] : [];
    if (path === '/produits') return [{ id_produit: 1, nom_produit: 'Oeufs - Moyen' }];
    if (path === '/clients') return [{ id_client: 1, nom_client: 'Client payé' }];
    return [];
  });
  post.mockImplementation(async () => { paid = true; return {}; });

  render(<TransactionDetail />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ajouter un paiement' }));
  const dialog = await screen.findByRole('dialog', { name: /Ajouter un paiement/ });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Ajouter un paiement/ })).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByText(/1,23\s*MAD/)).toBeVisible());
  expect(screen.getByText(/23,37\s*MAD/)).toBeVisible();
});

it('shows the gated cancellation on a full sale and recalculates net value and credit on commit', async () => {
  vi.stubEnv('VITE_ENABLE_DEFERRED_CANCELLATION_WRITES', 'true');
  let cancelled = false;
  const initial = { ...sale, quantite_reservee: 0, row_version: 3 };
  const updated = {
    ...initial, quantite_en_attente: 0, quantite_annulee: 100,
    row_version: 4, montant_avoir: '150.00', montant_net: '1350.00',
    montant_restant: '-150.00', statut_paiement: 'surpaye',
    avoirs_livraison_differee: [{
      id_avoir: 'test-credit', date_effet: '2026-11-11',
      quantite_annulee: 100, montant_avoir: '150.00', avoir_cumule: '150.00',
    }],
  };
  get.mockImplementation(async path => {
    if (path === '/transactions/7') return cancelled ? updated : initial;
    if (path === '/paiements/transaction/7/statut') return cancelled ? updated : initial;
    if (path === '/transactions/7/cancel-remainder/preview') return {
      id_transaction: 7, expected_version: 3, quantite_en_attente_attendue: 100,
      quantite_couverte: 900, quantite_annulee: 100, quantite_annulee_cumulee: 100,
      date_effet: '2026-11-11', montant_initial: '1500.00',
      montant_avoir: '150.00', montant_avoirs_cumule: '150.00',
      montant_net: '1350.00', montant_paye: '1500.00',
      montant_restant: '-150.00', credit_client: '150.00',
    };
    if (path === '/paiements') return [];
    if (path === '/produits') return [{ id_produit: 1, nom_produit: 'Oeufs - Moyen' }];
    if (path === '/clients') return [{ id_client: 1, nom_client: 'Client payé' }];
    if (path === '/transactions/7/completion-history') return cancelled ? [{
      id: 25, type: 'cancel_remainder', date: '2026-11-11',
      quantite: 100, montant_avoir: '150.00',
    }] : [];
    return [];
  });
  post.mockImplementation(async path => {
    if (path !== '/transactions/7/cancel-remainder') throw new Error('Unexpected mutation');
    cancelled = true;
    return {
      quantite_annulee: 100, montant_avoir: '150.00', credit_client: '150.00',
    };
  });
  render(<TransactionDetail />);
  fireEvent.click(await screen.findByRole('button', { name: 'Annuler les œufs restants' }));
  const dialog = await screen.findByRole('dialog', { name: 'Annuler les œufs restants ?' });
  await within(dialog).findByText('Œufs à annuler');
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: "Confirmer l'annulation des œufs restants" }));
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByText(/Avoir de .*150/)).toBeVisible());
  expect(await screen.findByText('Avoirs commerciaux')).toBeVisible();
  expect(screen.getByText('Montant net')).toBeVisible();
  expect(screen.getAllByText('Crédit client').some(element => element.isConnected)).toBe(true);
  expect(screen.queryByRole('button', { name: 'Annuler les œufs restants' })).not.toBeInTheDocument();
});
