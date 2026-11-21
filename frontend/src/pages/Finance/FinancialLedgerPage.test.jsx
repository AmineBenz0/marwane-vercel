import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceivablesPage } from './FinancialLedgerPage';
import { get, post } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));

describe('FinancialLedgerPage', () => {
  const financialResponse = {
    items: [{ id_transaction: 12, client_nom: 'Client Test', produit_nom: 'Service', date_echeance: '2026-09-01', montant_total: '100.00', montant_restant: '100.00', statut_paiement: 'en_retard', est_en_retard: true }],
    summary: { total: '100.00', paye: '0.00', reste: '100.00', overdue_count: 1 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((path) => {
      if (path === '/clients') return Promise.resolve([{ id_client: 7, nom_client: 'Client Test' }]);
      if (path === '/lettres-credit/disponibles') return Promise.resolve([]);
      return Promise.resolve(financialResponse);
    });
    post.mockResolvedValue({});
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('renders the receivables workflow and confirms a payment', async () => {
    render(<MemoryRouter><ReceivablesPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'À encaisser' })).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: /paiement/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeVisible();
    // Same form as the transaction page; the whole amount owed is prefilled in cash.
    await within(dialog).findAllByText(/Montant restant|Reste/i);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/paiements/batch', {
      paiements: [expect.objectContaining({ id_transaction: 12, montant: 100, type_paiement: 'cash' })],
    }));
  });

  it('shows the empty state when no receivables match', async () => {
    get.mockImplementation((path) => path === '/clients' ? Promise.resolve([]) : Promise.resolve({ items: [], summary: {} }));
    render(<MemoryRouter><ReceivablesPage /></MemoryRouter>);
    expect(await screen.findByText('Aucune créance ne correspond aux filtres.')).toBeVisible();
  });

  it('omits empty optional filters and formats zero overdue counts as a count', async () => {
    get.mockImplementation((path) => path === '/clients' ? Promise.resolve([]) : Promise.resolve({
      items: [],
      summary: { total: '0.00', paye: '0.00', reste: '0.00', overdue_count: 0 },
    }));
    render(<MemoryRouter><ReceivablesPage /></MemoryRouter>);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/transactions/creances', expect.objectContaining({
      params: expect.not.objectContaining({ echeance_debut: '', echeance_fin: '', statut: '', recherche: '' }),
    })));
    expect(await screen.findByText('0', { exact: true })).toBeVisible();
    expect(screen.queryByText('0,00\u00a0MAD')).not.toBeInTheDocument();
  });

  it('keeps primary filters visible and places due dates, sorting, and overdue in advanced filters', async () => {
    render(<MemoryRouter><ReceivablesPage /></MemoryRouter>);

    expect(await screen.findByRole('textbox', { name: 'Rechercher' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Client' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Statut' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Filtres avancés (5)' }));
    expect(await screen.findByLabelText('Échéance à partir du')).toBeVisible();
    expect(screen.getByLabelText('Échéance jusqu’au')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'En retard uniquement' }));

    await waitFor(() => {
      expect(get.mock.calls.some(([path, config]) => (
        path === '/transactions/creances' && config?.params?.overdue_only === true
      ))).toBe(true);
    });
  });

  it('offers only cash, cheque, transfer and letter of credit', async () => {
    render(<MemoryRouter><ReceivablesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /paiement/i }));
    const dialog = await screen.findByRole('dialog');
    const typeSelect = (await within(dialog).findAllByRole('combobox')).find((el) => /Espèces/.test(el.textContent));
    fireEvent.mouseDown(typeSelect);
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent.trim());
    expect(options).toEqual(['Espèces', 'Chèque', 'Virement', 'Lettre de crédit']);
    expect(post).not.toHaveBeenCalled();
  });
});
