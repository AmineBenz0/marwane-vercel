import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotPanel from './LotPanel';

const { getLots, createLot, updateLot, terminateLot, assignHistory } = vi.hoisted(() => ({
  getLots: vi.fn(), createLot: vi.fn(), updateLot: vi.fn(), terminateLot: vi.fn(), assignHistory: vi.fn(),
}));

vi.mock('../../services/productionService', () => ({
  lotProductionService: { getLots, createLot, updateLot, terminateLot },
  cycleProductionService: { assignHistory },
}));

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
    expect(await screen.findByLabelText('Lots actifs par bâtiment')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'B : Lot B' }));
    expect(screen.getByRole('heading', { name: 'Lot B' })).toBeVisible();
    expect(screen.getByText('Effectif restant')).toBeVisible();
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
  it('filters lot management by building and status', async () => {
    getLots.mockResolvedValue([activeLot, lotB, historicalLot]);
    render(<MemoryRouter><LotPanel buildings={buildings} refreshKey={0} managementMode /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /A \| Lot en cours/ })).toBeVisible();
    expect(screen.getByLabelText('Filtrer par bâtiment')).toHaveValue('1');
    expect(screen.queryByRole('button', { name: /B \\| Lot B/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Lots actifs par bâtiment')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filtrer par bâtiment'), { target: { value: '' } });
    expect(screen.getByLabelText('Filtrer par bâtiment')).toHaveValue('');
    expect(screen.getByRole('button', { name: /B \\| Lot B/ })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Filtrer par bâtiment'), { target: { value: '2' } });
    expect(screen.getByLabelText('Filtrer par bâtiment')).toHaveValue('2');
    expect(screen.getByRole('button', { name: /B \| Lot B/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /A \| Lot en cours/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filtrer par statut'), { target: { value: 'finished' } });
    expect(screen.getByText('Aucun lot ne correspond à ces filtres.')).toBeVisible();
  });

});
