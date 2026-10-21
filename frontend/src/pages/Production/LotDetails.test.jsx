import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotDetails from './LotDetails';

const { getProductions, getBuildingVaccineExpenses } = vi.hoisted(() => ({ getProductions: vi.fn(), getBuildingVaccineExpenses: vi.fn() }));
vi.mock('../../services/productionService', () => ({ productionService: { getProductions, getBuildingVaccineExpenses } }));
vi.mock('./useProductionView', () => ({ localToday: () => '2026-10-21' }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>, LineChart: ({ children }) => <div>{children}</div>,
  CartesianGrid: () => null, Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null,
}));

const lot = { id_lot: 8, nom_lot: 'Lot B en cours', statut: 'actif', date_debut: '2026-09-01',
  date_fin_prevue: '2027-01-01', effectif_initial: 100, effectif_actuel: 98, mortalite_totale: 2,
  age_depart_semaines: 18, age_semaines: 25, souche: 'ISA Brown', formule_suggeree: '25-1% Sem vita',
  repartitions: [{ id_cycle: 4, id_batiment: 2, nom_batiment: 'B' }] };
const row = { id_cycle: 4, id_batiment: 2, date_production: '2026-10-20', type_oeuf: 'normal', nombre_oeufs: 80, mortalite: 1, consommation_aliment_kg: 12 };

describe('LotDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProductions.mockResolvedValue([row, { ...row, type_oeuf: 'blanc', nombre_oeufs: 20, mortalite: 0, consommation_aliment_kg: 0 }, { ...row, date_production: '2026-09-10', nombre_oeufs: 10 }]);
    getBuildingVaccineExpenses.mockResolvedValue([
      { id_charge: 1, id_cycle: 4, date_charge: '2026-10-10', nom_vaccin: 'Vaccin du lot', montant: 50, quantite: 1 },
      { id_charge: 2, id_cycle: 5, date_charge: '2026-10-10', nom_vaccin: 'Autre lot', montant: 999 },
      { id_charge: 3, id_cycle: 4, date_charge: '2026-08-10', nom_vaccin: 'Avant arriv�e', montant: 999 },
    ]);
  });

  it('filters production totals, table and export together, while grouping types into one daily row', async () => {
    render(<LotDetails lot={lot} onBack={vi.fn()} onEdit={vi.fn()} onEnd={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Lot B' })).toBeVisible();
    await screen.findByText(/Derni�re saisie/);
    fireEvent.click(screen.getByRole('tab', { name: 'Production' }));
    const table = screen.getByRole('table', { name: 'Saisies quotidiennes du lot' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('80')).toBeVisible();
    expect(within(table).getByText('20')).toBeVisible();
    expect(screen.getAllByText('100', { selector: 'strong' })[0]).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Toute la p�riode' }));
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('110', { selector: 'strong' })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Du' }), { target: { value: '21/10/26' } });
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled();
    expect(screen.getByText('Aucune saisie sur cette p�riode.')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Du' }), { target: { value: '22/10/26' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez une p�riode');
  });

  it('keeps vaccine costs scoped to the lot and preserves detail context while switching tabs', async () => {
    const back = vi.fn(), edit = vi.fn(), end = vi.fn();
    render(<LotDetails lot={lot} onBack={back} onEdit={edit} onEnd={end} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Vaccins et d�penses' }));
    expect(await screen.findByText('Vaccin du lot')).toBeVisible();
    expect(screen.getByText('50 MAD', { selector: 'h6' })).toBeVisible();
    expect(screen.queryByText('Autre lot')).not.toBeInTheDocument();
    expect(screen.queryByText('Avant arriv�e')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lot B' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le lot' })); expect(edit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer le lot' })); expect(end).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Retour aux lots' })); expect(back).toHaveBeenCalledOnce();
  });

  it('shows a finished lot with a complete period, final metrics and no active lifecycle actions', async () => {
    render(<LotDetails lot={{ ...lot, statut: 'termine', date_fin_reelle: '2026-09-30' }} />);
    expect(screen.getByText('Volailles � la fin')).toBeVisible();
    expect(screen.getByText('Age � la fin')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Modifier le lot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminer le lot' })).not.toBeInTheDocument();
    expect(screen.queryByText('Alimentation conseill�e')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Production' }));
    expect(screen.getByRole('button', { name: 'Toute la p�riode' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(getProductions).toHaveBeenCalledWith(expect.objectContaining({ date_fin: '2026-09-30' })));
    expect((await screen.findAllByText('10', { selector: 'strong' }))[0]).toBeVisible();
  });

  it('keeps production available if vaccine loading fails and allows retrying the failed request', async () => {
    getBuildingVaccineExpenses.mockRejectedValueOnce(new Error('Vaccins indisponibles'));
    render(<LotDetails lot={lot} />);
    await screen.findByText(/Derni�re saisie/);
    fireEvent.click(screen.getByRole('tab', { name: 'Vaccins et d�penses' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vaccins indisponibles');
    fireEvent.click(screen.getByRole('button', { name: 'R�essayer' }));
    expect(await screen.findByText('Vaccin du lot')).toBeVisible();
  });
});
