import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  await screen.findByText(/Crédit net de ce contact/);
  expect(screen.getByText(/Avances encore disponibles/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Annuler l’enregistrement' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Annuler l’affectation' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('cancel_allocation');
  expect(get).toHaveBeenCalledWith('/credits/party', { params: { id_client: 7 } });
});
it('shows a retrieval failure without presenting an invented zero balance and supports retry', async () => {
  get.mockRejectedValueOnce(new Error('Indisponible')).mockResolvedValueOnce({ balance: '0', available: '0', advances: [], allocations: [] });
  render(<PartyCreditPanel partyType="fournisseur" partyId={2} />);
  await screen.findByText('Indisponible');
  expect(screen.queryByText(/Reste net à payer/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await screen.findByText(/Reste net à payer/);
});
it('keeps an open operation mounted when another tab refreshes the balances', async () => {
  get.mockResolvedValue({ balance: '0', available: '0', advances: [], allocations: [] });
  render(<PartyCreditPanel partyType="client" partyId={7} />);
  await screen.findByText(/Reste net à encaisser/);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une avance' }));
  fireEvent(window, new Event(CORRECTION_EVENT));
  await screen.findByText(/Reste net à encaisser/);
  expect(screen.getByRole('dialog')).toHaveTextContent('advance');
});
