import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotPanel from './LotPanel';

const { getLots, createLot, updateLot, terminateLot, assignHistory, getProductions, getBuildingVaccineExpenses } = vi.hoisted(() => ({
  getLots: vi.fn(), createLot: vi.fn(), updateLot: vi.fn(), terminateLot: vi.fn(), assignHistory: vi.fn(),
  getProductions: vi.fn(), getBuildingVaccineExpenses: vi.fn(),
}));

vi.mock('../../services/productionService', () => ({
  lotProductionService: { getLots, createLot, updateLot, terminateLot },
  cycleProductionService: { assignHistory },
  productionService: { getProductions, getBuildingVaccineExpenses },
}));

vi.mock('./LotEggChart', () => ({ default: () => <div>Évolution des œufs</div> }));

const buildings = [
  { id_batiment: 1, nom: 'A', est_actif: true },
  { id_batiment: 2, nom: 'B', est_actif: true },
  { id_batiment: 3, nom: 'C', est_actif: true },
];
const activeLot = {
  id_lot: 1, nom_lot: 'Lot en cours', statut: 'actif', date_debut: '2026-10-01',
  effectif_initial: 100, effectif_actuel: 99, mortalite_totale: 1,
  age_semaines: 18, formule_suggeree: '25-1% Sem vita',
  repartitions: [{ id_cycle: 1, id_batiment: 1, nom_batiment: 'A', effectif_initial: 100, effectif_actuel: 99 }],
};
const lotB = {
  ...activeLot, id_lot: 2, nom_lot: 'Lot B', effectif_initial: 120, effectif_actuel: 120,
  repartitions: [{ id_cycle: 2, id_batiment: 2, nom_batiment: 'B', effectif_initial: 120, effectif_actuel: 120 }],
};
const historicalLot = { ...activeLot, id_lot: 3, nom_lot: 'Ancien lot', statut: 'termine', date_debut: '2026-09-01', date_fin_reelle: '2026-09-30' };

function renderPanel() {
  return render(<MemoryRouter><LotPanel buildings={buildings} refreshKey={0} onChange={vi.fn()} /></MemoryRouter>);
}

describe('LotPanel independent building lots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLots.mockResolvedValue([]);
    createLot.mockResolvedValue({ id_lot: 4 });
    updateLot.mockResolvedValue(activeLot);
    terminateLot.mockResolvedValue({ ...activeLot, statut: 'termine' });
    assignHistory.mockResolvedValue({});
    getProductions.mockResolvedValue([]);
    getBuildingVaccineExpenses.mockResolvedValue([]);
  });

  it('allows a new lot for a free building while another building has an active lot', async () => {
    getLots.mockResolvedValue([activeLot]);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Démarrer un lot' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Effectif initial dans ce bâtiment' }), {
      target: { value: '80' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(createLot).toHaveBeenCalledWith(expect.objectContaining({
      effectif_initial: 80,
      repartitions: [{ id_batiment: 2, effectif_initial: 80 }],
    })));
  });

  it('shows and selects multiple simultaneous lots independently', async () => {
    getLots.mockResolvedValue([activeLot, lotB]);
    renderPanel();
    expect(await screen.findByRole('button', { name: 'B : Lot B' })).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'B : Lot B' }));
    expect(screen.getByRole('heading', { name: 'Lot B' })).toBeVisible();
    expect(screen.getByText('Volailles présentes')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Bâtiment du lot' })).toBeVisible();
  });

  it('keeps start available while viewing history and an active lot exists elsewhere', async () => {
    getLots.mockResolvedValue([historicalLot, activeLot]);
    renderPanel();
    await screen.findByRole('heading', { name: 'Lot en cours' });
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));
    fireEvent.click(screen.getByRole('button', { name: /Ancien lot/ }));
    expect(await screen.findByRole('heading', { name: 'Ancien lot' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Démarrer un lot' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Modifier le lot' })).not.toBeInTheDocument();
  });

  it('closes only the selected lot', async () => {
    getLots.mockResolvedValueOnce([activeLot, lotB]).mockResolvedValue([lotB, historicalLot]);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer ce lot' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Terminer le lot' }));
    await waitFor(() => expect(terminateLot).toHaveBeenCalledWith(1, { date_fin_reelle: expect.any(String) }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lot B' })).toBeVisible());
  });
  it('shows all active lots by default and filters only finished lots by building', async () => {
    getLots.mockResolvedValue([activeLot, lotB, historicalLot]);
    render(<MemoryRouter><LotPanel buildings={buildings} refreshKey={0} managementMode /></MemoryRouter>);

    const activeTab = await screen.findByRole('tab', { name: /En cours/ });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Filtrer par bâtiment')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lots en cours' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Ouvrir le lot/ })).toHaveLength(2);
    const activeCard = screen.getByRole('button', { name: 'Ouvrir le lot Lot' });
    expect(within(activeCard).queryByText('Lot en cours')).not.toBeInTheDocument();
    expect(within(activeCard).queryByText('Voir le lot')).not.toBeInTheDocument();
    fireEvent.click(activeCard);
    expect(await screen.findByRole('heading', { name: 'Lot' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Tous les lots' }));
    expect(screen.getByRole('tab', { name: /En cours/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: /Terminés/ }));
    const buildingFilter = screen.getByLabelText('Filtrer par bâtiment');
    expect(buildingFilter).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Ouvrir le lot Ancien lot' })).toBeVisible();

    fireEvent.change(buildingFilter, { target: { value: '2' } });
    expect(screen.getByText('Aucun lot terminé dans ce bâtiment')).toBeVisible();
    fireEvent.change(buildingFilter, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le lot Ancien lot' }));

    expect(await screen.findByRole('heading', { name: 'Ancien lot' })).toBeVisible();
    expect(screen.getByText(/Âge à l’arrivée/)).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Tous les lots' })[0]);
    expect(screen.getByRole('tab', { name: /Terminés/ })).toHaveAttribute('aria-selected', 'true');
  });
  it('loads historical records and vaccine expenses for the selected lot cycle', async () => {
    getLots.mockResolvedValue([activeLot, lotB, historicalLot]);
    getProductions.mockResolvedValue([{
      id_production: 10, id_cycle: 1, date_production: '2026-09-15',
      type_oeuf: 'normal', nombre_oeufs: 80, mortalite: 2, consommation_aliment_kg: 12,
    }]);
    getBuildingVaccineExpenses.mockResolvedValue([{
      id_charge: 4, id_cycle: 1, date_charge: '2026-09-16',
      nom_vaccin: 'Vaccin A', quantite: 1, unite: 'flacon', montant: 25,
    }]);
    render(<MemoryRouter><LotPanel buildings={buildings} refreshKey={0} managementMode /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('tab', { name: /Terminés/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le lot Ancien lot' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Historique de production' }));

    expect(await screen.findByRole('region', { name: 'Historique de production' })).toBeVisible();
    await waitFor(() => expect(getProductions).toHaveBeenCalledWith(expect.objectContaining({
      id_cycle: 1, date_debut: '2026-09-01', date_fin: '2026-09-30',
    })));
    expect(await screen.findByText('80')).toBeVisible();
    expect(await screen.findByText('Vaccin A')).toBeVisible();
    expect(screen.getByText('Évolution des œufs')).toBeVisible();
  });

});
