import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getAllByText('3', { exact: true })).toHaveLength(2);
    expect(screen.getByText(/Variation nette stock/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(exportToExcelAdvanced).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ indicateur: 'Entrées banques' }),
        expect.objectContaining({ indicateur: 'Solde Banque Test' }),
        expect.objectContaining({ indicateur: 'Mouvements stock', valeur: '3' }),
        expect.objectContaining({ indicateur: 'Variation nette stock' }),
      ]),
      expect.any(Array),
      'rapport_mensuel_2026-09',
      'Synthèse',
    ));
  });
});
