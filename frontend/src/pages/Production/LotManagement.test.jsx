import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotPanel from './LotPanel';
import { cycleProductionService, lotProductionService, productionService } from '../../services/productionService';

vi.mock('../../services/productionService', () => ({
  cycleProductionService: { assignHistory: vi.fn() },
  productionService: { getProductions: vi.fn(), getBuildingVaccineExpenses: vi.fn() },
  lotProductionService: { getLots: vi.fn(), updateLot: vi.fn() },
}));

const lot = {
  id_lot: 1, nom_lot: 'Lot A', statut: 'actif', date_debut: '2026-10-01',
  effectif_initial: 100, effectif_actuel: 100, age_depart_semaines: 18,
  repartitions: [{ id_cycle: 1, id_batiment: 1, nom_batiment: 'A', effectif_initial: 100, effectif_actuel: 100 }],
};
const buildings = [{ id_batiment: 1, nom: 'A' }, { id_batiment: 2, nom: 'B' }];

describe('Independent lot management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productionService.getProductions.mockResolvedValue([]);
    productionService.getBuildingVaccineExpenses.mockResolvedValue([]);
    lotProductionService.getLots.mockResolvedValue([lot]);
    cycleProductionService.assignHistory.mockResolvedValue({});
    lotProductionService.updateLot.mockResolvedValue(lot);
  });

  it('edits the selected flock while keeping its building fixed', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} managementMode /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le lot Lot A' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier le lot' }));
    expect(screen.getByRole('combobox', { name: 'Bâtiment' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Effectif de départ' }), {
      target: { value: '90' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: "Âge à l'arrivée (semaines)" }), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(lotProductionService.updateLot).toHaveBeenCalledWith(1, expect.objectContaining({
      age_depart_semaines: 20,
      effectif_initial: 90,
      repartitions: [{ id_batiment: 1, effectif_initial: 90 }],
    })));
  });

  it('opens the lot overview with stable tabs and lifecycle controls', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} managementMode /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le lot Lot A' }));
    expect(await screen.findByRole('heading', { name: 'Lot A' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier le lot' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Terminer le lot' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Démarrer un lot' })).not.toBeInTheDocument();
  });

  it('attaches only the selected building cycle to earlier unassigned entries', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Rattacher les saisies sans cycle' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('A');
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher' }));
    await waitFor(() => expect(cycleProductionService.assignHistory).toHaveBeenCalledWith(1, expect.objectContaining({
      date_debut: '2026-10-01',
    })));
  });
});

