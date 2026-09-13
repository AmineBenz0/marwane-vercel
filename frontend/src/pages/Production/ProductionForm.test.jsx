import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionForm from './ProductionForm';
import { get, post } from '../../services/api';

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
    fireEvent.change(screen.getByLabelText("Nombre d'oeufs"), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Grammage moyen (g)'), { target: { value: '63' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/productions', expect.objectContaining({
      date_production: '2026-09-01',
      id_batiment: 7,
      type_oeuf: 'normal',
      nombre_oeufs: 120,
      grammage: 63,
    })));

    expect(post.mock.calls[0][1]).not.toHaveProperty('id_cycle');
    expect(post.mock.calls[0][1]).not.toHaveProperty('nom_cycle');
  });
});
