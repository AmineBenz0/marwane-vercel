import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionDashboard from './ProductionDashboard';
import { localToday } from './useProductionView';
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
  batiments: [{ id_batiment: 7, nom_batiment: 'Batiment 7', est_actif: true, available_eggs: 125 }],
  categories: [{ type_oeuf: 'normal', calibre: 'gros', label: 'Normal - Gros', available_eggs: 120 }],
};
const mockData = (dailyData = daily) => get.mockImplementation((path) => {
  if (path === '/productions/stock/daily') return Promise.resolve(dailyData);
  if (path === '/productions/stock') return Promise.resolve(stock);
  if (path === '/batiments') return Promise.resolve([{ id_batiment: 7, nom: 'Batiment 7' }]);
  return Promise.resolve([]);
});
describe('ProductionDashboard single page', () => {
  beforeEach(() => { vi.clearAllMocks(); mockData(); });
  it('shows current stock, type breakdown and daily activity together without tabs', async () => {
    renderPage();
    expect(await screen.findByText('Stock global disponible actuellement')).toBeVisible();
    expect(await screen.findByText('Non saisie')).toBeVisible();
    expect(screen.getAllByText('120 œufs')).toHaveLength(2);
    expect(screen.getByText('125 œufs')).toBeVisible();
    expect(screen.getByText('Normal - Gros')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Production du jour' })).toBeVisible();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('5 œufs vendus sans bâtiment source');
  });
  it('keeps current stock on today and preserves only the daily date in building links', async () => {
    renderPage('/production?view=stocks&date=2026-10-05');
    await screen.findByText('Non saisie');
    expect(get).toHaveBeenCalledWith('/productions/stock', { params: { date_stock: localToday() } });
    expect(get).toHaveBeenCalledWith('/productions/stock/daily', { params: { date_stock: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Voir le bâtiment' }));
    expect(navigate).toHaveBeenCalledWith('/production/batiment/7?date=2026-10-05');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
  it('uses daily collection counts alongside current inventory and excludes broken types', async () => {
    mockData({ ...daily, totals: { ...daily.totals, produced_eggs: 30, missing_buildings_count: 0 }, batiments: [{
      ...daily.batiments[0], entries_count: 1, produced_eggs: 30,
      categories: [{ type_oeuf: 'normal', label: 'Normaux', produced_eggs: 30 }, { type_oeuf: 'casse', label: 'Broken category', produced_eggs: 8 }],
    }] });
    renderPage();
    await screen.findByText('Normaux');
    expect(screen.getByText('Normaux : 30')).toBeVisible();
    expect(screen.getByText('Normal - Gros')).toBeVisible();
    expect(screen.getAllByText('30 œufs')).toHaveLength(3);
    expect(screen.queryByText('Broken category')).not.toBeInTheDocument();
  });
  it('keeps current stock visible during date changes and ignores late daily responses', async () => {
    const pending = {};
    get.mockImplementation((path, options) => {
      if (path === '/productions/stock') return Promise.resolve(stock);
      if (path === '/batiments') return Promise.resolve([{ id_batiment: 7, nom: 'Batiment 7' }]);
      const date = options?.params?.date_stock;
      if (date === '2026-10-05') return Promise.resolve(daily);
      return new Promise((resolve) => { pending[date] = resolve; });
    });
    renderPage('/production?date=2026-10-05');
    await screen.findByText('Non saisie');
    fireEvent.change(screen.getByRole('textbox', { name: 'Date' }), { target: { value: '06/10/26' } });
    expect(screen.getByText('Stock global disponible actuellement')).toBeVisible();
    expect(screen.queryByText('Non saisie')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Date' }), { target: { value: '07/10/26' } });
    await waitFor(() => expect(pending['2026-10-07']).toBeDefined());
    await act(async () => pending['2026-10-07']({ ...daily, totals: { ...daily.totals, produced_eggs: 300 } }));
    expect(await screen.findByText('300 œufs')).toBeVisible();
    await act(async () => pending['2026-10-06']({ ...daily, totals: { ...daily.totals, produced_eggs: 999 } }));
    expect(screen.queryByText('999 œufs')).not.toBeInTheDocument();
    expect(screen.getAllByText('120 œufs')).toHaveLength(2);
    expect(get.mock.calls.filter(([path]) => path === '/productions/stock')).toHaveLength(1);
  });
  it('keeps production entry available for the selected day', async () => {
    renderPage('/production?date=2026-10-05');
    fireEvent.click(await screen.findByRole('button', { name: 'Saisir' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText('Saisir la production du jour')).toBeVisible();
  });
  it('isolates stock failures from daily figures and retries stock without changing the day', async () => {
    get.mockImplementation((path) => path === '/productions/stock' ? Promise.reject(new Error('Stock indisponible')) :
      Promise.resolve(path === '/productions/stock/daily' ? daily : [{ id_batiment: 7, nom: 'Batiment 7' }]));
    renderPage('/production?date=2026-10-05');
    expect(await screen.findByRole('alert')).toHaveTextContent('Stock indisponible');
    expect(await screen.findByText('Non saisie')).toBeVisible();
    expect(screen.queryByText('Stock global disponible actuellement')).not.toBeInTheDocument();
    mockData();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer le stock' }));
    expect(await screen.findByText('Stock global disponible actuellement')).toBeVisible();
  });
  it('retains stock when daily data fails and retries only the daily request', async () => {
    get.mockImplementation((path) => path === '/productions/stock/daily' ? Promise.reject(new Error('Journée indisponible')) :
      Promise.resolve(path === '/productions/stock' ? stock : [{ id_batiment: 7, nom: 'Batiment 7' }]));
    renderPage('/production?date=2026-10-05');
    await screen.findByText('Journée indisponible');
    expect(within(screen.getByRole('region', { name: 'Stock actuel' })).getByText('Stock global disponible actuellement')).toBeVisible();
    mockData();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la journée' }));
    expect(await screen.findByText('Non saisie')).toBeVisible();
    expect(get.mock.calls.filter(([path]) => path === '/productions/stock')).toHaveLength(1);
  });
});
