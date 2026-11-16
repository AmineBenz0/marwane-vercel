import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { get } from '../services/api';
import Dashboard from './Dashboard';

vi.mock('../services/api', () => ({ get: vi.fn() }));
vi.mock('../utils/businessDate', () => ({ getBusinessDateInput: () => '2026-11-16' }));
vi.mock('./Transactions/DeferredSalesCard', () => ({ default: () => null }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => children,
  LineChart: ({ data }) => <output data-testid="activity-series">{JSON.stringify(data)}</output>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

it('loads both transaction ranges past 1,000 rows and uses the monthly report for money totals', async () => {
  const transaction = {
    date_transaction: '2026-11-16',
    id_client: 1,
    id_fournisseur: null,
    montant_total: '12.00',
    montant_net: '10.00',
  };
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    ...transaction,
    id_transaction: 1002 - index,
  }));
  const olderThisMonth = {
    ...transaction,
    id_transaction: 2,
    date_transaction: '2026-11-02',
    montant_net: '23.50',
  };
  const previousMonth = {
    ...transaction,
    id_transaction: 1,
    date_transaction: '2026-10-20',
    montant_net: '5.00',
  };

  get.mockImplementation(async (path, { params } = {}) => {
    switch (path) {
      case '/caisse/solde/complet':
        return { solde_reel: 42 };
      case '/productions':
        return [];
      case '/reports/monthly':
        return { ventes_nettes: '321.45', ventes: '987.65', achats: '67.89' };
      case '/transactions':
        if (params.skip === 0) return firstPage;
        if (params.skip === 1000) {
          return params.date_debut === '2026-11-01'
            ? [olderThisMonth]
            : [olderThisMonth, previousMonth];
        }
        break;
    }
    throw new Error(`Unexpected API request for ${path}`);
  });

  render(<MemoryRouter><Dashboard /></MemoryRouter>);

  expect(await screen.findByText('1 001')).toBeVisible();
  expect(screen.getByText('321,45 MAD')).toBeVisible();
  expect(screen.getByText('67,89 MAD')).toBeVisible();
  expect(get).toHaveBeenCalledWith('/reports/monthly', { params: { month: '2026-11' } });
  for (const skip of [0, 1000]) {
    expect(get).toHaveBeenCalledWith('/transactions', {
      params: { date_debut: '2026-11-01', date_fin: '2026-11-30', est_actif: true, limit: 1000, skip },
    });
    expect(get).toHaveBeenCalledWith('/transactions', {
      params: { date_debut: '2026-10-17', date_fin: '2026-11-16', est_actif: true, limit: 1000, skip },
    });
  }
  const series = JSON.parse(screen.getByTestId('activity-series').textContent);
  expect(series).toEqual(expect.arrayContaining([
    expect.objectContaining({ dateKey: '2026-11-02', count: 1, total: 23.5 }),
    expect.objectContaining({ dateKey: '2026-10-20', count: 1, total: 5 }),
  ]));
});
