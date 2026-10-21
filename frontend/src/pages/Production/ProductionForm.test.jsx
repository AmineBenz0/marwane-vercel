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

    expect(await screen.findByDisplayValue('01/09/26')).toBeVisible();
    fireEvent.change(screen.getByLabelText("Oeufs normaux"), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText("Double jaune"), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText("Oeufs blancs"), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Oeufs casses'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Poids du plateau (g)'), { target: { value: '1950' } });
    expect(screen.getByText('Oeufs collectes').parentElement).toHaveTextContent('160 oeufs');
    expect(screen.getByText('10', { exact: true })).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/productions/daily', expect.objectContaining({
      date_production: '2026-09-01',
      id_batiment: 7,
      quantites: { normal: 120, double_jaune: 30, blanc: 10, casse: 4, perdu: 0 },
      grammage: 63,
    })));

    expect(post.mock.calls[0][1]).not.toHaveProperty('id_cycle');
    expect(post.mock.calls[0][1]).not.toHaveProperty('nom_cycle');
  });

  it('preselects the dated formula and accepts feed before laying', async () => {
    get.mockImplementation((path) => {
      if (path === '/productions/formules') return Promise.resolve([{ value: '25-1% Sem vita', label: '25-1% Sem vita' }]);
      if (path.startsWith('/cycles-production/context/')) return Promise.resolve({
        has_cycles: true, cycle: { id_cycle: 4, nom_cycle: 'Cycle A', age_semaines: 18, effectif_actuel: 1000, formule_suggeree: '25-1% Sem vita' },
      });
      return Promise.resolve([]);
    });
    render(<ProductionForm open onClose={vi.fn()} onSuccess={vi.fn()}
      batiments={[{ id_batiment: 7, nom: 'Batiment 7' }]} preselectedBatimentId={7} preselectedDate="2026-09-01" />);
    expect(await screen.findByText('Cycle A')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
    expect(screen.getByRole('combobox', { name: 'Formule' })).toHaveTextContent('25-1% Sem vita');
    fireEvent.change(screen.getByLabelText('Aliment consommé (kg)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/productions/daily', expect.objectContaining({
      formule: '25-1% Sem vita', consommation_aliment_kg: 10, grammage: 0,
      quantites: { normal: 0, double_jaune: 0, blanc: 0, casse: 0, perdu: 0 },
    })));
  });

  it('carries a selection across dates, catches up, and resets unsaved changes on reopen', async () => {
    const formulas = [
      { value: '25-1% Sem vita', label: '25-1% Sem vita', age_min: 18, age_max: 25 },
      { value: '26-35 Sem', label: '26-35 Sem', age_min: 26, age_max: 35 },
      { value: '36-45 Sem', label: '36-45 Sem', age_min: 36, age_max: 45 },
    ];
    get.mockImplementation((path, params) => {
      if (path === '/productions/formules') return Promise.resolve(formulas);
      if (path.startsWith('/cycles-production/context/')) {
        const age = params.params.date_saisie === '2026-09-02' ? 36 : 24;
        return Promise.resolve({ has_cycles: true, cycle: {
          id_cycle: 4, nom_cycle: 'Cycle A', age_semaines: age, effectif_actuel: 1000,
          formule_suggeree: age === 36 ? '36-45 Sem' : '25-1% Sem vita',
        } });
      }
      return Promise.resolve([]);
    });
    const props = { onClose: vi.fn(), onSuccess: vi.fn(),
      batiments: [{ id_batiment: 7, nom: 'Batiment 7' }], preselectedBatimentId: 7,
      preselectedDate: '2026-09-01' };
    const view = render(<ProductionForm open {...props} />);
    const selector = () => screen.getByRole('combobox', { name: 'Formule' });
    await waitFor(() => expect(selector()).toHaveTextContent('25-1% Sem vita'));
    fireEvent.mouseDown(selector());
    fireEvent.click(await screen.findByRole('option', { name: '26-35 Sem' }));
    expect(selector()).toHaveTextContent('26-35 Sem');
    fireEvent.change(screen.getByLabelText(/Date de production/), { target: { value: '02/09/26' } });
    await waitFor(() => expect(selector()).toHaveTextContent('36-45 Sem'));
    fireEvent.mouseDown(selector());
    fireEvent.click(await screen.findByRole('option', { name: '26-35 Sem' }));
    view.rerender(<ProductionForm open={false} {...props} />);
    view.rerender(<ProductionForm open {...props} />);
    await waitFor(() => expect(selector()).toHaveTextContent('36-45 Sem'));
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
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
    fireEvent.change(screen.getByLabelText('Poids du plateau (g)'), { target: { value: '1710' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText("Indiquez au moins un nombre d'œufs.")).toBeVisible();
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Oeufs normaux'), { target: { value: '2.5' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer' }).closest('form'));
    expect(await screen.findByText('Indiquez un nombre entier positif ou nul')).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it.each(['Oeufs normaux', 'Double jaune', 'Oeufs blancs', 'Oeufs casses'])(
    'rejects a negative count for %s without reducing the collection preview',
    async (label) => {
      render(<ProductionForm open onClose={vi.fn()} onSuccess={vi.fn()}
        batiments={[{ id_batiment: 7, nom: 'Batiment 7' }]} preselectedBatimentId={7} />);
      fireEvent.change(screen.getByLabelText('Oeufs normaux'), { target: { value: '120' } });
      fireEvent.change(screen.getByLabelText('Oeufs blancs'), { target: { value: '10' } });
      fireEvent.change(screen.getByLabelText('Poids du plateau (g)'), { target: { value: '1710' } });
      fireEvent.change(screen.getByLabelText(label), { target: { value: '-5' } });
      expect(await screen.findByText('Minimum 0')).toBeVisible();
      const total = label === 'Oeufs normaux' ? 10 : label === 'Oeufs blancs' ? 120 : 130;
      expect(screen.getByText('Oeufs collectes').parentElement).toHaveTextContent(`${total} oeufs`);
      fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer' }).closest('form'));
      await waitFor(() => expect(screen.getByText('Minimum 0')).toBeVisible());
      expect(post).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    },
  );

  it('loads and updates every type in the selected building day', async () => {
    const rows = [
      { id_production: 1, id_batiment: 7, date_production: '2026-09-01', type_oeuf: 'normal', nombre_oeufs: 120, grammage: '63', mortalite: 2, consommation_aliment_kg: '12', formule: '' },
      { id_production: 2, id_batiment: 7, date_production: '2026-09-01', type_oeuf: 'blanc', nombre_oeufs: 20, grammage: '63', mortalite: null, consommation_aliment_kg: null },
      { id_production: 3, id_batiment: 7, date_production: '2026-09-01', type_oeuf: 'casse', nombre_oeufs: 7, grammage: '63', mortalite: null, consommation_aliment_kg: null },
      { id_production: 4, id_batiment: 7, date_production: '2026-09-01', type_oeuf: 'perdu', nombre_oeufs: 3, grammage: '63', mortalite: null, consommation_aliment_kg: null },
    ];
    get.mockImplementation((path) => Promise.resolve(
      path === '/productions/daily' ? { records: rows, versions: { 1: 'v1', 2: 'v2', 3: 'v3', 4: 'v4' } } : [],
    ));
    put.mockResolvedValue({});
    render(<ProductionForm open initialData={rows[1]} onClose={vi.fn()} onSuccess={vi.fn()}
      batiments={[{ id_batiment: 7, nom: 'Batiment 7' }]} />);
    await waitFor(() => expect(screen.getByLabelText('Oeufs normaux')).toHaveValue(120));
    expect(screen.getByLabelText('Oeufs blancs')).toHaveValue(20);
    expect(screen.getByLabelText('Oeufs casses')).toHaveValue(7);
    expect(screen.getByLabelText('Oeuf perdu')).toHaveValue(3);
    expect(screen.getByLabelText('Poids du plateau (g)')).toHaveValue(1950);
    fireEvent.change(screen.getByLabelText('Oeufs blancs'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mettre a jour' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/productions/daily', expect.objectContaining({
      date_production: '2026-09-01', id_batiment: 7, grammage: 63,
      quantites: { normal: 120, blanc: 25, double_jaune: 0, casse: 7, perdu: 3 },
      mortalite: 2, consommation_aliment_kg: 12, versions: { 1: 'v1', 2: 'v2', 3: 'v3', 4: 'v4' },
    })));
  });

});
