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
function Form({ saleDate = '2026-10-24', initial = {}, otherLines = [], produits = [{ id_produit: 7, nom_produit: 'Oeufs - Moyen' }] }) {
  const { control, setValue } = useForm({ defaultValues: { lignes: [
    { id_batiment: 1, id_production: '', date_production: '', ...initial }, ...otherLines,
  ] } });
  const lines = useWatch({ control, name: 'lignes' });
  return <>
    <ProductionSourcePicker index={0} control={control} setValue={setValue}
      batiments={[{ id_batiment: 1, nom: 'Bâtiment 1' }]}
      produits={produits} saleDate={saleDate} />
    <output data-testid="line">{JSON.stringify(lines[0])}</output>
  </>;
}
const line = () => JSON.parse(screen.getByTestId('line').textContent);
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(sources); });

describe('sale stock selection', () => {
  it('loads carryover stock by sale date without requiring a daily entry date', async () => {
    render(<Form />);
    await screen.findByRole('button', { name: 'Choisir Normaux' });
    expect(mocks.get).toHaveBeenCalledWith('/transactions/production-sources', {
      params: { id_batiment: 1, through_date: '2026-10-24' },
    });
    expect(screen.queryByLabelText(/Date de la saisie/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choisir Normaux' }));
    await waitFor(() => expect(line()).toMatchObject({
      id_production: 11, date_production: '2026-10-20', source_available: 140, source_ready: true,
    }));
  });

  it('lets the user select an egg category when its available stock is zero', async () => {
    mocks.get.mockResolvedValue([]);
    render(<Form />);
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Normaux' }));
    await waitFor(() => expect(line()).toMatchObject({
      id_production: '', id_produit: 7, source_available: 0, source_ready: true,
    }));
  });

  it('reloads on sale date changes and blocks a source absent from the new stock', async () => {
    const view = render(<Form initial={{ id_production: 11, date_production: '2026-10-20' }} />);
    await waitFor(() => expect(line().source_ready).toBe(true));
    mocks.get.mockResolvedValue([]);
    view.rerender(<Form saleDate="2026-10-19" />);
    await screen.findByText('Aucun stock disponible. Vous pouvez choisir une livraison différée.');
    expect(line().source_ready).toBe(true);
    expect(mocks.get.mock.calls.at(-1)[1].params.through_date).toBe('2026-10-19');
  });

  it('ignores a stale stock response after changing sale date', async () => {
    let resolveOld;
    mocks.get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<Form />);
    mocks.get.mockResolvedValue([]);
    view.rerender(<Form saleDate="2026-10-19" />);
    await screen.findByText('Aucun stock disponible. Vous pouvez choisir une livraison différée.');
    await act(async () => resolveOld(sources));
    expect(screen.queryByText('20/10/26')).not.toBeInTheDocument();
    expect(line().source_ready).toBe(true);
  });

  it('accounts for the same stock reserved in another line', async () => {
    render(<Form otherLines={[{ id_production: 11, quantite: 140 }]} />);
    expect(await screen.findByRole('button', { name: 'Choisir Normaux' })).toBeEnabled();

  });

  it('offers one "Normaux" choice and takes the calibre of the oldest stock', async () => {
    const both = [{ id_produit: 7, nom_produit: 'Oeufs - Moyen' }, { id_produit: 8, nom_produit: 'Oeufs - Gros' }];
    mocks.get.mockResolvedValue([
      { id_production: 21, date_production: '2026-10-22', type_oeuf: 'normal', calibre: 'gros', disponible: 50, vendable: true },
      { id_production: 20, date_production: '2026-10-18', type_oeuf: 'normal', calibre: 'moyen', disponible: 30, vendable: true },
    ]);
    render(<Form produits={both} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Normaux' }));
    expect(screen.queryByRole('button', { name: /Choisir Normaux (Moyen|Gros)/ })).not.toBeInTheDocument();
    await waitFor(() => expect(line()).toMatchObject({ id_produit: 7, id_production: 20, source_available: 30 }));
    expect(screen.getByText(/calibre moyen \(automatique\)/)).toBeVisible();
    expect(screen.getByText(/Aussi en stock : 50 gros/)).toBeVisible();
  });
});
