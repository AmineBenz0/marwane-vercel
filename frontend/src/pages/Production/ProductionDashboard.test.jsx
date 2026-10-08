import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionDashboard from './ProductionDashboard';
import { get } from '../../services/api';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
const renderPage = (url = '/production') => render(<MemoryRouter initialEntries={[url]}><ProductionDashboard /></MemoryRouter>);

const daily = {
  totals: { buildings_count: 1, missing_buildings_count: 1, produced_eggs: 0, sold_eggs: 0, lost_eggs: 0 },
  batiments: [{ id_batiment: 7, nom_batiment: 'Batiment 7', status: 'missing', entries_count: 0, categories: [] }],
  movements: [],
};
const stock = {
  totals: { available_eggs: 120, unassigned_sold_eggs: 5 },
  batiments: [{ id_batiment: 7, nom_batiment: 'Batiment 7', est_actif: true, status: 'low', entries_count: 2, available_eggs: 125 }],
  categories: [{ type_oeuf: 'normal', calibre: 'gros', label: 'Normal - Gros', produced_eggs: 200, sold_eggs: 80, available_eggs: 120 }],
};
const mockData = (dailyData = daily) => get.mockImplementation((path) => {
  if (path === '/productions/stock/daily') return Promise.resolve(dailyData);
  if (path === '/productions/stock') return Promise.resolve(stock);
  if (path === '/batiments') return Promise.resolve([{ id_batiment: 7, nom: 'Batiment 7' }]);
  return Promise.resolve([]);
});

describe('ProductionDashboard views', () => {
  beforeEach(() => { vi.clearAllMocks(); mockData(); });

  it('defaults to daily activity and retains carried stock without a daily entry', async () => {
    renderPage();
    expect(await screen.findByText('Stock global disponible')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Journée' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('120 œufs')).toBeVisible();
    expect(screen.getByText('Non saisie')).toBeVisible();
    expect(screen.getByText('Stock disponible : 125 œufs')).toBeVisible();
    expect(screen.queryByText('Répartition du stock par type')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('5 œufs vendus sans bâtiment source');
  });

  it('shows cumulative categories only in Stocks and preserves the date when opening a building', async () => {
    renderPage('/production?date=2026-10-05');
    await screen.findByText('Stock global disponible');
    fireEvent.click(screen.getByRole('tab', { name: 'Stocks' }));
    expect(await screen.findByText('Répartition du stock par type')).toBeVisible();
    expect(screen.getByText('Stock au 05/10/26')).toBeVisible();
    expect(screen.getByText('125 œufs')).toBeVisible();
    expect(screen.getByText('Normal - Gros')).toBeVisible();
    expect(screen.queryByText('Production du jour')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voir le batiment' }));
    expect(navigate).toHaveBeenCalledWith('/production/batiment/7?view=stocks&date=2026-10-05');
    expect(get).toHaveBeenCalledWith('/productions/stock', { params: { date_stock: '2026-10-05' } });
  });

  it('uses daily collection counts rather than cumulative counts in Journée', async () => {
    mockData({ ...daily, totals: { ...daily.totals, produced_eggs: 30, missing_buildings_count: 0 }, batiments: [{
      ...daily.batiments[0], entries_count: 1, produced_eggs: 30,
      categories: [{ type_oeuf: 'normal', label: 'Normaux', produced_eggs: 30 }, { type_oeuf: 'casse', label: 'Cassés', produced_eggs: 8 }],
    }] });
    renderPage();
    expect(await screen.findByText('Collecte du jour par type')).toBeVisible();
    expect(screen.getByText('Normaux')).toBeVisible();
    expect(screen.getAllByText('30 œufs')).toHaveLength(3);
    expect(screen.queryByText('Normal - Gros')).not.toBeInTheDocument();
    expect(screen.queryByText('Cassés')).not.toBeInTheDocument();
  });

  it('hides the previous stock while loading another date and ignores late responses', async () => {
    const pending = {};
    get.mockImplementation((path, options) => {
      if (path === '/batiments') return Promise.resolve([{ id_batiment: 7, nom: 'Batiment 7' }]);
      const date = options?.params?.date_stock;
      if (date === '2026-10-05') return Promise.resolve(path === '/productions/stock' ? stock : daily);
      return new Promise((resolve) => { pending[date + path] = resolve; });
    });
    renderPage('/production?date=2026-10-05');
    await screen.findByText('Stock global disponible');
    fireEvent.change(screen.getByRole('textbox', { name: 'Date' }), { target: { value: '06/10/26' } });
    expect(screen.queryByText('Stock global disponible')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Date' }), { target: { value: '07/10/26' } });
    await waitFor(() => expect(pending['2026-10-07/productions/stock']).toBeDefined());
    pending['2026-10-07/productions/stock/daily'](daily);
    pending['2026-10-07/productions/stock']({ ...stock, totals: { available_eggs: 300 } });
    expect(await screen.findByText('300 œufs')).toBeVisible();
    pending['2026-10-06/productions/stock/daily'](daily);
    pending['2026-10-06/productions/stock']({ ...stock, totals: { available_eggs: 999 } });
    await waitFor(() => expect(screen.getByText('Stock au 07/10/26')).toBeVisible());
    expect(screen.queryByText('999 œufs')).not.toBeInTheDocument();
    expect(screen.getByText('300 œufs')).toBeVisible();
  });

  it('keeps daily production entry available', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saisir' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Saisir' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText('Saisir la production du jour')).toBeVisible();
  });

  it('shows a retryable error instead of a zero stock when loading fails', async () => {
    get.mockRejectedValue(new Error('Stock indisponible'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Stock indisponible');
    expect(screen.queryByText('Stock global disponible')).not.toBeInTheDocument();
    mockData();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Stock global disponible')).toBeVisible();
  });
});
