// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { exportTransactionsReportPDF } from './exportTransactionsReportPDF';

let saved;

vi.mock('jspdf', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    jsPDF: function (...args) {
      const doc = new actual.jsPDF(...args);
      // Only replace the download; exercise the real document and table engines.
      doc.save = () => { saved = doc; };
      return doc;
    },
  };
});

const transaction = (index, extra = {}) => ({
  id_transaction: index + 1,
  id_client: 1,
  date_transaction: '2026-10-22',
  client_ou_fournisseur: `PARTNER-${String(index).padStart(3, '0')}`,
  produit_label: `PRODUCT-${String(index).padStart(3, '0')}`,
  batiment_label: 'Bâtiment A',
  quantite: 1,
  montant_total: '100.00',
  montant_paye: '25.00',
  montant_restant: '75.00',
  est_actif: true,
  ...extra,
});

// These reports contain uncompressed page streams. Inspect the actual PDF output,
// independently of the exporter hooks, including custom badge text and footers.
function pages() {
  return [...saved.output().matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map(match => match[1]);
}

describe('transaction PDF pagination', () => {
  it('keeps ordinary boundary rows complete and preserves each cancellation badge', () => {
    const rows = Array.from({ length: 30 }, (_, index) => transaction(index, {
      est_actif: index % 3 !== 1,
    }));
    exportTransactionsReportPDF(rows);
    const outputPages = pages();
    const all = outputPages.join('\n');
    expect(all).not.toContain('(ID) Tj');
    expect(outputPages.length).toBeGreaterThan(1);
    expect((all.match(/\(Annulée\) Tj/g) || [])).toHaveLength(10);
    expect((all.match(/\(Active\) Tj/g) || [])).toHaveLength(20);
    for (const row of rows) {
      const matching = outputPages.filter(page => page.includes(row.client_ou_fournisseur));
      expect(matching).toHaveLength(1);
      expect(matching[0]).toContain(row.produit_label);
    }
    expect(all).toContain('2 000,00');
    expect(all).toContain('500,00');
    expect(all).toContain('1 500,00');
    outputPages.forEach((page, index) => {
      expect(page).toContain(`(${index + 1} / ${outputPages.length}) Tj`);
    });
  });

  it('retains cancellation status even when a row is taller than a whole page', () => {
    exportTransactionsReportPDF([transaction(0, {
      est_actif: false,
      client_ou_fournisseur: 'LONG-CANCELED-PARTNER\n'.repeat(150),
      produit_label: 'END-OF-CANCELED-ROW',
    })]);
    const outputPages = pages();
    const all = outputPages.join('\n');
    expect(outputPages.length).toBeGreaterThan(2);
    expect(all).not.toContain('(Active) Tj');
    expect((all.match(/\(Annulée\) Tj/g) || []).length).toBeGreaterThan(1);
    expect(all).toContain('END-OF-CANCELED-ROW');
  });

  it('fills annex pages before continuing without losing or repeating entries', () => {
    const rows = Array.from({ length: 15 }, (_, index) => transaction(index, {
      reglement_label: `PAYMENT-${String(index).padStart(3, '0')} ` +
        (index === 0 ? 'Long reference with multiple words '.repeat(20) : '25,00 MAD'),
      est_promesse: index < 11,
      date_livraison_prevue: index < 11 ? '2026-11-15' : null,
      quantite_completee: 0,
      quantite_reservee: 0,
      quantite_en_attente: 1,
      quantite_a_produire: 1,
      etat_stock: index < 11 ? 'En attente' : null,
    }));
    exportTransactionsReportPDF(rows);
    const outputPages = pages();
    const paymentPages = outputPages.filter(page => page.includes('PAYMENT-'));
    const deferredPages = outputPages.filter(page => page.includes('En attente'));
    expect(paymentPages).toHaveLength(2);
    expect(deferredPages).toHaveLength(2);
    const paymentCounts = paymentPages.map(page => (page.match(/PAYMENT-\d{3}/g) || []).length);
    const deferredCounts = deferredPages.map(page => (page.match(/En attente/g) || []).length);
    expect(paymentCounts[0]).toBeGreaterThanOrEqual(11);
    expect(deferredCounts[0]).toBeGreaterThanOrEqual(9);
    expect(paymentCounts.reduce((a, b) => a + b, 0)).toBe(15);
    expect(deferredCounts.reduce((a, b) => a + b, 0)).toBe(11);
    rows.forEach((row, index) => {
      expect(paymentPages.join('\n').match(new RegExp(`PAYMENT-${String(index).padStart(3, '0')}`, 'g')))
        .toHaveLength(1);
    });
  });
});
