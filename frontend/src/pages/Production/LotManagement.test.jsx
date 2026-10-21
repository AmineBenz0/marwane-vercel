import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotPanel from './LotPanel';
import { cycleProductionService, lotProductionService } from '../../services/productionService';

vi.mock('../../services/productionService', () => ({
  cycleProductionService: { assignHistory: vi.fn() },
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
    lotProductionService.getLots.mockResolvedValue([lot]);
    cycleProductionService.assignHistory.mockResolvedValue({});
    lotProductionService.updateLot.mockResolvedValue(lot);
  });

  it('edits the selected flock while keeping its building fixed', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} managementMode /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier le lot' }));
    expect(screen.getByRole('combobox', { name: 'Bâtiment' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Effectif initial dans ce bâtiment' }), {
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

  it('keeps lifecycle controls in management and leaves the chart to production', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} managementMode /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Lot A' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier le lot' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Terminer ce lot' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Évolution des œufs par semaine' })).not.toBeInTheDocument();
  });

  it('attaches only the selected building cycle to earlier unassigned entries', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} managementMode /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Rattacher les saisies sans cycle' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('A');
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher' }));
    await waitFor(() => expect(cycleProductionService.assignHistory).toHaveBeenCalledWith(1, expect.objectContaining({
      date_debut: '2026-10-01',
    })));
  });
});
