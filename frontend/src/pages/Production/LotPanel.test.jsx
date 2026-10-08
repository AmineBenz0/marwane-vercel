import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotPanel from './LotPanel';

const { getLots, createLot, updateLot, terminateLot } = vi.hoisted(() => ({
  getLots: vi.fn(),
  createLot: vi.fn(),
  updateLot: vi.fn(),
  terminateLot: vi.fn(),
}));

vi.mock('../../services/productionService', () => ({
  lotProductionService: { getLots, createLot, updateLot, terminateLot },
}));

const buildings = [
  { id_batiment: 1, nom: 'A', est_actif: true },
  { id_batiment: 2, nom: 'B', est_actif: true },
  { id_batiment: 3, nom: 'C', est_actif: true },
];

describe('LotPanel allocation limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLots.mockResolvedValue([]);
  });

  it('blocks an allocation that would exceed the incoming total and identifies that field', async () => {
    render(
      <MemoryRouter>
        <LotPanel buildings={buildings} refreshKey={0} onChange={vi.fn()} />
      </MemoryRouter>,
    );

    const startButton = await screen.findByRole('button', { name: 'Démarrer un lot' });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Nombre total de poussins entrants' }), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Poussins · A' }), {
      target: { value: '99' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Poussins · B' }), {
      target: { value: '1' },
    });

    const lastBuildingField = screen.getByRole('spinbutton', { name: 'Poussins · C' });
    expect(lastBuildingField).toHaveAttribute('max', '0');
    fireEvent.change(lastBuildingField, { target: { value: '1' } });

    expect(lastBuildingField).toHaveValue(null);
    expect(screen.getByText('La quantité dépasse le nombre total de poussins entrants.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    fireEvent.change(lastBuildingField, { target: { value: '0' } });
    await waitFor(() => {
      expect(screen.queryByText('La quantité dépasse le nombre total de poussins entrants.')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });
});

const activeLot = {
  id_lot: 1, nom_lot: 'Lot en cours', statut: 'actif', date_debut: '2026-10-01',
  effectif_initial: 100, effectif_actuel: 99, mortalite_totale: 1,
  age_semaines: 18, formule_suggeree: '25-1% Sem vita',
  repartitions: [{ id_cycle: 1, id_batiment: 1, nom_batiment: 'A', effectif_initial: 100, effectif_actuel: 99 }],
};
const historicalLot = {
  ...activeLot, id_lot: 2, nom_lot: 'Ancien lot', statut: 'termine', date_fin_reelle: '2026-09-30',
};

function renderPanel() {
  return render(<MemoryRouter><LotPanel buildings={buildings} refreshKey={0} onChange={vi.fn()} /></MemoryRouter>);
}

describe('LotPanel single active lot and history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides start even when two buildings are still free and keeps the active lot name visible', async () => {
    getLots.mockResolvedValue([activeLot]);
    renderPanel();
    expect(await screen.findByRole('heading', { name: 'Lot en cours' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Démarrer un lot' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /A.*99 volailles/ })).toHaveAttribute('href', '/production/batiment/1');
    expect(screen.getByText('Effectif restant')).toBeVisible();
    expect(screen.getByText('sur 100 entrants')).toBeVisible();
  });

  it('keeps start hidden when viewing history while another lot is active', async () => {
    getLots.mockResolvedValue([historicalLot, activeLot]);
    renderPanel();
    await screen.findByRole('heading', { name: 'Lot en cours' });
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));
    fireEvent.click(screen.getByRole('button', { name: /Ancien lot/ }));
    expect(await screen.findByRole('heading', { name: 'Ancien lot' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Démarrer un lot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier le lot' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revenir au lot en cours' }));
    expect(await screen.findByRole('heading', { name: 'Lot en cours' })).toBeVisible();
  });

  it('shows start again after closing the active lot and refreshing', async () => {
    getLots.mockResolvedValueOnce([activeLot]).mockResolvedValue([{ ...activeLot, statut: 'termine' }]);
    terminateLot.mockResolvedValue({ ...activeLot, statut: 'termine' });
    renderPanel();
    await screen.findByRole('heading', { name: 'Lot en cours' });
    fireEvent.click(screen.getByRole('button', { name: 'Terminer le lot' }));
    const buttons = screen.getAllByRole('button', { name: 'Terminer le lot' });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(await screen.findByRole('button', { name: 'Démarrer un lot' })).toBeEnabled();
    expect(terminateLot).toHaveBeenCalledTimes(1);
  });
});
