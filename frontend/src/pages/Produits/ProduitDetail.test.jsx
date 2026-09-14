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
    expect(screen.getByText('Matière première')).toBeVisible();
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
