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
it.each([
  { kind: 'supplier', use: { id_utilisation: 11, type_utilisation: 'fournisseur',
    fournisseur_nom: 'Fournisseur test', id_fournisseur: 5, date_utilisation: '2026-10-03', statut: 'active' },
    label: /Transférée à Fournisseur test/ },
  { kind: 'bank', use: { id_utilisation: 12, type_utilisation: 'banque',
    compte_banque_nom: 'Banque test', id_compte: 3, date_utilisation: '2026-10-03', statut: 'active' },
    label: /Déposée sur Banque test/ },
])('renders the $kind usage from lifecycle history alongside its receipt', async ({ use, label }) => {
  lettreCreditService.getById.mockResolvedValue({
    id_lc: 7, numero_reference: 'LC-TEST', montant: '1.50', statut: 'utilisee', statut_cycle: 'transferee',
    version_utilisation: 1, date_emission: '2026-10-01', date_reception: '2026-10-02',
    date_disponibilite: '2026-10-02', detenteur_nom: 'Client test',
    receptions: [{ id_paiement: 25, date_paiement: '2026-10-02', statut: 'valide' }],
    utilisations: [use],
  });
  get.mockResolvedValue({ history: [] });
  render(<LettreCreditDetail />);
  expect(await screen.findByText(label)).toBeVisible();
  expect(screen.getByText(/Paiement n° 25/)).toBeVisible();
  expect(screen.queryByText('Aucune utilisation sortante enregistrée.')).not.toBeInTheDocument();
  expect(screen.getByText('Aucune cession enregistrée')).toBeVisible();
});

it('keeps a legacy outgoing usage visible without inventing a client receipt', async () => {
  lettreCreditService.getById.mockResolvedValue({
    id_lc: 7, numero_reference: 'LC-TEST', montant: '1.50', statut: 'utilisee', statut_cycle: 'a_verifier',
    version_utilisation: 1, date_emission: '2026-10-01', date_reception: null,
    date_disponibilite: '2026-10-02', detenteur_nom: 'Client test', receptions: [],
    utilisations: [{ id_utilisation: 13, type_utilisation: 'banque',
      compte_banque_nom: 'Banque test', id_compte: 3, date_utilisation: '2026-10-03', statut: 'active' }],
  });
  get.mockResolvedValue({ history: [] });
  render(<LettreCreditDetail />);
  expect(await screen.findByText(/Déposée sur Banque test/)).toBeVisible();
  expect(screen.getByText(/Aucun paiement client par LC/)).toBeVisible();
  expect(screen.queryByText('Aucune utilisation sortante enregistrée.')).not.toBeInTheDocument();
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
