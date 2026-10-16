import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionForm from './ProductionForm';
import { get, post, put } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));

const renderForm = (extra = {}) => render(<ProductionForm open onClose={vi.fn()} onSuccess={vi.fn()}
  batiments={[{ id_batiment: 7, nom: 'B�timent 7' }]} preselectedBatimentId={7} preselectedDate="2026-10-01" {...extra} />);

describe('Daily vaccine expenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((path) => {
      if (path === '/vaccins') return Promise.resolve([{ id_vaccin: 3, nom: 'MA5', prix_defaut: '45.00', unite: 'unit�' }]);
      return Promise.resolve([]);
    });
    post.mockResolvedValue({});
    put.mockResolvedValue({});
  });

  it('prefills the catalogue price, accepts an override and saves an expense-only day', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ajouter un vaccin' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un vaccin' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Vaccin' }));
    fireEvent.click(await screen.findByRole('option', { name: 'MA5' }));
    const price = screen.getByLabelText('Prix unitaire (DH)');
    expect(price).toHaveValue(45);
    fireEvent.change(price, { target: { value: '50.25' } });
    fireEvent.change(screen.getByLabelText('Quantit�'), { target: { value: '2' } });
    expect(screen.getAllByText(/100,50/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/productions/daily', expect.objectContaining({
      depenses_vaccins: [{ id_vaccin: 3, quantite: '2', prix_unitaire: '50.25', id_compte: null }],
    })));
  });

  it('restores the saved price and expense version instead of the new catalogue price', async () => {
    const fallback = get.getMockImplementation();
    get.mockImplementation((path, ...args) => path === '/productions/daily' ? Promise.resolve({
      records: [{ id_production: 1, type_oeuf: 'normal', nombre_oeufs: 10, grammage: 60 }],
      versions: { 1: 'row-version' }, charge_versions: { 9: 'expense-version' },
      depenses_vaccins: [{ id_charge: 9, id_vaccin: 3, nom_vaccin: 'MA5', unite: 'unit�', quantite: '2.000', prix_unitaire: '50.25', id_compte: null }],
    }) : fallback(path, ...args));
    renderForm({ initialData: { id_batiment: 7, date_production: '2026-10-01' } });
    expect(await screen.findByLabelText('Prix unitaire (DH)')).toHaveValue(50.25);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mettre a jour' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Mettre a jour' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/productions/daily', expect.objectContaining({
      charge_versions: { 9: 'expense-version' },
      depenses_vaccins: [{ id_charge: 9, id_vaccin: 3, quantite: '2.000', prix_unitaire: '50.25', id_compte: null }],
    })));
  });

  it('requires a vaccine and price for each added line', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ajouter un vaccin' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un vaccin' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer' }).closest('form'));
    expect(await screen.findByText('S�lectionnez un vaccin')).toBeVisible();
    expect(await screen.findByText('Indiquez le prix')).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });
});

