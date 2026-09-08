import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductBomsPage from './ProductBomsPage';
import { get, post } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));

describe('ProductBomsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((path) => {
      if (path === '/produits') {
        return Promise.resolve([
          { id_produit: 1, nom_produit: 'Farine', type_produit: 'matiere_premiere' },
          { id_produit: 2, nom_produit: 'Pain', type_produit: 'produit_fini' },
        ]);
      }
      if (path === '/product-boms') {
        return Promise.resolve([{ id_nomenclature: 7, id_produit_sortie: 2, produit_sortie_nom: 'Pain', version: 1 }]);
      }
      if (path === '/stock') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    post.mockResolvedValue({ stock_suffisant: true, cout_total: '10.00', lignes_entree: [] });
  });

  it('previews BOM requirements before executing a transformation', async () => {
    render(<ProductBomsPage />);
    expect(await screen.findByRole('heading', { name: 'BOM & transformations' })).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'BOM actif' }));
    fireEvent.click(await screen.findByRole('option', { name: /Pain · v1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser les besoins' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/transformations/preview', expect.objectContaining({ id_nomenclature: 7 })));
    expect(await screen.findByText(/Stock disponible pour cette production/)).toBeVisible();
  });
});
