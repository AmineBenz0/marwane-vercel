import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionForm from './TransactionForm';
import { get, getProduitsParType } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), getProduitsParType: vi.fn() }));
const sources = [
  { id_production: 11, date_production: '2026-10-20', type_oeuf: 'normal', calibre: 'moyen', grammage: 55, nombre_oeufs: 100, disponible: 60, vendable: true },
  { id_production: 12, date_production: '2026-10-21', type_oeuf: 'normal', calibre: 'gros', grammage: 66, nombre_oeufs: 80, disponible: 80, vendable: true },
];
const props = { open: true, onClose: vi.fn(), onSubmit: vi.fn() };
const quantity = () => screen.getByRole('spinbutton', { name: /Quantite vendue/ });
const price = () => screen.getByRole('spinbutton', { name: /Prix unitaire/ });
const selectBuilding = async (name) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Bâtiment source/ }));
  fireEvent.click(await screen.findByRole('option', { name, exact: true }));
  await screen.findByRole('button', { name: 'Choisir Normaux Moyen du 20/10/26' });
};
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async (path) => {
    if (path === '/batiments') return [{ id_batiment: 1, nom: 'Bâtiment A' }, { id_batiment: 2, nom: 'Bâtiment B' }];
    if (path === '/transactions/production-sources') return sources;
    return [];
  });
  getProduitsParType.mockResolvedValue([]);
});
afterEach(cleanup);

describe('sale entry preserves user input', () => {
  it('keeps price and quantity entered before selecting a building and stock row', async () => {
    render(<TransactionForm {...props} />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/batiments'));
    fireEvent.change(quantity(), { target: { value: '50' } });
    fireEvent.change(price(), { target: { value: '1.25' } });
    await selectBuilding('Bâtiment A');
    fireEvent.click(screen.getByRole('button', { name: 'Choisir Normaux Moyen du 20/10/26' }));
    expect(quantity()).toHaveValue(50);
    expect(price()).toHaveValue(1.25);
    fireEvent.click(screen.getByRole('button', { name: 'Choisir Normaux Gros du 21/10/26' }));
    expect(quantity()).toHaveValue(50);
    expect(price()).toHaveValue(1.25);
    expect(screen.getByText('Total de la ligne : 62.50 MAD')).toBeVisible();
  });

  it('preserves draft values across parent rerenders and flags an excessive quantity', async () => {
    const view = render(<TransactionForm {...props} initialValues={{}} />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/batiments'));
    fireEvent.change(quantity(), { target: { value: '70' } });
    fireEvent.change(price(), { target: { value: '2.5' } });
    view.rerender(<TransactionForm {...props} initialValues={{}} />);
    expect(quantity()).toHaveValue(70);
    expect(price()).toHaveValue(2.5);
    await selectBuilding('Bâtiment A');
    fireEvent.click(screen.getByRole('button', { name: 'Choisir Normaux Moyen du 20/10/26' }));
    await screen.findAllByText('La quantité dépasse le stock disponible de cette saisie.');
    expect(quantity()).toHaveValue(70);
    expect(price()).toHaveValue(2.5);
    await selectBuilding('Bâtiment B');
    expect(quantity()).toHaveValue(70);
    expect(price()).toHaveValue(2.5);
  });
});
