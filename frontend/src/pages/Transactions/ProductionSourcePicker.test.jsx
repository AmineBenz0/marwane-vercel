import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import { useForm, useWatch } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionSourcePicker from './ProductionSourcePicker';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/api', () => ({ get: mocks.get }));
const sources = [
  { id_production: 11, date_production: '2026-10-20', type_oeuf: 'normal', calibre: 'moyen', grammage: 55, nombre_oeufs: 100, disponible: 60, vendable: true },
  { id_production: 12, date_production: '2026-10-21', type_oeuf: 'normal', calibre: 'moyen', grammage: 56, nombre_oeufs: 80, disponible: 80, vendable: true },
];
function Form({ saleDate = '2026-10-24', initial = {}, otherLines = [] }) {
  const { control, setValue } = useForm({ defaultValues: { lignes: [
    { id_batiment: 1, id_production: '', date_production: '', ...initial }, ...otherLines,
  ] } });
  const lines = useWatch({ control, name: 'lignes' });
  return <>
    <ProductionSourcePicker index={0} control={control} setValue={setValue}
      batiments={[{ id_batiment: 1, nom: 'Bâtiment 1' }]} saleDate={saleDate} />
    <output data-testid="line">{JSON.stringify(lines[0])}</output>
  </>;
}
const line = () => JSON.parse(screen.getByTestId('line').textContent);
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(sources); });

describe('sale stock selection', () => {
  it('loads carryover stock by sale date without requiring a daily entry date', async () => {
    render(<Form />);
    await screen.findByRole('button', { name: 'Choisir Normaux Moyen' });
    expect(mocks.get).toHaveBeenCalledWith('/transactions/production-sources', {
      params: { id_batiment: 1, through_date: '2026-10-24' },
    });
    expect(screen.queryByLabelText(/Date de la saisie/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choisir Normaux Moyen' }));
    await waitFor(() => expect(line()).toMatchObject({
      id_production: 11, date_production: '2026-10-20', source_available: 140, source_ready: true,
    }));
  });

  it('reloads on sale date changes and blocks a source absent from the new stock', async () => {
    const view = render(<Form initial={{ id_production: 11, date_production: '2026-10-20' }} />);
    await waitFor(() => expect(line().source_ready).toBe(true));
    mocks.get.mockResolvedValue([]);
    view.rerender(<Form saleDate="2026-10-19" />);
    await screen.findByText('Aucun stock disponible pour ce bâtiment à la date de vente.');
    expect(line().source_ready).toBe(false);
    expect(mocks.get.mock.calls.at(-1)[1].params.through_date).toBe('2026-10-19');
  });

  it('ignores a stale stock response after changing sale date', async () => {
    let resolveOld;
    mocks.get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<Form />);
    mocks.get.mockResolvedValue([]);
    view.rerender(<Form saleDate="2026-10-19" />);
    await screen.findByText('Aucun stock disponible pour ce bâtiment à la date de vente.');
    await act(async () => resolveOld(sources));
    expect(screen.queryByText('20/10/26')).not.toBeInTheDocument();
    expect(line().source_ready).toBe(false);
  });

  it('accounts for the same stock reserved in another line', async () => {
    render(<Form otherLines={[{ id_production: 11, quantite: 140 }]} />);
    expect(await screen.findByRole('button', { name: 'Choisir Normaux Moyen' })).toBeDisabled();

  });
});
