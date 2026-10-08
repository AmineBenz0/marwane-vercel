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

    fireEvent.click(await screen.findByRole('button', { name: 'Démarrer un lot' }));
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
