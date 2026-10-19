import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionForm from './ProductionForm';
import { productionService, cycleProductionService } from '../../services/productionService';

vi.mock('../../services/productionService', () => ({
  productionService: {
    getFormules: vi.fn(), getCalibreThresholds: vi.fn(), getVaccins: vi.fn(),
    getDailyProduction: vi.fn(), createDailyProduction: vi.fn(), updateDailyProduction: vi.fn(),
  },
  cycleProductionService: { getContext: vi.fn() },
}));
vi.mock('../../services/compteBancaireService', () => ({ default: { getComptes: vi.fn().mockResolvedValue([]) } }));

const renderForm = (props = {}) => render(<ProductionForm open onClose={vi.fn()} onSuccess={vi.fn()}
  batiments={[{ id_batiment: 7, nom: 'Batiment 7' }]} preselectedBatimentId={7}
  preselectedDate="2026-09-01" {...props} />);

describe('Daily tray weight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productionService.getFormules.mockResolvedValue([]);
    productionService.getVaccins.mockResolvedValue([]);
    productionService.getCalibreThresholds.mockResolvedValue([
      { label: 'D\u00e9marrage', min_grammage: null, max_grammage: 50 },
      { label: 'Moyen', min_grammage: 50, max_grammage: 60 },
      { label: 'Gros', min_grammage: 60, max_grammage: null },
    ]);
    cycleProductionService.getContext.mockResolvedValue({ has_cycles: false, cycle: null });
    productionService.createDailyProduction.mockResolvedValue({});
    productionService.updateDailyProduction.mockResolvedValue({});
  });

  it.each([
    ['1559.7', '49.99', 'D\u00e9marrage'], ['1560', '50.00', 'Moyen'],
    ['1859.7', '59.99', 'Moyen'], ['1860', '60.00', 'Gros'],
    ['1860.3', '60.01', 'Gros'], ['1950', '63.00', 'Gros'],
  ])('converts a %s g tray to %s g and %s for display and save', async (tray, average, category) => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Oeufs normaux'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Poids du plateau (g)'), { target: { value: tray } });
    const result = screen.getByLabelText('Poids moyen de l\u2019\u0153uf (g)');
    expect(result).toHaveValue(average);
    expect(result).toHaveAttribute('readonly');
    expect(await screen.findByText(category)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
    fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer' }).closest('form'));
    await waitFor(() => expect(productionService.createDailyProduction).toHaveBeenCalledWith(expect.objectContaining({ grammage: Number(average) })));
    expect(productionService.createDailyProduction.mock.calls[0][0]).not.toHaveProperty('poids_plateau');
  });

  it.each(['', '0', '-30', '59', '60'])('rejects invalid tray weight %s when eggs are collected', async (tray) => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Oeufs normaux'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Poids du plateau (g)'), { target: { value: tray } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
    fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer' }).closest('form'));
    expect(await screen.findByText(tray === '' ? 'Champ requis' : 'Le poids du plateau doit \u00eatre sup\u00e9rieur \u00e0 60 g.')).toBeVisible();
    expect(productionService.createDailyProduction).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Poids moyen de l\u2019\u0153uf (g)')).toHaveValue('');
  });

  it('reconstructs a tray from a historical decimal weight and preserves it when saving', async () => {
    const record = { id_production: 1, id_batiment: 7, date_production: '2026-09-01', type_oeuf: 'normal', nombre_oeufs: 30, grammage: '60.12' };
    productionService.getDailyProduction.mockResolvedValue({ records: [record], versions: { 1: 'v1' } });
    renderForm({ initialData: record });
    await waitFor(() => expect(screen.getByLabelText('Poids du plateau (g)')).toHaveValue(1863.6));
    expect(screen.getByLabelText('Poids moyen de l\u2019\u0153uf (g)')).toHaveValue('60.12');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mettre a jour' })).toBeEnabled());
    fireEvent.submit(screen.getByRole('button', { name: 'Mettre a jour' }).closest('form'));
    await waitFor(() => expect(productionService.updateDailyProduction).toHaveBeenCalledWith(expect.objectContaining({ grammage: 60.12, versions: { 1: 'v1' } })));
  });
});
