import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TransactionDetail from './TransactionDetail';
import { get } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '7' }), useNavigate: () => vi.fn() }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../components/PaiementForm', () => ({ default: () => null }));
vi.mock('../../components/PaiementForm/MultiPaiementForm', () => ({ default: () => null }));
const sale = {
  id_transaction: 7, id_client: 1, id_produit: 1, id_batiment: 1,
  est_actif: true, est_promesse: true, allocation_automatique: true,
  quantite_reservee: 900, quantite: 1000, quantite_couverte: 900, quantite_en_attente: 100,
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
  expect(await screen.findByText('Stock partiellement réservé')).toBeVisible();
  expect(screen.getByText('900 / 1 000 œufs')).toBeVisible();
  expect(screen.getByText('100 œufs à produire')).toBeVisible();
  expect(screen.queryByRole('button', { name: /compléter/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: /compléter/i })).not.toBeInTheDocument();
});
