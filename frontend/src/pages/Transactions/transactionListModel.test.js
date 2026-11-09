import { describe, expect, it } from 'vitest';
import { countTransactionQuickFilters, filterTransactions, summarizeTransactions } from './transactionListModel';

const rows = [
  { id_transaction: 1, id_client: 11, id_fournisseur: null, est_actif: true, statut_paiement: 'impaye', montant_total: 100 },
  { id_transaction: 2, id_client: 12, id_fournisseur: null, est_actif: false, statut_paiement: 'impaye', montant_total: 200 },
  { id_transaction: 3, id_client: null, id_fournisseur: 21, est_actif: true, statut_paiement: 'paye', montant_total: 50 },
  { id_transaction: 4, id_client: 13, id_fournisseur: null, est_actif: true, est_promesse: true, quantite_en_attente: 40, quantite_couverte: 60, statut_paiement: 'partiel', montant_total: 80 },
];

describe('transaction list filtered result model', () => {
  it('counts quick filters from the advanced-filtered base rows', () => {
    expect(countTransactionQuickFilters(rows)).toEqual({ all: 4, ventes: 3, achats: 1, non_payees: 2, deferred: 1 });
  });

  it('keeps rows, summary and export inputs aligned after quick filters', () => {
    const displayedRows = filterTransactions(rows, 'non_payees');
    expect(displayedRows.map(row => row.id_transaction)).toEqual([1, 4]);
    expect(summarizeTransactions(displayedRows)).toMatchObject({
      total: displayedRows.length, ventes: 2, achats: 0, nonPayees: 2, totalVentes: 180, totalAchats: 0,
    });
  });

  it('keeps canceled sales in sale history but excludes them from financial totals', () => {
    const displayedRows = filterTransactions(rows, 'ventes');
    expect(displayedRows.map(row => row.id_transaction)).toEqual([1, 2, 4]);
    expect(summarizeTransactions(displayedRows)).toMatchObject({ total: 3, ventes: 3, totalVentes: 180 });
  });

  it('filters deferred sales by pending or reserved stock without changing other transaction types', () => {
    expect(filterTransactions(rows, 'deferred', 'pending').map(row => row.id_transaction)).toEqual([4]);
    expect(filterTransactions(rows, 'deferred', 'reserved').map(row => row.id_transaction)).toEqual([4]);
    expect(filterTransactions(rows, 'deferred', 'complete')).toEqual([]);
  });
});
