import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionDashboard from './ProductionDashboard';
import { get } from '../../services/api';

vi.mock('../../services/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

describe('ProductionDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((path) => {
      if (path === '/productions/stock/daily') {
        return Promise.resolve({
          totals: {
            buildings_count: 1,
            missing_buildings_count: 1,
            produced_eggs: 0,
            available_eggs: 0,
            sold_eggs: 0,
            lost_eggs: 0,
          },
          batiments: [{
            id_batiment: 7,
            nom_batiment: 'Batiment 7',
            status: 'missing',
            entries_count: 0,
            categories: [],
          }],
          movements: [],
        });
      }
      if (path === '/productions/stock') {
        return Promise.resolve({
          totals: { available_eggs: 120, unassigned_sold_eggs: 5 },
          batiments: [{
            id_batiment: 7, nom_batiment: 'Batiment 7', est_actif: true,
            status: 'low', entries_count: 2, available_eggs: 125,
          }],
          categories: [{
            type_oeuf: 'normal', calibre: 'gros', label: 'Normal - Gros',
            produced_eggs: 200, sold_eggs: 80, available_eggs: 120,
          }],
        });
      }
      if (path === '/batiments') return Promise.resolve([{ id_batiment: 7, nom: 'Batiment 7' }]);
      if (path === '/productions/formules') return Promise.resolve([]);
      if (path === '/productions/calibre-thresholds') return Promise.resolve([]);
      return Promise.resolve([]);
    });
  });

  it('shows carried global and building stock even without production that day', async () => {
    render(<ProductionDashboard />);
    expect(await screen.findByText('Stock global cumulé')).toBeVisible();
    expect(screen.getAllByText('120 oeufs')).toHaveLength(2);
    expect(screen.getByText('125 oeufs')).toBeVisible();
    expect(screen.getByText('Aucune saisie pour le jour choisi')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('5 oeufs vendus sans bâtiment source');
    expect(get).toHaveBeenCalledWith('/productions/stock', {
      params: { date_stock: new Date().toISOString().split('T')[0] },
    });
  });

  it('keeps production entry available when no lot is present', async () => {
    render(<ProductionDashboard />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Saisir' })).toBeInTheDocument());
    expect(screen.queryByText(/Lot actuel|Lot requis|Commencer le lot/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Saisir' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText('Saisir la production du jour')).toBeVisible();
  });
});
