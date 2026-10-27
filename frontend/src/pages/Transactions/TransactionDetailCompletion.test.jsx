import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TransactionDetail from './TransactionDetail';
import { get } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '7' }), useLocation: () => ({ search: '' }), useNavigate: () => vi.fn() }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../components/PaiementForm', () => ({ default: () => null }));
vi.mock('../../components/PaiementForm/MultiPaiementForm', () => ({ default: () => null }));
const sale = {
  id_transaction: 7, id_client: 1, id_produit: 1, id_batiment: 1,
  est_actif: true, est_promesse: true, allocation_automatique: true,
  quantite_reservee: 300, quantite: 1000, quantite_couverte: 900, quantite_completee: 600, quantite_en_attente: 400,
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
afterEach(cleanup);

it('shows reserved stock on a paid deferred sale without presenting it as delivered', async () => {
  render(<TransactionDetail />);
  expect(await screen.findByRole('heading', { name: 'Vente #7' })).toBeVisible();
  expect(screen.getByText('Client payé · Vendue le 25/10/26')).toBeVisible();
  expect(screen.getByText('Complété')).toBeVisible();
  expect(screen.getByText('600 / 1 000 œufs')).toBeVisible();
  expect(screen.getByText('300 prêts à compléter')).toBeVisible();
  expect(screen.getByText('100 à produire')).toBeVisible();
  expect(screen.queryByText('Stock partiellement réservé')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Historique des réservations/i })).toBeVisible();
  expect(screen.getByRole('button', { name: /Compléter \(300 disponibles\)/i })).toBeVisible();
  expect(screen.queryByRole('dialog', { name: /Compléter la livraison/i })).not.toBeInTheDocument();
});
