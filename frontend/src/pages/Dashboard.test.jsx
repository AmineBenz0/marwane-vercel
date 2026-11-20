import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { get } from '../services/api';
import Dashboard from './Dashboard';

vi.mock('../services/api', () => ({ get: vi.fn() }));
vi.mock('../utils/businessDate', () => ({ getBusinessDateInput: () => '2026-11-16' }));
vi.mock('./Transactions/DeferredSalesCard', () => ({ default: () => null }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => children,
  BarChart: ({ data }) => <output data-testid="weekly-series">{JSON.stringify(data)}</output>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

const sale = { id_client: 1, id_fournisseur: null, montant_total: '12.00', montant_net: '10.00' };

const mockApi = ({ transactionsFirstPage, transactionsSecondPage = [], productions = [], solde = {}, report = {} }) => {
  get.mockImplementation(async (path, { params } = {}) => {
    switch (path) {
      case '/caisse/solde/complet':
        return { solde_reel: 42, creances_clients: '150.50', dettes_fournisseurs: '80', ...solde };
      case '/productions':
        return productions;
      case '/reports/monthly':
        return { ventes_nettes: '321.45', ventes: '987.65', achats: '67.89', ...report };
      case '/clients':
        return [{ id_client: 1, nom_client: 'Ferme Benali' }];
      case '/fournisseurs':
        return [{ id_fournisseur: 2, nom_fournisseur: 'Aliments Souss' }];
      case '/transactions':
        if (params.skip === 0) return transactionsFirstPage;
        if (params.skip === 1000) return transactionsSecondPage;
        break;
    }
    throw new Error(`Unexpected API request for ${path}`);
  });
};

it('pages through transactions, shows money owed and groups sales and purchases by week', async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    ...sale,
    id_transaction: 2000 - index,
    date_transaction: '2026-11-16',
  }));
  mockApi({
    transactionsFirstPage: firstPage,
    transactionsSecondPage: [
      { ...sale, id_transaction: 3, date_transaction: '2026-11-02', montant_net: '23.50' },
      { id_transaction: 2, id_client: null, id_fournisseur: 2, date_transaction: '2026-10-20', montant_total: '5.00', montant_net: '5.00' },
    ],
  });

  render(<MemoryRouter><Dashboard /></MemoryRouter>);

  expect(await screen.findByText('321,45 MAD')).toBeVisible(); // Ventes du mois from the monthly report
  expect(screen.getByText('150,5 MAD')).toBeVisible(); // À encaisser
  expect(screen.getByText('80 MAD')).toBeVisible(); // À payer
  for (const skip of [0, 1000]) {
    expect(get).toHaveBeenCalledWith('/transactions', {
      params: { date_debut: '2026-10-19', date_fin: '2026-11-16', est_actif: true, limit: 1000, skip },
    });
  }
  const weeks = JSON.parse(screen.getByTestId('weekly-series').textContent);
  expect(weeks).toHaveLength(5);
  expect(weeks.map((week) => week.weekKey)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  expect(weeks[0]).toMatchObject({ ventes: 0, achats: 5 }); // purchase on 20/10
  expect(weeks[2]).toMatchObject({ ventes: 23.5, achats: 0 }); // net sale on 02/11
  expect(weeks[4]).toMatchObject({ ventes: 10000, achats: 0 }); // 1,000 sales of 10 MAD on 16/11

  // Recent operations show names, not numbers.
  const recent = screen.getByText('Dernières opérations').closest('.MuiCard-root');
  expect(within(recent).getAllByText('Ferme Benali').length).toBeGreaterThan(0);
});

it('asks to enter production when nothing was collected today, and flags a negative cash balance', async () => {
  mockApi({ transactionsFirstPage: [], solde: { solde_reel: -12 } });

  render(<MemoryRouter><Dashboard /></MemoryRouter>);

  expect(await screen.findByRole('button', { name: 'Saisir la production' })).toBeVisible();
  expect(screen.getByText('Aucune collecte saisie aujourd’hui.')).toBeVisible();
  expect(screen.getByText('Solde de caisse négatif')).toBeVisible();
  expect(screen.getByText('Aucune opération ces dernières semaines.')).toBeVisible();
});

it('offers to view production once it has been entered', async () => {
  mockApi({ transactionsFirstPage: [], productions: [{ nombre_oeufs: 1200, nombre_cartons: 40 }] });

  render(<MemoryRouter><Dashboard /></MemoryRouter>);

  expect(await screen.findByRole('button', { name: 'Voir la production' })).toBeVisible();
  expect(screen.getByText('1 200')).toBeVisible();
  expect(screen.getByText('Rien d’urgent pour le moment.')).toBeVisible();
});
