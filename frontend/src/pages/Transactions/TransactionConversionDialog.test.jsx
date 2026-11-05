import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TransactionConversionDialog from './TransactionConversionDialog';
import { post } from '../../services/api';

vi.mock('../../services/api', () => ({ post: vi.fn() }));
const source = { id_transaction: 7, id_client: 3, id_fournisseur: null,
  row_version: 6, quantite: 2, prix_unitaire: '20.00' };
const products = [
  { id_produit: 11, nom_produit: 'Aliment de poule', usage: 'achete', est_actif: true },
  { id_produit: 12, nom_produit: 'Œufs - Gros', usage: 'achete', est_actif: true },
  { id_produit: 13, nom_produit: 'Service vendu', usage: 'vendu', est_actif: true },
];
const suppliers = [{ id_fournisseur: 4, nom_fournisseur: 'Ferme locale', est_actif: true }];
const preview = {
  id_transaction_origine: 7, expected_version: 6,
  dependency_fingerprint: 'a'.repeat(64), type_origine: 'vente', type_cible: 'achat',
  nom_produit_cible: 'Aliment de poule', quantite: 2, prix_unitaire: '20.00',
  montant_total_cible: '40.00', stock: { origine: 'aucun', cible: 'entree',
    quantite_cible: 2, soldes_finaux: {} }, paiements_a_annuler: [
      { id_paiement: 9, montant: '20.00', type_paiement: 'cash' },
  ],
};
const props = () => ({ transaction: source, products, suppliers,
  clients: [], onConverted: vi.fn(), onClose: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  post.mockImplementation(async (path) => path.endsWith('/preview') ? preview
    : { id_transaction_origine: 7, id_transaction_remplacement: 8 });
});
afterEach(cleanup);

async function inspect() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Fournisseur' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Ferme locale' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Produit' }));
  expect(screen.queryByRole('option', { name: 'Œufs - Gros' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('option', { name: 'Aliment de poule' }));
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier la conversion' }));
  await screen.findByRole('button', { name: 'Confirmer la conversion' });
}

it('previews the opposite-side replacement and asks consent only for existing payments', async () => {
  const p = props();
  render(<TransactionConversionDialog {...p} />);
  await inspect();
  expect(post.mock.calls[0]).toEqual(['/transactions/7/conversion/preview', {
    expected_version: 6, id_contact_cible: 4, id_produit_cible: 11,
    quantite: 2, prix_unitaire: '20.00',
  }]);
  const confirm = screen.getByRole('button', { name: 'Confirmer la conversion' });
  expect(confirm).toBeDisabled();
  expect(screen.getByText(/seront annulés avec leurs mouvements/)).toBeVisible();
  expect(screen.queryByRole('textbox', { name: /Motif|Commentaire|Notes/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmer l’annulation des règlements existants' }));
  fireEvent.click(confirm);
  await waitFor(() => expect(p.onConverted).toHaveBeenCalledOnce());
  expect(post.mock.calls[1][0]).toBe('/transactions/7/conversion/apply');
  expect(post.mock.calls[1][1]).toMatchObject({
    expected_version: 6, annuler_paiements_existants: true,
    dependency_fingerprint: 'a'.repeat(64),
  });
  expect(post.mock.calls[1][1].operation_id).toBeTruthy();
});

it('retries the exact same operation after an uncertain response', async () => {
  const p = props();
  post.mockImplementationOnce(async () => preview)
    .mockRejectedValueOnce({ status: 503 })
    .mockResolvedValueOnce({ id_transaction_remplacement: 8 });
  render(<TransactionConversionDialog {...p} />);
  await inspect();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmer l’annulation des règlements existants' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la conversion' }));
  await screen.findByText(/La réponse n’a pas été reçue/);
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier l’enregistrement' }));
  await waitFor(() => expect(p.onConverted).toHaveBeenCalledOnce());
  expect(post.mock.calls[2][1]).toEqual(post.mock.calls[1][1]);
});

it('blocks a stale review and never silently confirms new financial effects', async () => {
  post.mockImplementationOnce(async () => preview)
    .mockRejectedValueOnce({ status: 409, message: 'Le stock a changé.' });
  const p = props();
  render(<TransactionConversionDialog {...p} />);
  await inspect();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmer l’annulation des règlements existants' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la conversion' }));
  expect(await screen.findByText('Le stock a changé.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Confirmer la conversion' })).toBeDisabled();
  expect(p.onConverted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revenir aux champs' }));
  expect(screen.getByRole('button', { name: 'Vérifier la conversion' })).toBeEnabled();
});

it('does not add a payment confirmation checkbox to an unpaid conversion', async () => {
  post.mockResolvedValueOnce({ ...preview, paiements_a_annuler: [] })
    .mockResolvedValueOnce({ id_transaction_remplacement: 8 });
  render(<TransactionConversionDialog {...props()} />);
  await inspect();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la conversion' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[1][1].annuler_paiements_existants).toBe(false);
});
