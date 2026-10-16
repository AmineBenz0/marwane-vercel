import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionForm from './ProductionForm';
import { get, post, put } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));

const renderForm = (extra = {}) => render(<ProductionForm open onClose={vi.fn()} onSuccess={vi.fn()}
  batiments={[{ id_batiment: 7, nom: 'Bâtiment 7' }]} preselectedBatimentId={7} preselectedDate="2026-10-01" {...extra} />);

const selectVaccine = async (name = 'MA5') => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Vaccin' }));
  fireEvent.click(await screen.findByRole('option', { name }));
};

describe('Daily vaccine expenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((path) => {
      if (path === '/vaccins') return Promise.resolve([{ id_vaccin: 3, nom: 'MA5', prix_defaut: '45.00', unite: 'unité' }]);
      return Promise.resolve([]);
    });
    post.mockResolvedValue({});
    put.mockResolvedValue({});
  });

  it('uses the saved tariff automatically and allows a one-entry price override', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ajouter un vaccin' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un vaccin' }));
    await selectVaccine();
    expect(screen.getByRole('combobox', { name: 'Payé depuis' })).toHaveTextContent('Caisse');
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '2' } });
    expect(screen.getByText(/2 unités ×/)).toBeVisible();
    expect(screen.getByText(/Total :/).parentElement).toHaveTextContent(/90/);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le prix' }));
    fireEvent.change(screen.getByLabelText('Prix unitaire (DH)'), { target: { value: '50.25' } });
    expect(screen.getAllByText(/100,50/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/productions/daily', expect.objectContaining({
      depenses_vaccins: [{ id_vaccin: 3, quantite: '2', prix_unitaire: '50.25', id_compte: null }],
    })));
  });

  it('updates catalogue prices for future entries while preserving current line snapshots', async () => {
    put.mockImplementation((path) => path === '/vaccins/3/prix'
      ? Promise.resolve({ id_vaccin: 3, nom: 'MA5', prix_defaut: '52.00', unite: 'unité' })
      : Promise.resolve({}));
    renderForm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gérer les tarifs' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Gérer les tarifs' }));
    fireEvent.change(screen.getByLabelText('Tarif MA5 (DH)'), { target: { value: '52' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Tarifs des vaccins' })).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/vaccins/3/prix', { prix_defaut: '52' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un vaccin' }));
    await selectVaccine();
    expect(screen.getByText(/45/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 unité ×/)).toBeVisible();
    expect(screen.getByText(/52/)).toBeVisible();
  });

  it('restores the saved price and expense version instead of the new catalogue price', async () => {
    const fallback = get.getMockImplementation();
    get.mockImplementation((path, ...args) => path === '/productions/daily' ? Promise.resolve({
      records: [{ id_production: 1, type_oeuf: 'normal', nombre_oeufs: 10, grammage: 60 }],
      versions: { 1: 'row-version' }, charge_versions: { 9: 'expense-version' },
      depenses_vaccins: [{ id_charge: 9, id_vaccin: 3, nom_vaccin: 'MA5', unite: 'unité', quantite: '2.000', prix_unitaire: '50.25', id_compte: null }],
    }) : fallback(path, ...args));
    renderForm({ initialData: { id_batiment: 7, date_production: '2026-10-01' } });
    expect(await screen.findByText(/2 unités ×/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier le prix' })).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mettre a jour' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Mettre a jour' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/productions/daily', expect.objectContaining({
      charge_versions: { 9: 'expense-version' },
      depenses_vaccins: [{ id_charge: 9, id_vaccin: 3, quantite: '2.000', prix_unitaire: '50.25', id_compte: null }],
    })));
  });

  it('requires a price when a vaccine has no saved catalogue tariff', async () => {
    get.mockImplementation((path) => path === '/vaccins'
      ? Promise.resolve([{ id_vaccin: 3, nom: 'MA5', prix_defaut: null, unite: 'unité' }])
      : Promise.resolve([]));
    renderForm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ajouter un vaccin' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un vaccin' }));
    await selectVaccine();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Indiquez le prix')).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });
});
