import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MonthlyReportPage from './MonthlyReportPage';
import { get } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';

vi.mock('../../services/api', () => ({ get: vi.fn() }));
vi.mock('../../utils/exportToExcel', () => ({ exportToExcelAdvanced: vi.fn() }));
vi.mock('../../utils/exportToPDF', () => ({ exportToPDF: vi.fn() }));

describe('MonthlyReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      month: '2026-09',
      date_debut: '2026-09-01', date_fin: '2026-09-30', date_soldes_actuels: '2026-10-25',
      creances_actuelles: '20.00', dettes_actuelles: '5.00',
      ventes: '100.00',
      achats: '40.00',
      charges: '10.00',
      creances: '25.00',
      dettes: '15.00',
      caisse_entrees: '80.00',
      caisse_sorties: '30.00',
      solde_caisse: '250.00',
      banques_entrees: '20.00',
      banques_sorties: '5.00',
      soldes_bancaires: [{ id_compte: 1, nom_banque: 'Banque Test', numero_compte: '123', solde: '500.00' }],
      inventory_movements: 3,
      inventory_quantity_delta: '7.500',
      top_clients: [],
      top_fournisseurs: [],
      top_produits: [],
    });
    exportToExcelAdvanced.mockResolvedValue(undefined);
  });

  it('renders stock movement counts correctly and exports the full summary', async () => {
    render(<MonthlyReportPage />);

    expect(await screen.findByRole('heading', { name: 'Rapport mensuel' })).toBeVisible();
    expect(screen.getAllByText('Ventes', { exact: true })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Stock du mois' }));
    expect(await screen.findByText('3', { exact: true })).toBeVisible();
    expect(screen.getByText(/Variation nette stock/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(exportToExcelAdvanced).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ indicateur: 'Entrées banques' }),
        expect.objectContaining({ indicateur: 'Solde Banque Test actuel au 25/10/26' }),
        expect.objectContaining({ indicateur: 'Mouvements stock', valeur: '3' }),
        expect.objectContaining({ indicateur: 'Variation nette stock' }),
      ]),
      expect.any(Array),
      'rapport_mensuel_2026-09',
      'Synthèse',
    ));
  });
});

it('keeps current balances separate from month-end amounts and explains accounting only on demand', async () => {
  render(<MonthlyReportPage />);
  const current = await screen.findByRole('region', { name: 'Situation actuelle' });
  expect(within(current).getByText('Au 25/10/26')).toBeVisible();
  expect(within(current).getByText(/20,00/)).toBeVisible();
  const deferredSaleExplanation = /Le stock disponible est réservé automatiquement/;
  expect(screen.getByText(deferredSaleExplanation)).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Calcul des livraisons différées' }));
  expect(await screen.findByText(deferredSaleExplanation)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Situation à la fin du mois · Au 30/09/26' }));
  expect(await screen.findByText(/25,00/)).toBeVisible();
  expect(screen.getAllByText('Ventes', { exact: true })).toHaveLength(1);
});
