import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatimentProductionPage from './BatimentProductionPage';
import { get } from '../../services/api';

vi.mock('../../services/api', () => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ id: '7' }), useNavigate: () => vi.fn() };
});

describe('BatimentProductionPage cumulative stock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((path) => {
      if (path === '/batiments') return Promise.resolve([{ id_batiment: 7, nom: 'Batiment 7' }]);
      if (path === '/productions/stock/daily') return Promise.resolve({
        batiments: [{
          id_batiment: 7, produced_eggs: 0, sold_eggs: 0, lost_eggs: 0,
          available_eggs: 0, mortalite: 0, consommation_aliment_kg: 2,
          entries_count: 0, categories: [],
        }], movements: [],
      });
      if (path === '/productions/stock') return Promise.resolve({
        batiments: [{
          id_batiment: 7, available_eggs: 125, mortalite: 9,
          consommation_aliment_kg: 99, categories: [
            { type_oeuf: 'normal', calibre: 'gros', label: 'Normal - Gros',
              produced_eggs: 200, sold_eggs: 75, available_eggs: 125 },
            { type_oeuf: 'casse', label: 'Oeufs casses',
              produced_eggs: 0, sold_eggs: 0, lost_eggs: 5, available_eggs: 0 },
          ],
        }],
      });
      return Promise.resolve([]);
    });
  });

  it('uses cumulative stock while keeping the daily entry and operational figures', async () => {
    render(<BatimentProductionPage />);
    expect(await screen.findByText('Stock cumulé disponible')).toBeVisible();
    expect(screen.getByText('125 oeufs')).toBeVisible();
    expect(screen.getByText('Disponible : 125')).toBeVisible();
    expect(screen.getByText('2,00 kg')).toBeVisible();
    expect(screen.getByText('Production non saisie')).toBeVisible();
    expect(screen.queryByText('Oeufs casses')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mortalite declaree|Mortalite elevee/)).not.toBeInTheDocument();
  });
});
