import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CompteBancaireList from './CompteBancaireList';
import compteBancaireService from '../../services/compteBancaireService';
import lettreCreditService from '../../services/lettreCreditService';

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('@mui/material', async importOriginal => ({
  ...await importOriginal(),
  useMediaQuery: () => viewport.mobile,
}));
vi.mock('../../services/compteBancaireService', () => ({ default: {
  getComptes: vi.fn(), getMouvements: vi.fn(),
} }));
vi.mock('../../services/lettreCreditService', () => ({ default: { getAvailable: vi.fn() } }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ error: vi.fn() }) }));
vi.mock('../../utils/exportToExcel', () => ({ exportToExcelAdvanced: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  viewport.mobile = false;
  compteBancaireService.getComptes.mockResolvedValue([
    { id_compte: 1, nom_banque: 'Banque test', numero_compte: 'TEST', solde_actuel: '1.25' },
  ]);
  compteBancaireService.getMouvements.mockResolvedValue([
    { id_mouvement: 1, id_compte: 1, montant: '1.50', type_mouvement: 'ENTREE',
      date_mouvement: '2026-11-01T09:00:00Z', source: 'virement' },
    { id_mouvement: 2, id_compte: 1, montant: '0.25', type_mouvement: 'SORTIE',
      date_mouvement: '2026-11-01T10:00:00Z', source: 'virement' },
  ]);
  lettreCreditService.getAvailable.mockResolvedValue([
    { id_lc: 3, numero_reference: 'LC-TEST', montant: '3.75' },
  ]);
});
afterEach(cleanup);

it.each([false, true])('preserves fractional balances and signed movements (mobile=%s)', async mobile => {
  viewport.mobile = mobile;
  render(<CompteBancaireList />);
  expect(await screen.findByText('1,25 MAD')).toBeInTheDocument();
  expect(screen.getByText('1,25')).toBeInTheDocument();
  expect(screen.getAllByText('+1,5 MAD').length).toBeGreaterThan(0);
  expect(screen.getAllByText('-0,25 MAD').length).toBeGreaterThan(0);
  expect(screen.queryByText('+2 MAD')).not.toBeInTheDocument();
});

it('preserves account and credit-letter amounts in movement choices', async () => {
  render(<CompteBancaireList />);
  await screen.findByText('1,25 MAD');
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter mouvement' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Compte bancaire' }));
  fireEvent.click(await screen.findByRole('option', { name: /Banque test - 1,25\sMAD/ }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Type' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Lettre de crédit' }));
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Lettre de crédit' }));
  expect(await screen.findByRole('option', { name: /LC-TEST \(3,75\sMAD\)/ })).toBeInTheDocument();
});
