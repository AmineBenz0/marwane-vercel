import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionDetail from './TransactionDetail';
import { get, post } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '7' }), useNavigate: () => vi.fn() }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../components/PaiementForm', () => ({ default: () => null }));
vi.mock('../../components/PaiementForm/MultiPaiementForm', () => ({ default: () => null }));
const sale = {
  id_transaction: 7, id_client: 1, id_produit: 1, id_batiment: 1,
  est_actif: true, est_promesse: true, allocation_automatique: true,
  quantite_reservee: 100, quantite: 1000, quantite_couverte: 900, quantite_en_attente: 100,
  prix_unitaire: 1.5, montant_total: 1500, montant_paye: 1500, montant_restant: 0,
  statut_paiement: 'paye', pourcentage_paye: 100, date_transaction: '2026-10-25',
  date_livraison_prevue: '2026-10-26', repartition_stock: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async path => {
    if (path === '/transactions/7') return sale;
    if (path === '/transactions/7/completion') return {
      id_transaction: 7, quantite_couverte: 900, quantite_en_attente: 100, quantite_proposee: 100,
      empreinte_stock: 'a'.repeat(64), repartition_stock: [{ id_production: 12, date_production: '2026-10-26', quantite: 100 }],
    };
    if (path === '/paiements/transaction/7/statut') return sale;
    if (path === '/produits') return [{ id_produit: 1, nom_produit: 'Oeufs - Moyen' }];
    if (path === '/clients') return [{ id_client: 1, nom_client: 'Client payé' }];
    if (path === '/paiements') return [{ id_paiement: 15, id_transaction: 7, date_paiement: '2026-10-25', montant: 1500, type_paiement: 'cash', statut: 'valide' }];
    return [];
  });
});
afterEach(cleanup);

describe('completion from transaction details', () => {
  it('closes a paid deferred sale and preserves the displayed payment', async () => {
    post.mockResolvedValue({ ...sale, quantite_couverte: 1000, quantite_en_attente: 0 });
    render(<TransactionDetail />);
    fireEvent.click(await screen.findByRole('button', { name: 'Compléter 100 œufs' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer 100 œufs' }));
    expect(await screen.findByText('Stock complet')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Compléter 100 œufs' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Compléter la vente #7' })).not.toBeInTheDocument());
    expect(post).toHaveBeenCalledExactlyOnceWith('/transactions/7/completion', {
      quantite: 100, quantite_couverte_attendue: 900, empreinte_stock: 'a'.repeat(64),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Détail des règlements' }));
    await waitFor(() => expect(screen.getByText('Espèces')).toBeVisible());
  });
});
