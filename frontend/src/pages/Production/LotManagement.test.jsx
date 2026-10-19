import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotPanel from './LotPanel';
import { lotProductionService } from '../../services/productionService';

vi.mock('../../services/productionService', () => ({
  lotProductionService: { getLots: vi.fn(), updateLot: vi.fn() },
}));
vi.mock('./LotEggChart', () => ({ default: () => null }));

const lot = {
  id_lot: 1, nom_lot: 'Lot partagé', statut: 'actif', date_debut: '2026-10-01',
  effectif_initial: 100, effectif_actuel: 100, age_depart_semaines: 0,
  repartitions: [{ id_cycle: 1, id_batiment: 1, nom_batiment: 'A', effectif_initial: 100, effectif_actuel: 100 }],
};
const buildings = [{ id_batiment: 1, nom: 'A' }, { id_batiment: 2, nom: 'B' }];

describe('Shared lot management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lotProductionService.getLots.mockResolvedValue([lot]);
    lotProductionService.updateLot.mockResolvedValue(lot);
  });

  it('adds a building by correcting the balanced distribution', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} management /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier le lot' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Poussins · A' }), { target: { value: '80' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Poussins · B' }), { target: { value: '20' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(lotProductionService.updateLot).toHaveBeenCalledWith(1, expect.objectContaining({
      effectif_initial: 100,
      repartitions: [{ id_batiment: 1, effectif_initial: 80 }, { id_batiment: 2, effectif_initial: 20 }],
    })));
  });

  it('routes management through the dedicated page from the production summary', async () => {
    render(<MemoryRouter><LotPanel buildings={buildings} /></MemoryRouter>);
    expect(await screen.findByText('Lot partagé')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Gestion des lots' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Modifier le lot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminer le lot' })).not.toBeInTheDocument();
  });
});
