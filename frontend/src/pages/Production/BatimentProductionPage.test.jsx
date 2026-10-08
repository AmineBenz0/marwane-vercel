import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatimentProductionPage from './BatimentProductionPage';
import { localToday } from './useProductionView';
import { get } from '../../services/api';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ id: '7' }), useNavigate: () => navigate };
});
const renderPage = (url = '/production/batiment/7?date=2026-10-05') => render(<MemoryRouter initialEntries={[url]}><BatimentProductionPage /></MemoryRouter>);
const stock = {
  totals: { unassigned_sold_eggs: 0 },
  batiments: [{ id_batiment: 7, available_eggs: 125, mortalite: 9, consommation_aliment_kg: 99, categories: [
    { type_oeuf: 'normal', calibre: 'gros', label: 'Normal - Gros', produced_eggs: 200, sold_eggs: 75, available_eggs: 125 },
    { type_oeuf: 'casse', label: 'Oeufs casses', lost_eggs: 5, available_eggs: 0 },
  ] }],
};
const daily = {
  batiments: [{ id_batiment: 7, produced_eggs: 0, sold_eggs: 0, lost_eggs: 0, mortalite: 0, consommation_aliment_kg: 2, entries_count: 0, categories: [] }],
  movements: [],
};
const mockData = ({ dayData = daily, rows = [], stockData = stock } = {}) => get.mockImplementation((path) => {
  if (path === '/batiments') return Promise.resolve([{ id_batiment: 7, nom: 'Batiment 7' }]);
  if (path === '/productions/stock/daily') return Promise.resolve(dayData);
  if (path === '/productions/stock') return Promise.resolve(stockData);
  if (path === '/productions') return Promise.resolve(rows);
  return Promise.resolve([]);
});

