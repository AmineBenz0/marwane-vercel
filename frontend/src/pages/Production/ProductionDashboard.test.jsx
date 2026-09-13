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
      if (path === '/batiments') return Promise.resolve([{ id_batiment: 7, nom: 'Batiment 7' }]);
      if (path === '/productions/formules') return Promise.resolve([]);
      if (path === '/productions/calibre-thresholds') return Promise.resolve([]);
      return Promise.resolve([]);
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
