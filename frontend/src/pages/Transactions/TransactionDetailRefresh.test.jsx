import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import TransactionDetail from './TransactionDetail';
import { get } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '7' }), useLocation: () => ({ search: '' }), useNavigate: () => vi.fn() }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../components/PaiementForm', () => ({ default: () => null }));
vi.mock('../../components/PaiementForm/MultiPaiementForm', () => ({ default: () => null }));
afterEach(cleanup);
it('does not overwrite a refreshed payment balance with an older pending response', async () => {
  let resolveOld;
  let calls = 0;
  const staleStatus = new Promise(resolve => { resolveOld = resolve; });
  const tx = { id_transaction: 7, id_client: 1, id_produit: 1, est_actif: true, est_promesse: false,
    date_transaction: '2026-10-25', quantite: 10, prix_unitaire: 1, montant_total: 10 };
  get.mockImplementation(async path => {
    if (path === '/transactions/7') return tx;
    if (path === '/paiements/transaction/7/statut') return ++calls === 1 ? staleStatus
      : { montant_paye: 8, montant_restant: 2, statut_paiement: 'partiel' };
    if (path === '/clients') return [{ id_client: 1, nom_client: 'Client' }];
    if (path === '/produits') return [{ id_produit: 1, nom_produit: 'Service' }];
    return [];
  });
  render(<TransactionDetail />);
  await screen.findByRole('heading', { name: 'Vente n° 7 · Client' });
  await act(async () => window.dispatchEvent(new Event('marwane:correction')));
  await screen.findByRole('heading', { name: /2,00\s+MAD/ });
  await act(async () => resolveOld({ montant_paye: 0, montant_restant: 10, statut_paiement: 'impaye' }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 5 })).toHaveTextContent(/2,00\s+MAD/));
});
