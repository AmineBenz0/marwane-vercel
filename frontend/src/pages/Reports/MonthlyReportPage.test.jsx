import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MonthlyReportPage from './MonthlyReportPage';
import { get } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { exportMonthlyReportPDF } from '../../utils/exportMonthlyReportPDF';

vi.mock('../../services/api', () => ({ get: vi.fn() }));
vi.mock('../../utils/exportToExcel', () => ({ exportToExcelAdvanced: vi.fn() }));
vi.mock('../../utils/exportMonthlyReportPDF', () => ({ exportMonthlyReportPDF: vi.fn() }));

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
      solde_caisse_historique: '100.00',
      date_soldes_historiques: '2026-09-30',
      banques_entrees: '20.00',
      banques_sorties: '5.00',
      soldes_bancaires: [{ id_compte: 1, nom_banque: 'Banque Test', numero_compte: '123', solde: '500.00' }],
      soldes_bancaires_historiques: [{ id_compte: 1, nom_banque: 'Banque Test', numero_compte: '123', solde: '300.00' }],
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
    expect(screen.getAllByText('Ventes nettes', { exact: true })).toHaveLength(1);
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
      expect.arrayContaining([
        expect.objectContaining({ id: 'indicateur', excelWidth: 66 }),
        expect.objectContaining({ id: 'valeur', excelWidth: 24 }),
      ]),
      'rapport_mensuel_2026-09',
      'Synthèse',
    ));
  });

  it('exports the displayed historical and current balances with dates in Excel and PDF', async () => {
    render(<MonthlyReportPage />);
    await screen.findByRole('region', { name: 'Situation actuelle' });
    fireEvent.click(screen.getByRole('button', { name: 'Situation à la fin du mois' }));
    expect(await screen.findByText(/300,00/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    const money = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'MAD' }).format(value);
    const expected = [
      { indicateur: 'Solde caisse au 30/09/26', valeur: money(100) },
      { indicateur: 'Solde Banque Test au 30/09/26', valeur: money(300) },
      { indicateur: 'Solde caisse actuel au 25/10/26', valeur: money(250) },
      { indicateur: 'Solde Banque Test actuel au 25/10/26', valeur: money(500) },
    ];
    expect(exportToExcelAdvanced.mock.calls[0][0]).toEqual(expect.arrayContaining(expected));
    expect(exportMonthlyReportPDF).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-09', ventes: '100.00', achats: '40.00' }),
      'rapport_mensuel_2026-09',
    );
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
  fireEvent.click(screen.getByRole('button', { name: 'Situation à la fin du mois' }));
  expect(await screen.findByText(/25,00/)).toBeVisible();
  expect(screen.getAllByText('Ventes nettes', { exact: true })).toHaveLength(1);
});


it('identifies future month-end balances as projections without changing the recorded month', async () => {
  get.mockResolvedValue({
    month: '2026-11', date_debut: '2026-11-01', date_fin: '2026-11-30',
    date_soldes_historiques: '2026-11-30', date_soldes_actuels: '2026-11-06',
    ventes: '0', achats: '0', charges: '0', caisse_entrees: '0', caisse_sorties: '0',
    banques_entrees: '0', banques_sorties: '0', creances: '10', dettes: '20',
    creances_actuelles: '10', dettes_actuelles: '20',
    solde_caisse_historique: '5', solde_caisse: '5',
    soldes_bancaires: [], soldes_bancaires_historiques: [],
    inventory_movements: 0, inventory_quantity_delta: '0',
  });
  render(<MonthlyReportPage />);
  const snapshot = await screen.findByRole('button', { name: 'Projection à la fin du mois' });
  expect(snapshot).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(exportToExcelAdvanced).toHaveBeenCalled());
  const firstRow = exportToExcelAdvanced.mock.calls[0][0][0];
  expect(firstRow).toEqual({ indicateur: 'Période', valeur: '01/11/26 – 30/11/26' });
  expect(exportToExcelAdvanced.mock.calls[0][0]).toEqual(expect.arrayContaining([
    expect.objectContaining({ indicateur: 'À encaisser (projection au 30/11/26)' }),
  ]));
});

it('keeps original sales, dated avoirs, and refunds distinct across PDF and Excel', async () => {
  get.mockResolvedValue({
    month: '2026-11', date_debut: '2026-11-01', date_fin: '2026-11-30',
    date_soldes_historiques: '2026-11-30', date_soldes_actuels: '2026-11-11',
    ventes: '1500.00', avoirs_commerciaux: '600.00', ventes_nettes: '900.00',
    remboursements_clients: '600.00',
    achats: '0', charges: '0', caisse_entrees: '1500', caisse_sorties: '600',
    banques_entrees: '0', banques_sorties: '0', creances: '0', dettes: '0',
    creances_actuelles: '0', dettes_actuelles: '0',
    solde_caisse_historique: '900', solde_caisse: '900',
    soldes_bancaires: [], soldes_bancaires_historiques: [],
    inventory_movements: 0, inventory_quantity_delta: '0',
  });
  render(<MonthlyReportPage />);
  expect(await screen.findByText('Ventes nettes')).toBeVisible();
  expect(screen.getByText(/Ventes initiales.*Avoirs émis/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(exportToExcelAdvanced).toHaveBeenCalled());
  const rows = exportToExcelAdvanced.mock.calls.at(-1)[0];
  const byLabel = Object.fromEntries(rows.map(row => [row.indicateur, row.valeur]));
  const money = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'MAD' }).format(value);
  expect(byLabel['Ventes nettes']).toBe(money(900));
  expect(byLabel['Ventes initiales']).toBe(money(1500));
  expect(byLabel['Avoirs commerciaux émis']).toBe(money(600));
  expect(byLabel['Remboursements clients (inclus dans les sorties)']).toBe(money(600));
  fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
  expect(exportMonthlyReportPDF).toHaveBeenCalledWith(
    expect.objectContaining({
      ventes: '1500.00', avoirs_commerciaux: '600.00',
      ventes_nettes: '900.00', remboursements_clients: '600.00',
    }),
    'rapport_mensuel_2026-11',
  );
});
