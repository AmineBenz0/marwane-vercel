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
  await screen.findByRole('button', { name: 'Choisir Normaux Moyen' });
};
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async (path) => {
    if (path === '/clients') return [{ id_client: 1, nom_client: 'Client test' }];
    if (path === '/batiments') return [{ id_batiment: 1, nom: 'Bâtiment A' }, { id_batiment: 2, nom: 'Bâtiment B' }];
    if (path === '/transactions/production-sources') return sources;
    return [];
  });
  getProduitsParType.mockResolvedValue([
    { id_produit: 7, nom_produit: 'Oeufs - Moyen' },
    { id_produit: 8, nom_produit: 'Oeufs - Gros' },
  ]);
});
afterEach(cleanup);

describe('sale entry preserves user input', () => {
  it('preserves an existing deferred sale and its expected date when editing the price', async () => {
    const submit = vi.fn();
    render(<TransactionForm {...props} onSubmit={submit} initialValues={{
      id_transaction: 31, id_client: 1, id_produit: 7, id_batiment: 1,
      date_transaction: '2026-10-21', date_livraison_prevue: '2099-10-29',
      quantite: 1000, prix_unitaire: 1.5, est_promesse: true, allocation_automatique: true,
    }} />);
    expect(await screen.findByRole('checkbox', { name: 'Livraison différée' })).toBeChecked();
    expect(screen.getByLabelText(/Date prévue de livraison/)).toHaveValue('2099-10-29');
    await screen.findByRole('button', { name: 'Choisir Normaux Moyen' });
    fireEvent.change(price(), { target: { value: '1.6' } });
    const save = screen.getByRole('button', { name: 'Enregistrer les modifications' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0]).toMatchObject({
      est_promesse: true, date_livraison_prevue: '2099-10-29', prix_unitaire: 1.6,
    });
  });

  it.each([600, 0])('submits deferred delivery with %i eggs available and blocks an unaccepted shortage', async (available) => {
    get.mockImplementation(async (path) => {
      if (path === '/clients') return [{ id_client: 1, nom_client: 'Client test' }];
      if (path === '/batiments') return [{ id_batiment: 1, nom: 'Bâtiment A' }];
      if (path === '/transactions/production-sources') return available ? [{ ...sources[0], disponible: available }] : [];
      return [];
    });
    render(<TransactionForm {...props} />);
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: /^Client/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Client test' }));
    fireEvent.change(quantity(), { target: { value: '1000' } });
    fireEvent.change(price(), { target: { value: '1.20' } });
    await selectBuilding('Bâtiment A');
    fireEvent.click(screen.getByRole('button', { name: 'Choisir Normaux Moyen' }));
    expect(await screen.findByText(`Les ${(1000 - available).toLocaleString('fr-FR').replace(/\s/g, ' ')} œufs manquants seront fournis ultérieurement.`)).toBeVisible();
    const save = screen.getByRole('button', { name: 'Enregistrer la vente' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Livraison différée' }));
    fireEvent.change(screen.getByLabelText(/Date prévue de livraison/), { target: { value: '2099-10-26' } });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalled());
    expect(props.onSubmit.mock.calls[0][0].transactions[0]).toMatchObject({ quantite: 1000, prix_unitaire: 1.2, est_promesse: true, date_livraison_prevue: '2099-10-26' });
  });

  it('keeps price and quantity entered before selecting a building and stock row', async () => {
    render(<TransactionForm {...props} />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/batiments'));
    fireEvent.change(quantity(), { target: { value: '50' } });
    fireEvent.change(price(), { target: { value: '1.25' } });
    await selectBuilding('Bâtiment A');
    fireEvent.click(screen.getByRole('button', { name: 'Choisir Normaux Moyen' }));
    expect(quantity()).toHaveValue(50);
    expect(price()).toHaveValue(1.25);
    fireEvent.click(screen.getByRole('button', { name: 'Choisir Normaux Gros' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Choisir Normaux Moyen' }));
    await screen.findByText(/Les 10 œufs manquants/);
    expect(quantity()).toHaveValue(70);
    expect(price()).toHaveValue(2.5);
    await selectBuilding('Bâtiment B');
    expect(quantity()).toHaveValue(70);
    expect(price()).toHaveValue(2.5);
  });
});
