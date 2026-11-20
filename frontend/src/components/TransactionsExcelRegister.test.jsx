import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TransactionsExcelRegister from './TransactionsExcelRegister';

const formatMontant = (value) => `${Number(value || 0)} MAD`;

const baseSale = {
  id_transaction: 1,
  date_transaction: '2026-11-19',
  id_client: 1,
  id_fournisseur: null,
  id_produit: 1,
  quantite: 10,
  montant_total: '100.00',
  montant_net: '100.00',
  est_actif: true,
  statut_paiement: 'partiel',
};

const renderRegister = (rows) => render(
  <TransactionsExcelRegister
    rows={rows}
    getClientOuFournisseur={() => 'Client Test'}
    produitsMap={new Map([[1, 'Œufs']])}
    formatMontant={formatMontant}
  />,
);

describe('TransactionsExcelRegister payment lines', () => {
  it('hides cancelled payments and labels refunds and credits', () => {
    renderRegister([{
      ...baseSale,
      montant_paye: '7.00',
      montant_restant: '93.00',
      paiements: [
        { id_paiement: 1, type_paiement: 'cash', nature: 'paiement', statut: 'valide', montant: '12.00' },
        { id_paiement: 2, type_paiement: 'cash', nature: 'remboursement', statut: 'valide', montant: '5.00' },
        { id_paiement: 3, type_paiement: 'cash', nature: 'paiement', statut: 'annule', montant: '500.00' },
      ],
    }]);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Espèce · 12 MAD')).toBeInTheDocument();
    expect(within(table).getByText('Remboursement · Espèce · −5 MAD')).toBeInTheDocument();
    expect(within(table).queryByText(/500 MAD/)).not.toBeInTheDocument();
  });

  it('flags a cheque without reference and caps the list at two lines', () => {
    renderRegister([{
      ...baseSale,
      montant_paye: '60.00',
      montant_restant: '40.00',
      paiements: [
        { id_paiement: 1, type_paiement: 'cheque', nature: 'paiement', statut: 'valide', montant: '10.00' },
        { id_paiement: 2, type_paiement: 'virement', nature: 'paiement', statut: 'valide', montant: '20.00', reference_virement: 'VIR-1' },
        { id_paiement: 3, type_paiement: 'cash', nature: 'paiement', statut: 'valide', montant: '30.00' },
      ],
    }]);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Chèque · sans réf. · 10 MAD')).toBeInTheDocument();
    expect(within(table).getByText('Virement n° VIR-1 · 20 MAD')).toBeInTheDocument();
    expect(within(table).getByText('+ 1 autre paiement')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Total net' })).toBeInTheDocument();
  });
});

describe('TransactionsExcelRegister row actions on the card layout', () => {
  const useCardLayout = () => {
    const original = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: true, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    });
    return () => { window.matchMedia = original; };
  };

  const renderCards = (handlers) => render(
    <TransactionsExcelRegister
      rows={[{ ...baseSale, montant_paye: '0.00', montant_restant: '100.00', paiements: [] }]}
      getClientOuFournisseur={() => 'Client Test'}
      produitsMap={new Map([[1, 'Œufs']])}
      formatMontant={formatMontant}
      {...handlers}
    />,
  );

  it.each([
    ['Modifier', 'onEdit'],
    ['Désactiver', 'onDelete'],
  ])('"%s" runs its own action without also opening the detail page', async (label, handlerName) => {
    const restore = useCardLayout();
    try {
      const handlers = { onView: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
      renderCards(handlers);
      fireEvent.click(await screen.findByRole('button', { name: 'Actions' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: label }));
      expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
      expect(handlers.onView).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('tapping a card still opens the detail page', async () => {
    const restore = useCardLayout();
    try {
      const handlers = { onView: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
      renderCards(handlers);
      fireEvent.click(await screen.findByText('Client Test'));
      expect(handlers.onView).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});
