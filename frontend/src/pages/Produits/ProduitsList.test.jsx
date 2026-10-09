import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProduitsList from './ProduitsList';
import { get } from '../../services/api';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../utils/exportToExcel', () => ({ exportToExcelAdvanced: vi.fn() }));

describe('ProduitsList usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((path) => {
      if (path === '/produits') return Promise.resolve([
        { id_produit: 1, nom_produit: 'Produit vendu', usage: 'vendu' },
        { id_produit: 2, nom_produit: 'Produit acheté', usage: 'achete' },
      ]);
      if (path === '/clients') return Promise.resolve([{ id_client: 7, nom_client: 'Client test' }]);
      if (path === '/fournisseurs') return Promise.resolve([{ id_fournisseur: 8, nom_fournisseur: 'Fournisseur test' }]);
      if (path === '/transactions') return Promise.resolve([
        { id_produit: 1, id_client: 7, id_fournisseur: null, quantite: 12,
          prix_unitaire: '2', montant_total: '24', date_transaction: '2026-10-09' },
        { id_produit: 2, id_client: null, id_fournisseur: 8, quantite: 10,
          prix_unitaire: '3', montant_total: '30', date_transaction: '2026-10-08' },
      ]);
      return Promise.resolve([]);
    });
  });

  it('shows the right history and filters sold/bought products', async () => {
    render(<ProduitsList />);
    expect(await screen.findByText('Produit vendu')).toBeVisible();
    expect(screen.getByText('Dernier client : Client test')).toBeVisible();
    expect(screen.getByText('Dernier fournisseur : Fournisseur test')).toBeVisible();
    expect(screen.getByText('Dernière vente')).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Utilisation' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Vendus' }));
    await waitFor(() => expect(screen.queryByText('Produit acheté')).not.toBeInTheDocument());
    expect(screen.getByText('Produit vendu')).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Utilisation' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Achetés' }));
    expect(screen.getByText('Produit acheté')).toBeVisible();
    expect(screen.queryByText('Produit vendu')).not.toBeInTheDocument();
  });
});
