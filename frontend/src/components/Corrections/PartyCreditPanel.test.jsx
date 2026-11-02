import { useState } from 'react';
import { Dialog } from '@mui/material';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PartyCreditPanel from './PartyCreditPanel';
import PartyCreditMenu from './PartyCreditMenu';
import { CORRECTION_EVENT } from './useCorrectionFlow';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/api', () => ({ get }));
vi.mock('./CreditOperationDialog', () => ({ default: ({ action, advance, onClose }) => <Dialog open PaperProps={{ 'aria-label': 'Opération de crédit' }}>{action}:{advance?.id_avance}<button onClick={onClose}>Fermer l’opération</button></Dialog> }));
vi.mock('./AdvanceSettlementDialog', () => ({ default: ({ advance, onClose }) => <Dialog open PaperProps={{ 'aria-label': 'Utiliser les avances' }}>{advance?.id_avance || 'toutes'}<button onClick={onClose}>Fermer le règlement</button></Dialog> }));
const empty = { balance: '0', available: '0', advances: [], allocations: [] };
function Profile({ initialOpen = false, ...props }) {
  const [open, setOpen] = useState(initialOpen);
  return <><PartyCreditMenu onOpen={() => setOpen(true)} /><PartyCreditPanel partyType="client" partyId={7} partyName="Contact test" {...props} open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} /></>;
}
const openFromMenu = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Autres actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Avances et crédits' }));
  return screen.findByRole('dialog', { name: 'Avances et crédits' });
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('keeps two summary cards and opens credit details only from the discreet available-advance link', async () => {
  get.mockResolvedValue({ ...empty, balance: '-3', available: '1', advances: [{ id_avance: 'original', nature: 'avance', date_effet: '2026-11-01', montant: '5', available: '1', statut: 'active', reason: 'Avance réelle' }],
    allocations: [{ id_affectation: 'linked', id_transaction_cible: 27, montant: '4', date_effet: '2026-11-01', statut: 'active' }] });
  render(<Profile totalActivity={500} />);
  await screen.findByText('Crédit du client');
  expect(screen.getByText('Total ventes')).toBeVisible();
  expect(screen.queryByText('Avances reçues disponibles')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Avances et crédits' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Enregistrer une avance reçue' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Avance disponible/ }));
  const drawer = await screen.findByRole('dialog', { name: 'Avances et crédits' });
  expect(within(drawer).getByText('Contact test')).toBeVisible();
  expect(within(drawer).getByText('Avances reçues disponibles')).toBeVisible();
  fireEvent.click(within(drawer).getByRole('button', { name: 'Annuler l’affectation' }));
  expect(screen.getByRole('dialog', { name: 'Opération de crédit' })).toHaveTextContent('cancel_allocation');
  expect(get).toHaveBeenCalledOnce();
  expect(get).toHaveBeenCalledWith('/credits/party', { params: { id_client: 7 } });
});

it('shows a retrieval failure without invented zero balances and supports retry', async () => {
  get.mockRejectedValueOnce(new Error('Indisponible')).mockResolvedValueOnce(empty);
  render(<Profile partyType="fournisseur" partyId={2} />);
  await screen.findByText('Indisponible');
  expect(screen.queryByText(/^0(?:,00)?\s*MAD$/)).not.toBeInTheDocument();
  expect(screen.getAllByText('—')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await screen.findByText('Après les règlements enregistrés');
  expect(screen.queryByRole('button', { name: /Avance disponible/ })).not.toBeInTheDocument();
});

it('keeps an operation mounted during a balance refresh and prevents closing its drawer', async () => {
  get.mockResolvedValue(empty);
  render(<Profile />);
  await screen.findByText('Après les règlements enregistrés');
  const drawer = await openFromMenu();
  fireEvent.click(within(drawer).getByRole('button', { name: 'Enregistrer une avance reçue' }));
  fireEvent(window, new Event(CORRECTION_EVENT));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('dialog', { name: 'Opération de crédit' })).toHaveTextContent('advance');
  expect(within(drawer).getByRole('button', { name: 'Fermer', exact: true, hidden: true })).toBeDisabled();
  fireEvent.keyDown(drawer, { key: 'Escape', code: 'Escape' });
  expect(drawer).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fermer l’opération' }));
  await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Fermer', exact: true })).toBeEnabled());
});

