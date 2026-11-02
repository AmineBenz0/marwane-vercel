import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LettreCreditDetail from './LettreCreditDetail';
import lettreCreditService from '../../services/lettreCreditService';
import { get } from '../../services/api';
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '7' }), useNavigate: () => vi.fn() }));
vi.mock('../../services/api', () => ({ get: vi.fn() }));
vi.mock('../../services/lettreCreditService', () => ({ default: { getById: vi.fn(), getCessions: vi.fn() } }));
const { notification } = vi.hoisted(() => ({ notification: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../hooks/useNotification', () => ({ default: () => notification }));
beforeEach(() => {
  vi.clearAllMocks();
  lettreCreditService.getById.mockResolvedValue({ id_lc: 7, numero_reference: 'LC-TEST', montant: '1.50', statut: 'utilisee',
    version_utilisation: 1, date_emission: '2026-10-01', date_disponibilite: '2026-10-02', detenteur_nom: 'Client test' });
  lettreCreditService.getCessions.mockResolvedValue([]);
});
afterEach(cleanup);
it.each(['payment', 'deposit'])('displays %s usage without falsely saying there is no usage', async usage => {
  get.mockResolvedValue({ plan: { usage, payment_id: 25, id_compte: 3, date_effet: '2026-10-03' }, history: [] });
  render(<LettreCreditDetail />);
  expect(await screen.findByText(usage === 'payment' ? /Paiement n° 25/ : /Versement bancaire/)).toBeVisible();
  expect(screen.queryByText('Aucune utilisation enregistrée')).not.toBeInTheDocument();
  expect(screen.getByText('Aucune cession enregistrée')).toBeVisible();
});

it('shows corrected reference, serial and issuer in retained history', async () => {
  get.mockResolvedValue({ plan: { usage: 'unused' }, history: [{ operation_id: 'metadata-op', reason: 'Informations corrigées', actor_id: 1,
    recorded_at: '2026-11-02', before: { numero_reference: 'LC-OLD', numero_serie: null, banque_emettrice: 'Ancienne banque' },
    after: { numero_reference: 'LC-NEW', numero_serie: 'SERIE-123', banque_emettrice: 'Banque corrigée' } }] });
  render(<LettreCreditDetail />);
  expect(await screen.findByText('Référence LC : LC-OLD → LC-NEW')).toBeVisible();
  expect(screen.getByText('Numéro de série : Non renseigné → SERIE-123')).toBeVisible();
  expect(screen.getByText('Banque émettrice : Ancienne banque → Banque corrigée')).toBeVisible();
});
