import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LotEggChart, { WeekTooltip } from './LotEggChart';
import LotPanel from './LotPanel';

const { getEggEvolution, getLots } = vi.hoisted(() => ({ getEggEvolution: vi.fn(), getLots: vi.fn() }));
vi.mock('../../services/productionService', () => ({ lotProductionService: { getEggEvolution, getLots } }));
// Decorative lot controls do not affect chart behavior. Avoid importing the
// entire icon catalogue into this focused chart test suite.
vi.mock('@mui/icons-material', () => ({
  EditOutlined: () => null, History: () => null, StopCircleOutlined: () => null,
  ExpandLessRounded: () => null, ExpandMoreRounded: () => null, InfoOutlined: () => null,
  TableChartOutlined: () => null, TuneRounded: () => null,
}));
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_DEPLOYMENT_ENV', 'production');
    getEggEvolution.mockResolvedValue(data);
  });

  it('hides all sample controls in production, including for empty lots and failed requests', async () => {
    const view = render(<LotEggChart lotId={7} refreshKey={0} />);
    await screen.findByRole('button', { name: 'Normaux · 350' });
    expect(screen.queryByRole('button', { name: 'Voir un exemple' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Exemple à visualiser' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Lot fictif/)).not.toBeInTheDocument();
    getEggEvolution.mockResolvedValueOnce({ semaines: [], totaux: {} });
    view.rerender(<LotEggChart lotId={7} refreshKey={1} />);
    await screen.findByText('Aucune production enregistrée pour ce lot.');
    expect(screen.queryByRole('button', { name: 'Voir un exemple' })).not.toBeInTheDocument();
    getEggEvolution.mockRejectedValueOnce(new Error('Network'));
    view.rerender(<LotEggChart lotId={7} refreshKey={2} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    expect(screen.queryByRole('button', { name: 'Voir un exemple' })).not.toBeInTheDocument();
  });

  it('uses real lot data in production even if a sample was previously selected', async () => {
    vi.stubEnv('VITE_DEPLOYMENT_ENV', 'preview');
    const view = render(<LotEggChart lotId={7} refreshKey={0} />);
    await screen.findByRole('button', { name: 'Normaux · 350' });
    fireEvent.click(screen.getByRole('button', { name: 'Voir un exemple' }));
    expect(screen.getByText(/Lot fictif/)).toBeVisible();
    vi.stubEnv('VITE_DEPLOYMENT_ENV', 'production');
    view.rerender(<LotEggChart lotId={7} refreshKey={0} />);
    expect(screen.getByRole('button', { name: 'Normaux · 350' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Voir un exemple|Revenir aux données/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Exemple à visualiser' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Lot fictif/)).not.toBeInTheDocument();
  });

  it('loads the lot, toggles curves and exposes exact weekly values with missing-week gaps', async () => {
    render(<LotEggChart lotId={7} refreshKey={0} />);
    const normal = await screen.findByRole('button', { name: 'Normaux · 350' });
    expect(getEggEvolution).toHaveBeenCalledWith(7);
    expect(normal).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(normal);
    expect(normal).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Voir les chiffres' }));
    expect(screen.getByRole('table', { name: "Quantités d'œufs par semaine" })).toBeVisible();
    expect(screen.getByText('350', { selector: 'td' })).toBeVisible();
    expect(screen.getAllByText('—', { selector: 'td' })).toHaveLength(5);
    expect(screen.getByText('0 / 14 saisies · Incomplète')).toBeVisible();
  });

  it('handles errors, retry, refresh and an empty lot', async () => {
    getEggEvolution.mockRejectedValueOnce(new Error('Network')).mockResolvedValueOnce(data);
    const view = render(<LotEggChart lotId={7} refreshKey={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('button', { name: 'Normaux · 350' });
    getEggEvolution.mockResolvedValue({ semaines: [], totaux: {} });
    view.rerender(<LotEggChart lotId={7} refreshKey={1} />);
    expect(await screen.findByText('Aucune production enregistrée pour ce lot.')).toBeVisible();
    expect(getEggEvolution).toHaveBeenCalledTimes(3);
  });

  it('keeps one-week production visible with a large point and a concise period label', async () => {
    getEggEvolution.mockResolvedValue({
      totaux: data.totaux,
      semaines: [{ ...data.semaines[0] }],
    });
    render(<LotEggChart lotId={7} refreshKey={0} />);
    expect(await screen.findByText(/Semaine 1 ·/)).toBeVisible();
    const graph = screen.getByRole('figure', { name: /Graphique des quantités d’œufs/ });
    expect(graph.querySelectorAll('.recharts-line-dots .recharts-dot')).toHaveLength(5);
    expect(graph.querySelector('.recharts-line-dots .recharts-dot')).toHaveAttribute('r', '6');
    expect(screen.getByRole('button', { name: 'Options' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'De' })).not.toBeInTheDocument();
  });

  it('shows dates, exact values and recording coverage in the tooltip', () => {
    render(<WeekTooltip active payload={[{ dataKey: 'normal', name: 'Normaux', color: '#2563eb', value: 350, payload: { ...data.semaines[0], incomplete: true } }]} />);
    expect(screen.getByText('01/09/26 – 07/09/26')).toBeVisible();
    expect(screen.getByText('350')).toBeVisible();
    expect(screen.getByText(/Données incomplètes/)).toBeVisible();
  });

  it('keeps large and rare quantities on one graph, rescales a chosen week and offers a linear scale', async () => {
    getEggEvolution.mockResolvedValue({
      totaux: { normal: 300000, blanc: 3000, double_jaune: 16, double_jaune_demarrage: 0, casse: 550 },
      semaines: data.semaines.map((week, index) => ({ ...week, saisies: 14, incomplete: false,
        quantites: index === 0
          ? { normal: 240000, blanc: 1000, double_jaune: 12, double_jaune_demarrage: 0, casse: 200 }
          : { normal: 60000, blanc: 2000, double_jaune: 4, double_jaune_demarrage: 0, casse: 350 },
      })),
    });
    render(<LotEggChart lotId={7} refreshKey={0} />);
    const normal = await screen.findByRole('figure', { name: 'Graphique des quantités d’œufs' });
    expect(screen.getAllByRole('figure')).toHaveLength(1);
    expect(normal).toHaveTextContent('Échelle adaptée');
    expect(normal.textContent.replace(/\s/g, '')).toContain('0–300000');
    expect(screen.queryByRole('combobox', { name: 'De' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'De' }), { target: { value: '1' } });
    expect(normal.textContent.replace(/\s/g, '')).toContain('0–80000');
    expect(screen.getByRole('button', { name: 'Tout le lot' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Linéaire' }));
    expect(screen.getAllByRole('figure')).toHaveLength(1);
    expect(normal).toHaveTextContent('Échelle linéaire');
    fireEvent.click(screen.getByRole('button', { name: 'Tout le lot' }));
    expect(screen.getByRole('figure').textContent.replace(/\s/g, '')).toContain('0–300000');
    fireEvent.click(screen.getByRole('button', { name: 'Voir les chiffres' }));
    expect(screen.getByText('12', { selector: 'td' })).toBeVisible();
    expect(screen.getByText((text, element) => element.tagName === 'TD' && text.replace(/\s/g, '') === '240000')).toBeVisible();
  });

  it('shows original counts in tooltips even though the plotted coordinates are compressed', () => {
    render(<WeekTooltip active payload={[
      { dataKey: 'plot_normal', name: 'Normaux', value: 5.38, payload: { ...data.semaines[0], normal: 240000, double_jaune: 12 } },
      { dataKey: 'plot_double_jaune', name: 'Doubles jaunes', value: 1.11, payload: { ...data.semaines[0], normal: 240000, double_jaune: 12 } },
    ]} />);
    expect(screen.getByText((text) => text.replace(/\s/g, '') === '240000')).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.queryByText('5,38')).not.toBeInTheDocument();
  });

  it('provides labeled sample data with a spike, gaps, real zero values and a partial week without writing production', async () => {
    vi.stubEnv('VITE_DEPLOYMENT_ENV', 'preview');
    getEggEvolution.mockResolvedValue({ semaines: [], totaux: {} });
    render(<LotEggChart lotId={7} refreshKey={0} />);
    await screen.findByText('Aucune production enregistrée pour ce lot.');
    fireEvent.click(screen.getByRole('button', { name: 'Voir un exemple' }));
    expect(screen.getByText('Lot fictif · Données de démonstration')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les chiffres' }));
    expect(screen.getAllByRole('row')).toHaveLength(21);
    const missing = screen.getByRole('row', { name: /^S\. 5 / });
    expect(within(missing).getAllByText('—', { selector: 'td' })).toHaveLength(5);
    const zero = screen.getByRole('row', { name: /^S\. 8 / });
    expect(within(zero).getAllByText('0', { selector: 'td' })).toHaveLength(5);
    expect(zero).not.toHaveTextContent('Incomplète');
    expect(screen.getByRole('row', { name: /^S\. 10 / })).toHaveTextContent('9 / 21 saisies · Incomplète');
    const spike = screen.getByRole('row', { name: /^S\. 15 / });
    expect(within(spike).getByText((value) => value.replace(/\s/g, '') === '240000')).toBeVisible();
    expect(screen.getByRole('row', { name: /^S\. 20 / })).toHaveTextContent('Partielle');
    fireEvent.click(screen.getByRole('button', { name: 'Revenir aux données du lot' }));
    expect(screen.getByText('Aucune production enregistrée pour ce lot.')).toBeVisible();
    expect(screen.queryByText('Lot fictif · Données de démonstration')).not.toBeInTheDocument();
    expect(getEggEvolution).toHaveBeenCalledTimes(1);
  });

  it('keeps demo scenarios isolated from live responses and resets the chart controls when changing examples', async () => {
    vi.stubEnv('VITE_DEPLOYMENT_ENV', 'preview');
    let finishRequest;
    getEggEvolution.mockImplementation(() => new Promise((resolve) => { finishRequest = resolve; }));
    render(<LotEggChart lotId={7} refreshKey={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Voir un exemple' }));
    const normal = screen.getByRole('button', { name: /^Normaux/ });
    fireEvent.click(normal);
    expect(normal).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Voir les chiffres' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Exemple à visualiser' }), { target: { value: 'long' } });
    expect(screen.getByRole('button', { name: /^Normaux/ })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Voir les chiffres' }));
    expect(screen.getAllByRole('row')).toHaveLength(105);
    finishRequest(data);
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Normaux · 350' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Exemple à visualiser' }), { target: { value: 'zero' } });
    expect(screen.getByRole('button', { name: 'Normaux · 0' })).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Exemple à visualiser' }), { target: { value: 'empty' } });
    expect(screen.getByText('Aucune production enregistrée pour ce lot.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Revenir aux données du lot' }));
    expect(await screen.findByRole('button', { name: 'Normaux · 350' })).toBeVisible();
    expect(getEggEvolution).toHaveBeenCalledTimes(1);
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
    await screen.findByRole('button', { name: 'Normaux · 999' });
    finishOldRequest(data);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Normaux · 350' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Lot ancien' })).toBeVisible();
  });
});
