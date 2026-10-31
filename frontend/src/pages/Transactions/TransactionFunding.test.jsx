import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

describe('Supplier payments stay separate from transaction corrections', () => {
  it('opens the shared correction editor for an unpaid purchase without creating payments', async () => {
    const submit = vi.fn();
    render(<TransactionForm open initialValues={{ ...transaction, row_version: 1 }} onClose={vi.fn()} onSubmit={submit} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Fournisseur/ })).toHaveTextContent('Supplier'));
    expect(screen.queryByRole('radio', { name: 'Payer maintenant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Mode de paiement' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /^Prix unitaire/ })).not.toHaveAttribute('readonly');
    expect(submit).not.toHaveBeenCalled();
  });
  it('does not adopt the supplier’s new bank preference while correcting a transaction', async () => {
    existingPayments = [{ id_paiement: 7, date_paiement: '2026-10-22', montant: 100,
      type_paiement: 'cash', source_reglement: 'caisse', id_compte: null }];
    render(<TransactionForm open initialValues={{ ...transaction, row_version: 1, montant_total: 100, paiements: existingPayments }} onClose={vi.fn()} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Fournisseur/ })).toHaveTextContent('Supplier'));
    expect(screen.getByRole('spinbutton', { name: /^Prix unitaire/ })).not.toHaveAttribute('readonly');
    expect(screen.queryByRole('combobox', { name: /Compte bancaire/ })).not.toBeInTheDocument();
    expect(existingPayments[0]).toMatchObject({ source_reglement: 'caisse', id_compte: null });
  });
});
