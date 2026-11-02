import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PartyCreditPanel from './PartyCreditPanel';
import { CORRECTION_EVENT } from './useCorrectionFlow';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/api', () => ({ get }));
vi.mock('./CreditOperationDialog', () => ({ default: ({ action, advance }) => <div role="dialog">{action}:{advance?.id_avance}</div> }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it('shows the net contact credit and unused advance separately, and cancels a whole allocation', async () => {
  get.mockResolvedValue({ balance: '-3', available: '1', advances: [{ id_avance: 'original', nature: 'avance', date_effet: '2026-11-01', montant: '5', available: '1', statut: 'active', reason: 'Avance réelle' }],
    allocations: [{ id_affectation: 'linked', id_transaction_cible: 27, montant: '4', date_effet: '2026-11-01', statut: 'active' }] });
  render(<PartyCreditPanel partyType="client" partyId={7} />);
  await screen.findByText(/Crédit du client/);
  expect(screen.getByText(/Avances reçues disponibles/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Annuler l’enregistrement' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Annuler l’affectation' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('cancel_allocation');
  expect(get).toHaveBeenCalledWith('/credits/party', { params: { id_client: 7 } });
});
it('shows a retrieval failure without presenting an invented zero balance and supports retry', async () => {
  get.mockRejectedValueOnce(new Error('Indisponible')).mockResolvedValueOnce({ balance: '0', available: '0', advances: [], allocations: [] });
  render(<PartyCreditPanel partyType="fournisseur" partyId={2} />);
  await screen.findByText('Indisponible');
  expect(screen.queryByText(/^0(?:,00)?\s*MAD$/)).not.toBeInTheDocument();
  expect(screen.getAllByText('—')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await screen.findByText(/Reste net à payer/);
});
it('keeps an open operation mounted when another tab refreshes the balances', async () => {
  get.mockResolvedValue({ balance: '0', available: '0', advances: [], allocations: [] });
  render(<PartyCreditPanel partyType="client" partyId={7} />);
  await screen.findByText(/Reste net à encaisser/);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une avance reçue' }));
  fireEvent(window, new Event(CORRECTION_EVENT));
  await screen.findByText(/Reste net à encaisser/);
  expect(screen.getByRole('dialog')).toHaveTextContent('advance');
});

it('groups a canceled usage under its canceled advance in collapsed history', async () => {
  get.mockResolvedValue({ balance: '2000', available: '0', advances: [{ id_avance: 'old', nature: 'avance', date_effet: '2026-11-01', montant: '0.50', available: '0', statut: 'annule', reason: 'Avance de test', type_paiement: 'cash' }],
    allocations: [{ id_affectation: 'usage', id_avance: 'old', id_transaction_cible: 14, montant: '0.20', date_effet: '2026-11-01', statut: 'annule' }] });
  render(<PartyCreditPanel partyType="fournisseur" partyId={2} totalActivity={2500} totalTransactions={2} />);
  await screen.findByText('Aucune avance disponible actuellement.');
  const history = screen.getByRole('button', { name: 'Historique', exact: true });
  expect(history).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Avance du 01/11/26')).not.toBeInTheDocument();
  fireEvent.click(history);
  const article = (await screen.findByText('Avance du 01/11/26')).closest('article');
  expect(article).toBeVisible();
  expect(within(article).getByRole('button', { name: 'Utilisations et restitutions' })).toHaveAttribute('aria-expanded', 'true');
  expect(within(article).getByText('Utilisation sur achat n°14')).toBeVisible();
  expect(within(article).getByText('0,20 MAD')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Utiliser' })).not.toBeInTheDocument();
  expect(screen.getAllByText('Reste net à payer')).toHaveLength(1);
});

it('uses the shared disclosure for active advance usages and retains its cancellation action', async () => {
  get.mockResolvedValue({ balance: '10', available: '1', advances: [{ id_avance: 'original', nature: 'avance', date_effet: '2026-11-01', montant: '5', available: '1', statut: 'active', type_paiement: 'cash' }],
    allocations: [{ id_affectation: 'linked', id_avance: 'original', id_transaction_cible: 27, montant: '4', date_effet: '2026-11-01', statut: 'active' }] });
  render(<PartyCreditPanel partyType="client" partyId={7} />);
  const usage = await screen.findByRole('button', { name: 'Utilisations et restitutions' });
  expect(usage).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Annuler l’affectation' })).not.toBeInTheDocument();
  fireEvent.click(usage);
  fireEvent.click(await screen.findByRole('button', { name: 'Annuler l’affectation' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('cancel_allocation');
});
