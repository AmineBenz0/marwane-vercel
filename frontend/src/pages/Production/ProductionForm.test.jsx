import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionForm from './ProductionForm';
import { get, post, put } from '../../services/api';

vi.mock('../../services/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

describe('ProductionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((path) => {
      if (path === '/productions/formules') return Promise.resolve([]);
      if (path === '/productions/calibre-thresholds') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    post.mockResolvedValue({});
  });

  it('submits a daily production without lot metadata', async () => {
    render(
      <ProductionForm
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        batiments={[{ id_batiment: 7, nom: 'Batiment 7' }]}
        preselectedBatimentId={7}
        preselectedDate="2026-09-01"
      />,
    );

    expect(await screen.findByDisplayValue('2026-09-01')).toBeVisible();
    fireEvent.change(screen.getByLabelText("Oeufs normaux"), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText("Double jaune"), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText("Oeufs blancs"), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Grammage moyen global (g)'), { target: { value: '63' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/productions/daily', expect.objectContaining({
      date_production: '2026-09-01',
      id_batiment: 7,
      quantites: { normal: 120, double_jaune: 30, blanc: 10, casse: 0, perdu: 0 },
      grammage: 63,
    })));

    expect(post.mock.calls[0][1]).not.toHaveProperty('id_cycle');
    expect(post.mock.calls[0][1]).not.toHaveProperty('nom_cycle');
  });

  it('does not allow negative mortality in daily production', async () => {
    render(
      <ProductionForm
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        batiments={[{ id_batiment: 7, nom: 'Batiment 7' }]}
        preselectedBatimentId={7}
        preselectedDate="2026-09-01"
      />,
    );

    const mortalityInput = screen.getByLabelText('Mortalité');
    expect(mortalityInput).toHaveAttribute('min', '0');
    expect(mortalityInput).toHaveAttribute('step', '1');

    fireEvent.change(mortalityInput, { target: { value: '-2' } });
    expect(mortalityInput).toHaveValue(0);
  });

  it('rejects an empty collection and fractional counts', async () => {
    render(<ProductionForm open onClose={vi.fn()} onSuccess={vi.fn()}
      batiments={[{ id_batiment: 7, nom: 'Batiment 7' }]} preselectedBatimentId={7} />);
    fireEvent.change(screen.getByLabelText('Grammage moyen global (g)'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText("Indiquez au moins un nombre d'œufs.")).toBeVisible();
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Oeufs normaux'), { target: { value: '2.5' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer' }).closest('form'));
    expect(await screen.findByText('Indiquez un nombre entier positif ou nul')).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it('loads and updates every type in the selected building day', async () => {
    const rows = [
      { id_production: 1, id_batiment: 7, date_production: '2026-09-01', type_oeuf: 'normal', nombre_oeufs: 120, grammage: '63', mortalite: 2, consommation_aliment_kg: '12', formule: '' },
      { id_production: 2, id_batiment: 7, date_production: '2026-09-01', type_oeuf: 'blanc', nombre_oeufs: 20, grammage: '63', mortalite: null, consommation_aliment_kg: null },
    ];
    get.mockImplementation((path) => Promise.resolve(
      path === '/productions/daily' ? { records: rows, versions: { 1: 'v1', 2: 'v2' } } : [],
    ));
    put.mockResolvedValue({});
    render(<ProductionForm open initialData={rows[1]} onClose={vi.fn()} onSuccess={vi.fn()}
      batiments={[{ id_batiment: 7, nom: 'Batiment 7' }]} />);
    await waitFor(() => expect(screen.getByLabelText('Oeufs normaux')).toHaveValue(120));
    expect(screen.getByLabelText('Oeufs blancs')).toHaveValue(20);
    expect(screen.getByLabelText('Grammage moyen global (g)')).toHaveValue(63);
    fireEvent.change(screen.getByLabelText('Oeufs blancs'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mettre a jour' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/productions/daily', expect.objectContaining({
      date_production: '2026-09-01', id_batiment: 7, grammage: 63,
      quantites: { normal: 120, blanc: 25, casse: 0, double_jaune: 0, perdu: 0 },
      mortalite: 2, consommation_aliment_kg: 12, versions: { 1: 'v1', 2: 'v2' },
    })));
  });

});