it('groups canceled usages in the collapsed history inside the secondary drawer', async () => {
  get.mockResolvedValue({ balance: '2000', available: '0', advances: [{ id_avance: 'old', nature: 'avance', date_effet: '2026-11-01', montant: '0.50', available: '0', statut: 'annule', reason: 'Avance de test', type_paiement: 'cash' }],
    allocations: [{ id_affectation: 'usage', id_avance: 'old', id_transaction_cible: 14, montant: '0.20', date_effet: '2026-11-01', statut: 'annule' }] });
  render(<Profile partyType="fournisseur" partyId={2} totalActivity={2500} totalTransactions={2} />);
  await screen.findByText('Après les règlements enregistrés');
  expect(screen.queryByText('Historique')).not.toBeInTheDocument();
  const drawer = await openFromMenu();
  const history = within(drawer).getByRole('button', { name: 'Historique', exact: true });
  expect(history).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(history);
  const article = (await screen.findByText('Avance du 01/11/26')).closest('article');
  expect(within(article).getByRole('button', { name: 'Utilisations et restitutions' })).toHaveAttribute('aria-expanded', 'true');
  expect(within(article).getByText('Utilisation sur achat n°14')).toBeVisible();
  expect(within(article).getByText('0,20 MAD')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Utiliser', exact: true })).not.toBeInTheDocument();
});

it('retains a specific advance settlement and grouped allocation cancellation', async () => {
  get.mockResolvedValue({ balance: '10', available: '1', advances: [{ id_avance: 'original', nature: 'avance', date_effet: '2026-11-01', montant: '5', available: '1', statut: 'active', type_paiement: 'cash' }],
    allocations: [{ id_affectation: 'linked', id_avance: 'original', id_transaction_cible: 27, montant: '4', date_effet: '2026-11-01', statut: 'active' }] });
  render(<Profile initialOpen />);
  const usage = await screen.findByRole('button', { name: 'Utilisations et restitutions' });
  expect(usage).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Utiliser', exact: true }));
  expect(screen.getByRole('dialog', { name: 'Utiliser les avances' })).toHaveTextContent('original');
  fireEvent.click(screen.getByRole('button', { name: 'Fermer le règlement' }));
  fireEvent.click(usage);
  fireEvent.click(await screen.findByRole('button', { name: 'Annuler l’affectation' }));
  expect(screen.getByRole('dialog', { name: 'Opération de crédit' })).toHaveTextContent('cancel_allocation');
});

it('keeps the menu available on other tabs and opens the empty supplier drawer', async () => {
  get.mockResolvedValue(empty);
  render(<Profile showSummary={false} partyType="fournisseur" partyId={2} />);
  expect(screen.queryByText('Total achats')).not.toBeInTheDocument();
  const drawer = await openFromMenu();
  await within(drawer).findByText('Aucune avance disponible actuellement.');
  expect(within(drawer).getByRole('button', { name: 'Enregistrer une avance versée' })).toBeVisible();
  fireEvent.click(within(drawer).getByRole('button', { name: 'Fermer', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Autres actions' })).toBeEnabled();
});

it('removes the available-advance hint when the last advance is used and balances refresh', async () => {
  get.mockResolvedValueOnce({ ...empty, available: '1', balance: '10' }).mockResolvedValueOnce({ ...empty, balance: '10' });
  render(<Profile />);
  expect(await screen.findByRole('button', { name: /Avance disponible/ })).toBeVisible();
  fireEvent(window, new Event(CORRECTION_EVENT));
  await screen.findByText('Après les règlements enregistrés');
  expect(screen.queryByRole('button', { name: /Avance disponible/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Aucune avance disponible actuellement.')).not.toBeInTheDocument();
});