describe('Building production views', () => {
  beforeEach(() => { vi.clearAllMocks(); mockData(); });

  it('shows carried stock and daily details together, with no tabs', async () => {
    renderPage();
    expect(await screen.findByText('Stock disponible maintenant')).toBeVisible();
    expect(await screen.findByText('Production non saisie')).toBeVisible();
    expect(screen.getAllByText('125 œufs')).toHaveLength(2);
    expect(screen.getByText(/Normal - Gros :/)).toBeVisible();
    expect(screen.getByText('Aliment consommé')).toBeVisible();
    expect(screen.getByText('Historique des saisies')).toBeVisible();
    expect(screen.queryByText('Oeufs casses')).not.toBeInTheDocument();
    expect(screen.queryByText('99,00 kg')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
  it('accepts legacy links and preserves the daily date without applying it to stock', async () => {
    renderPage('/production/batiment/7?view=stocks&date=2026-10-05');
    await screen.findByText('Production non saisie');
    expect(screen.getByText('Stock disponible maintenant')).toBeVisible();
    expect(get).toHaveBeenCalledWith('/productions/stock', { params: { date_stock: localToday() } });
    expect(get).toHaveBeenCalledWith('/productions/stock/daily', { params: { date_stock: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vue globale' }));
    expect(navigate).toHaveBeenCalledWith('/production?date=2026-10-05');
  });
  it('retains shared grammage, feed, mortality, cartons, type counts and history in Journée', async () => {
    const rows = [
      { id_production: 1, id_batiment: 7, date_production: '2026-10-05', type_oeuf: 'normal', nombre_oeufs: 100, grammage: 62, nombre_cartons: 1, mortalite: 2, consommation_aliment_kg: 3 },
      { id_production: 2, id_batiment: 7, date_production: '2026-10-05', type_oeuf: 'double_jaune', nombre_oeufs: 20, grammage: 62, nombre_cartons: 0 },
      { id_production: 3, id_batiment: 7, date_production: '2026-10-05', type_oeuf: 'casse', nombre_oeufs: 5, grammage: 99, nombre_cartons: 0 },
      { id_production: 4, id_batiment: 7, date_production: '2026-10-06', type_oeuf: 'blanc', nombre_oeufs: 999, grammage: 60 },
    ];
    mockData({ rows, dayData: { ...daily, batiments: [{ ...daily.batiments[0], produced_eggs: 120, lost_eggs: 5, mortalite: 2, consommation_aliment_kg: 3, entries_count: 3 }] } });
    renderPage();
    expect((await screen.findAllByText('120 œufs'))[0]).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Journée sélectionnée' })).getByText('62,0 g')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Journée sélectionnée' })).getByText('3,00 kg')).toBeVisible();
    expect(screen.getByText('5 œufs')).toBeVisible();
    expect(screen.getAllByText('Normaux : 100')).toHaveLength(2);
    expect(screen.getAllByText('Doubles jaunes : 20')).toHaveLength(2);
    expect(within(screen.getByRole('table', { name: 'Saisies quotidiennes' })).getByText('5', { selector: 'td' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier la saisie' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier la journée du 05/10/26' })).toBeVisible();
    expect(screen.queryByText('999 œufs collectés')).not.toBeInTheDocument();
  });

  it('scopes daily activity to the building and displays broken eggs separately from stock', async () => {
    mockData({ dayData: { ...daily, movements: [
      { type: 'sale', id_batiment: 7, label: 'Vente bâtiment 7', quantity: -20 },
      { type: 'sale', id_batiment: 8, label: 'Vente autre bâtiment', quantity: -99 },
      { type: 'loss', id_batiment: 7, label: 'Œufs cassés', quantity: -5 },
    ] } });
    renderPage('/production/batiment/7?view=stocks&date=2026-10-05');
    expect(await screen.findByText('Activité de la journée')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Activité de la journée' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Activité de la journée' }));
    expect(screen.getByText('Vente bâtiment 7')).toBeVisible();
    expect(screen.queryByText('Vente autre bâtiment')).not.toBeInTheDocument();
    expect(screen.getByText('Œufs cassés')).toBeVisible();
    expect(screen.queryByText('Oeufs casses')).not.toBeInTheDocument();
  });

  it('warns when unassigned sales make the building stock uncertain', async () => {
    mockData({ stockData: { ...stock, totals: { unassigned_sold_eggs: 10 } } });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('le stock de ce bâtiment peut être surestimé');
  });
  it('keeps current stock visible while loading another daily date', async () => {
    mockData();
    renderPage();
    await screen.findByText('Production non saisie');
    const defaultMock = get.getMockImplementation();
    get.mockImplementation((path, options) => path === '/productions/stock/daily' && options?.params?.date_stock === '2026-10-06'
      ? new Promise(() => {}) : defaultMock(path, options));
    fireEvent.change(screen.getByRole('textbox', { name: 'Date' }), { target: { value: '06/10/26' } });
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Chargement de la journée' })).toBeVisible());
    expect(screen.getByText('Stock disponible maintenant')).toBeVisible();
    expect(screen.queryByText('Production non saisie')).not.toBeInTheDocument();
    expect(get.mock.calls.filter(([path]) => path === '/productions/stock')).toHaveLength(1);
  });
  it('retains inventory when daily loading fails', async () => {
    mockData();
    const defaultMock = get.getMockImplementation();
    get.mockImplementation((path, options) => path === '/productions/stock/daily'
      ? Promise.reject(new Error('Journée indisponible')) : defaultMock(path, options));
    renderPage();
    expect(await screen.findByText('Journée indisponible')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Stock actuel' })).getByText('Stock disponible maintenant')).toBeVisible();
    mockData();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la journée' }));
    expect(await screen.findByText('Production non saisie')).toBeVisible();
  });

  it('paginates every recorded day instead of truncating history', async () => {
    mockData({ rows: Array.from({ length: 7 }, (_, index) => ({
      id_production: index + 1, id_batiment: 7, date_production: '2026-09-' + String(20 + index).padStart(2, '0'),
      type_oeuf: 'normal', nombre_oeufs: 100 + index, grammage: 60,
    })) });
    renderPage();
    const table = await screen.findByRole('table', { name: 'Saisies quotidiennes' });
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(within(table).queryByText('20/09/26')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(within(table).getByText('20/09/26')).toBeVisible();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByRole('button', { name: 'Modifier la journée du 20/09/26' })).toBeVisible();
  });

});
