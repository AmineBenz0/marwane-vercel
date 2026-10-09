import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProduitDetail from './ProduitDetail';
import { get } from '../../services/api';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: '1' }),
}));

vi.mock('../../services/api', () => ({
  del: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../hooks/useNotification', () => ({
  default: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('ProduitDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((path) => {
      if (path === '/produits/1') {
        return Promise.resolve({
          id_produit: 1,
          nom_produit: 'Farine',
          type_produit: 'matiere_premiere',
          pour_clients: true,
          pour_fournisseurs: true,
          est_actif: true,
        });
      }
      return Promise.resolve([]);
    });
  });

  it('keeps ordinary client-enabled products in the normal catalogue workflow', async () => {
    render(<ProduitDetail />);

    expect(await screen.findByRole('button', { name: 'Modifier' })).toBeVisible();
    expect(screen.getByText('Acheté')).toBeVisible();
    expect(screen.queryByText('Matière première')).not.toBeInTheDocument();
    expect(screen.queryByText(/Les œufs sont suivis/)).not.toBeInTheDocument();
  });

  it('keeps generated egg products in the legacy production workflow', async () => {
    get.mockImplementation((path) => {
      if (path === '/produits/1') {
        return Promise.resolve({
          id_produit: 1,
          nom_produit: 'Oeufs - Moyen',
          type_produit: 'produit_fini',
          pour_clients: true,
          pour_fournisseurs: false,
          est_actif: true,
        });
      }
      return Promise.resolve([]);
    });

    render(<ProduitDetail />);

    expect(await screen.findByText(/Les œufs sont suivis/)).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument());
  });
});

it('shows sales and clients for a sold product', async () => {
  get.mockImplementation((path) => {
    if (path === '/produits/1') return Promise.resolve({
      id_produit: 1, nom_produit: 'Produit vendu', usage: 'vendu', est_actif: true,
    });
    if (path === '/clients') return Promise.resolve([{ id_client: 7, nom_client: 'Client test' }]);
    if (path === '/transactions') return Promise.resolve([{
      id_produit: 1, id_client: 7, id_fournisseur: null, quantite: 12,
      prix_unitaire: '2', montant_total: '24', date_transaction: '2026-10-09',
    }]);
    return Promise.resolve([]);
  });
  render(<ProduitDetail />);
  expect(await screen.findByText('Total vendu')).toBeVisible();
  expect(screen.getByText('Quantité vendue')).toBeVisible();
  expect(screen.getByText('Clients de ce produit')).toBeVisible();
  expect(screen.getByRole('cell', { name: 'Client test' })).toBeVisible();
  expect(screen.queryByText('Total acheté')).not.toBeInTheDocument();
});
