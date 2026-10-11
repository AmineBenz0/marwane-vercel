import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotEggChart, { WeekTooltip } from './LotEggChart';
import LotPanel from './LotPanel';

const { getEggEvolution, getLots } = vi.hoisted(() => ({ getEggEvolution: vi.fn(), getLots: vi.fn() }));
vi.mock('../../services/productionService', () => ({ lotProductionService: { getEggEvolution, getLots } }));
vi.stubGlobal('ResizeObserver', class {
  constructor(callback) { this.callback = callback; }
  observe() { this.callback([{ contentRect: { width: 800, height: 330 } }]); }
  unobserve() {}
  disconnect() {}
});

const data = {
  totaux: { normal: 350, blanc: 25, double_jaune: 0, double_jaune_demarrage: 0, casse: 5 },
  semaines: [
    { semaine: 1, date_debut: '2026-09-01', date_fin: '2026-09-07', saisies: 14, saisies_attendues: 14, incomplete: false, partielle: false,
      quantites: { normal: 350, blanc: 0, double_jaune: 0, double_jaune_demarrage: 0, casse: 0 } },
    { semaine: 2, date_debut: '2026-09-08', date_fin: '2026-09-14', saisies: 0, saisies_attendues: 14, incomplete: true, partielle: false,
      quantites: { normal: null, blanc: null, double_jaune: null, double_jaune_demarrage: null, casse: null } },
  ],
};

describe('Lot egg chart', () => {
  beforeEach(() => { vi.clearAllMocks(); getEggEvolution.mockResolvedValue(data); });

  it('loads the lot, toggles curves and exposes exact weekly values with missing-week gaps', async () => {
    render(<LotEggChart lotId={7} refreshKey={0} />);
    const normal = await screen.findByRole('button', { name: 'Normaux � 350' });
    expect(getEggEvolution).toHaveBeenCalledWith(7);
    expect(normal).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(normal);
    expect(normal).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Voir les chiffres par semaine' }));
    expect(screen.getByRole('table', { name: "Quantit�s d'oufs par semaine" })).toBeVisible();
    expect(screen.getByText('350', { selector: 'td' })).toBeVisible();
    expect(screen.getAllByText('-', { selector: 'td' })).toHaveLength(5);
    expect(screen.getByText('0 / 14 saisies � Incompl�te')).toBeVisible();
  });

  it('handles errors, retry, refresh and an empty lot', async () => {
    getEggEvolution.mockRejectedValueOnce(new Error('Network')).mockResolvedValueOnce(data);
    const view = render(<LotEggChart lotId={7} refreshKey={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    fireEvent.click(screen.getByRole('button', { name: 'R�essayer' }));
    await screen.findByRole('button', { name: 'Normaux � 350' });
    getEggEvolution.mockResolvedValue({ semaines: [], totaux: {} });
    view.rerender(<LotEggChart lotId={7} refreshKey={1} />);
    expect(await screen.findByText('Aucune production enregistr�e pour ce lot.')).toBeVisible();
    expect(getEggEvolution).toHaveBeenCalledTimes(3);
  });

  it('shows dates, exact values and recording coverage in the tooltip', () => {
    render(<WeekTooltip active payload={[{ dataKey: 'normal', name: 'Normaux', color: '#2563eb', value: 350, payload: { ...data.semaines[0], incomplete: true } }]} />);
    expect(screen.getByText('01/09/26 - 07/09/26')).toBeVisible();
    expect(screen.getByText('350')).toBeVisible();
    expect(screen.getByText(/Donn�es incompl�tes/)).toBeVisible();
  });

  it('switches history without displaying a late response from the previous lot', async () => {
    let finishOldRequest;
    getEggEvolution.mockImplementation((id) => id === 1 ? new Promise((resolve) => { finishOldRequest = resolve; }) : Promise.resolve({ ...data, totaux: { ...data.totaux, normal: 999 } }));
    getLots.mockResolvedValue([
      { id_lot: 1, nom_lot: 'Lot actif', statut: 'actif', date_debut: '2026-09-01', repartitions: [] },
      { id_lot: 2, nom_lot: 'Lot ancien', statut: 'termine', date_debut: '2026-07-01', repartitions: [] },
    ]);
    render(<LotPanel buildings={[]} refreshKey={0} onChange={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Lot actif' });
    await waitFor(() => expect(getEggEvolution).toHaveBeenCalledWith(1));
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }));
    fireEvent.click(screen.getByRole('button', { name: /Lot ancien/ }));
    await screen.findByRole('button', { name: 'Normaux � 999' });
    finishOldRequest(data);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Normaux � 350' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Lot ancien' })).toBeVisible();
  });
});
