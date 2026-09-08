import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceivablesPage } from './FinancialLedgerPage';
import { get, post } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn() }));

describe('FinancialLedgerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      items: [{ id_transaction: 12, client_nom: 'Client Test', produit_nom: 'Service', date_echeance: '2026-09-01', montant_total: '100.00', montant_restant: '100.00', statut_paiement: 'en_retard', est_en_retard: true }],
      summary: { total: '100.00', paye: '0.00', reste: '100.00', overdue_count: 1 },
    });
    post.mockResolvedValue({});
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('renders the receivables workflow and confirms a payment', async () => {
    render(<MemoryRouter><ReceivablesPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Créances clients' })).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: /paiement/i }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /marquer comme payé|enregistrer le paiement/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/paiements', expect.objectContaining({ id_transaction: 12, montant: 100, type_paiement: 'cash' })));
  });

  it('shows the empty state when no receivables match', async () => {
    get.mockResolvedValueOnce({ items: [], summary: {} });
    render(<MemoryRouter><ReceivablesPage /></MemoryRouter>);
    expect(await screen.findByText('Aucune créance ne correspond aux filtres.')).toBeVisible();
  });

  it('does not post when the user cancels the financial confirmation', async () => {
    window.confirm.mockReturnValue(false);
    render(<MemoryRouter><ReceivablesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /paiement/i }));
    fireEvent.click(screen.getByRole('button', { name: /marquer comme payé|enregistrer le paiement/i }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(post).not.toHaveBeenCalled();
  });
});
