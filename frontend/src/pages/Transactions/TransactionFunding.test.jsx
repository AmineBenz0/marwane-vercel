import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionForm from './TransactionForm';
import { get, getProduitsParType } from '../../services/api';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../services/api', () => ({ get: vi.fn(), getProduitsParType: vi.fn() }));

const transaction = {
  id_transaction: 10, id_fournisseur: 1, id_produit: 1,
  date_transaction: '2026-10-22', quantite: 1, prix_unitaire: 100,
};
const supplier = { id_fournisseur: 1, nom_fournisseur: 'Supplier', mode_reglement_prefere: 'banque' };
let existingPayments;

beforeEach(() => {
  existingPayments = [];
  get.mockImplementation(async (path) => {
    if (path === '/fournisseurs') return [supplier];
    if (path === '/comptes-bancaires') return [
      { id_compte: 1, nom_banque: 'Bank A', numero_compte: '001' },
      { id_compte: 2, nom_banque: 'Bank B', numero_compte: '002' },
    ];
    if (path === '/paiements') return existingPayments;
    return [];
  });
  getProduitsParType.mockResolvedValue([{ id_produit: 1, nom_produit: 'Supplier input' }]);
});
afterEach(cleanup);

describe('Supplier funding while editing a transaction', () => {
  it('allows a new cash payment to use the second bank account on an existing unpaid transaction', async () => {
    const submit = vi.fn();
    render(<TransactionForm open initialValues={transaction} onClose={vi.fn()} onSubmit={submit} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Fournisseur/ })).toHaveTextContent('Supplier'));
    fireEvent.click(screen.getByRole('radio', { name: 'Payer maintenant' }));
    const account = await screen.findByRole('combobox', { name: /Compte bancaire/ });
    expect(account).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('combobox', { name: 'Mode de paiement' })).toHaveTextContent('Virement');
    fireEvent.mouseDown(account);
    fireEvent.click(await screen.findByRole('option', { name: 'Bank B · 002' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Mode de paiement' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Espèces' }));
    expect(screen.getByRole('combobox', { name: /Compte bancaire/ })).toHaveTextContent('Bank B');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].paiements[0]).toMatchObject({
      source_reglement: 'banque', id_compte: 2, type_paiement: 'cash',
    });
  });

  it('keeps a saved caisse payment unchanged when the supplier now prefers bank funding', async () => {
    existingPayments = [{
      id_paiement: 7, date_paiement: '2026-10-22', montant: 100,
      type_paiement: 'cash', source_reglement: 'caisse', id_compte: null,
    }];
    render(<TransactionForm open initialValues={{ ...transaction, montant_total: 100, paiements: existingPayments }} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText(/Seule la date d’échéance peut être modifiée ici/)).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: /^Prix unitaire/ })).toHaveAttribute('readonly');
    expect(screen.queryByRole('combobox', { name: 'Mode de paiement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Compte bancaire/ })).not.toBeInTheDocument();
  });
});

