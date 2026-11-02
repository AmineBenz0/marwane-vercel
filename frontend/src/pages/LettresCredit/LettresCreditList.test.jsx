import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LettresCreditList from './LettresCreditList';
import lettreCreditService from '../../services/lettreCreditService';
import { get } from '../../services/api';
vi.mock('../../services/api', () => ({ get: vi.fn() }));
vi.mock('../../services/lettreCreditService', () => ({ default: { getAll: vi.fn() } }));
const { notification } = vi.hoisted(() => ({ notification: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../hooks/useNotification', () => ({ default: () => notification }));
beforeEach(() => {
  vi.clearAllMocks();
  lettreCreditService.getAll.mockResolvedValue([{ id_lc: 7, numero_reference: 'LC-TEST', montant: '1.50',
    statut: 'active', est_disponible: true, version_utilisation: 0, date_disponibilite: '2026-10-01', detenteur_nom: 'Client test' }]);
  get.mockImplementation(async path => path === '/comptes-bancaires'
    ? [{ id_compte: 3, nom_banque: 'Banque test', numero_compte: 'TEST-003' }] : []);
});
afterEach(cleanup);
it('shows the bank name and account number for an LC deposit', async () => {
  render(<MemoryRouter><LettresCreditList /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Verser banque' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Compte bancaire/ }));
  expect(await screen.findByRole('option', { name: 'Banque test · TEST-003' })).toBeVisible();
});
