import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatimentProductionPage from './BatimentProductionPage';
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

  it('keeps daily figures separate from carried stock when the day is not entered', async () => {
    renderPage();
    expect(await screen.findByText('Stock disponible du bâtiment')).toBeVisible();
    expect(screen.getByText('125 œufs')).toBeVisible();
    expect(screen.getByText('Stock au 05/10/26')).toBeVisible();
    expect(screen.getByText('2,00 kg')).toBeVisible();
    expect(screen.getByText('Production non saisie')).toBeVisible();
    expect(screen.queryByText('Normal - Gros')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mortalite declaree|Mortalite elevee/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Stocks' }));
    expect(screen.getByText('Disponible : 125')).toBeVisible();
    expect(screen.queryByText('Oeufs casses')).not.toBeInTheDocument();
    expect(screen.queryByText('Aliment du jour')).not.toBeInTheDocument();
    expect(screen.queryByText('Historique recent')).not.toBeInTheDocument();
  });

  it('opens the Stocks tab from a link and returns to the global stock view on the same date', async () => {
    renderPage('/production/batiment/7?view=stocks&date=2026-10-05');
    expect(await screen.findByText('Répartition du stock par type')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Stocks' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Vue globale' }));
    expect(navigate).toHaveBeenCalledWith('/production?view=stocks&date=2026-10-05');
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
    expect(await screen.findByText('120 œufs produits')).toBeVisible();
    expect(screen.getByText('62,0 g')).toBeVisible();
    expect(screen.getByText('3,00 kg')).toBeVisible();
    expect(screen.getByText('5 œufs')).toBeVisible();
    expect(screen.getAllByText('Normaux : 100')).toHaveLength(2);
    expect(screen.getAllByText('Doubles jaunes : 20')).toHaveLength(2);
    expect(screen.getByText('Cassés : 5')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier la production' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier la journée du 05/10/26' })).toBeVisible();
    expect(screen.queryByText('999 œufs collectés')).not.toBeInTheDocument();
  });

  it('identifies movement scope and excludes broken eggs from stock movements', async () => {
    mockData({ dayData: { ...daily, movements: [
      { type: 'sale', id_batiment: 7, label: 'Vente bâtiment 7', quantity: -20 },
      { type: 'sale', id_batiment: 8, label: 'Vente autre bâtiment', quantity: -99 },
      { type: 'loss', id_batiment: 7, label: 'Œufs cassés', quantity: -5 },
    ] } });
    renderPage('/production/batiment/7?view=stocks&date=2026-10-05');
    expect(await screen.findByText('Mouvements du jour sélectionné')).toBeVisible();
    expect(screen.getByText('Vente bâtiment 7')).toBeVisible();
    expect(screen.queryByText('Vente autre bâtiment')).not.toBeInTheDocument();
    expect(screen.queryByText('Œufs cassés')).not.toBeInTheDocument();
  });

  it('warns when unassigned sales make the building stock uncertain', async () => {
    mockData({ stockData: { ...stock, totals: { unassigned_sold_eggs: 10 } } });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('le stock de ce bâtiment peut être surestimé');
  });
});
