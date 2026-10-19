import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotPanel from './LotPanel';
import { cycleProductionService, lotProductionService } from '../../services/productionService';

vi.mock('../../services/productionService', () => ({
  lotProductionService: { getLots: vi.fn(), updateLot: vi.fn() },
  cycleProductionService: { assignHistory: vi.fn() },
}));

const lot = {
  id_lot: 1, nom_lot: 'Lot partag�', statut: 'actif', date_debut: '2026-10-01',
  effectif_initial: 100, effectif_actuel: 100, age_depart_semaines: 0,
  repartitions: [{ id_cycle: 1, id_batiment: 1, nom_batiment: 'A', effectif_initial: 100, effectif_actuel: 100 }],
};
const buildings = [{ id_batiment: 1, nom: 'A' }, { id_batiment: 2, nom: 'B' }];

describe('Shared lot management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lotProductionService.getLots.mockResolvedValue([lot]);
    lotProductionService.updateLot.mockResolvedValue(lot);
    cycleProductionService.assignHistory.mockResolvedValue({});
  });

  it('adds a building by correcting the balanced distribution', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier le lot' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Poussins � A' }), { target: { value: '80' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Poussins � B' }), { target: { value: '20' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(lotProductionService.updateLot).toHaveBeenCalledWith(1, expect.objectContaining({
      effectif_initial: 100,
      repartitions: [{ id_batiment: 1, effectif_initial: 80 }, { id_batiment: 2, effectif_initial: 20 }],
    })));
  });

  it('keeps lifecycle controls here and leaves the egg chart to production', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} /></MemoryRouter>);
    expect(await screen.findByText('Lot partag�')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier le lot' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Terminer le lot' })).toBeVisible();
    expect(screen.queryByRole('figure', { name: "Graphique des quantit�s d'oufs" })).not.toBeInTheDocument();
  });

  it('attaches earlier entries from the selected building in lot management', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Rattacher des saisies ant�rieures' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('A');
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher' }));
    await waitFor(() => expect(cycleProductionService.assignHistory).toHaveBeenCalledWith(1, expect.objectContaining({
      date_debut: '2026-10-01',
    })));
  });
});
