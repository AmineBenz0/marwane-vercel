import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Caisse from './Caisse';
import { get } from '../../services/api';

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('@mui/material', async original => ({ ...await original(), useMediaQuery: () => viewport.mobile }));
vi.mock('../../services/api', () => ({ get: vi.fn() }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ error: vi.fn() }) }));
vi.mock('../../utils/exportToExcel', () => ({ exportToExcelAdvanced: vi.fn() }));
vi.mock('../../utils/exportToPDF', () => ({ exportCaisseReport: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(path => Promise.resolve(path === '/caisse/solde/complet' ? {
    solde_reel: '1.30', solde_actuel: '1.30', total_lc_disponibles: 0,
  } : path === '/caisse/mouvements' ? [
    { id_mouvement: 1, id_paiement: 26, montant: '1.50', type_mouvement: 'ENTREE', date_mouvement: '2026-11-01T00:00:00Z' },
    { id_mouvement: 2, id_paiement: 27, montant: '0.20', type_mouvement: 'SORTIE', nature_reglement: 'remboursement', date_mouvement: '2026-11-01T00:00:00Z' },
  ] : []));
});
afterEach(cleanup);

it.each([false, true])('shows exact fractional cash movements and refund origin (mobile=%s)', async mobile => {
  viewport.mobile = mobile;
  render(<Caisse />);
  expect(await screen.findByText('Remboursement client')).toBeVisible();
  expect(screen.getAllByText('-0,2 MAD').length).toBeGreaterThan(0);
  expect(screen.getAllByText('+1,5 MAD').length).toBeGreaterThan(0);
  expect(screen.getByText(/Remboursement #27/)).toBeVisible();
  expect(screen.queryByText('-0 MAD')).not.toBeInTheDocument();
});
