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
      paiements: [{
        date_paiement: '2026-10-23', type_paiement: 'virement', montant: '25.01', statut: 'valide',
        reference_virement: `PAYMENT-${String(index).padStart(3, '0')}`,
      }],
      est_promesse: index < 11,
      date_livraison_prevue: index < 11 ? '2026-11-15' : null,
      quantite_couverte: 4,
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
    expect(deferredPages).toHaveLength(1);
    expect(deferredPages[0]).toContain('(COUVERT) Tj');
    expect((deferredPages[0].match(/\(4\) Tj/g) || [])).toHaveLength(11);
    const paymentCounts = paymentPages.map(page => (page.match(/PAYMENT-\d{3}/g) || []).length);
    const deferredCounts = deferredPages.map(page => (page.match(/En attente/g) || []).length);
    // Single-payment groups include their transaction context and amount.
    expect(paymentCounts[0]).toBeGreaterThanOrEqual(9);
    expect(deferredCounts[0]).toBe(11);
    expect(paymentCounts.reduce((a, b) => a + b, 0)).toBe(15);
    expect(deferredCounts.reduce((a, b) => a + b, 0)).toBe(11);
    rows.forEach((row, index) => {
      expect(paymentPages.join('\n').match(new RegExp(`PAYMENT-${String(index).padStart(3, '0')}`, 'g')))
        .toHaveLength(1);
    });
  });

  it('exports each payment and credit movement with its own exact amount, reference and status', () => {
    const base = { date_paiement: '2026-10-23', nature: 'paiement', statut: 'valide' };
    exportTransactionsReportPDF([transaction(0, {
      paiements: [
        { ...base, type_paiement: 'cash', montant: '0.01' },
        { ...base, type_paiement: 'cheque', montant: '10.02', numero_cheque: 'CANCELED-CHEQUE', statut: 'annule', statut_cheque: 'encaisse' },
        { ...base, type_paiement: 'virement', montant: '15.03', reference_virement: 'TRANSFER-REF' },
        { ...base, type_paiement: 'lc', montant: '20.04', numero_reference_lc: 'LC-READABLE' },
        { ...base, type_paiement: 'compensation', montant: '30.05', nature: 'credit_recu' },
        { ...base, type_paiement: 'compensation', montant: '40.06', nature: 'credit_transfere' },
        { ...base, type_paiement: 'cash', montant: '5.07', nature: 'remboursement' },
        { ...base, type_paiement: 'cheque', montant: '6.08', numero_cheque: 'REJECTED-CHEQUE', statut: 'rejete', statut_cheque: 'encaisse' },
        { ...base, type_paiement: 'cheque', montant: '7.09', numero_cheque: 'PENDING-CHEQUE', statut_cheque: 'a_encaisser' },
        { ...base, type_paiement: 'lc', montant: '8.10', id_lc: 99999, statut: undefined },
      ],
    })]);
    const annex = pages().filter(page => page.includes('ANNEXE')).join('\n');
    for (const amount of ['0,01', '10,02', '15,03', '20,04', '30,05', '40,06', '5,07', '6,08', '7,09', '8,10']) {
      expect(annex).toContain(`(${amount}) Tj`);
    }
    for (const label of ['Crédit utilisé', 'Crédit transféré', 'Remboursement', 'Annulé', 'Rejeté', 'À encaisser', 'LC-READABLE', 'TRANSFER-REF']) {
      expect(annex).toContain(label);
    }
    expect(annex).not.toContain('(Encaissé) Tj');
    expect(annex).not.toContain('(LC 99999) Tj');
    expect(annex).not.toContain('(99999) Tj');
    expect(annex).not.toContain('Compensation');
    expect(annex).not.toContain('(ID) Tj');
  });

  it('fills the first page of a long payment history and repeats its transaction context on continuations', () => {
    const payments = Array.from({ length: 40 }, (_, index) => ({
      date_paiement: '2026-10-24', type_paiement: 'virement', montant: '1.01', statut: 'valide',
      reference_virement: `UNIQUE-REF-${String(index).padStart(3, '0')}`,
    }));
    exportTransactionsReportPDF([
      transaction(0, { paiements: [payments[0]] }),
      transaction(1, { paiements: payments.slice(1) }),
    ]);
    const annexPages = pages().filter(page => page.includes('ANNEXE'));
    expect(annexPages).toHaveLength(4);
    expect(annexPages[0]).toContain('PARTNER-000');
    expect(annexPages[0]).toContain('PARTNER-001');
    expect((annexPages[0].match(/UNIQUE-REF-\d{3}/g) || []).length).toBeGreaterThanOrEqual(11);
    annexPages.forEach(page => {
      expect(page).toContain('PARTNER-001');
      expect(page).toContain('PRODUCT-001');
      expect(page).toContain('(100,00 MAD) Tj');
      expect(page).toContain('DATE RÈGL.');
    });
    const all = annexPages.join('\n');
    expect((all.match(/\\\(suite\\\)/g) || [])).toHaveLength(3);
    payments.forEach(payment => expect(all.split(payment.reference_virement)).toHaveLength(2));
  });

  it('wraps long names and references while retaining separate canceled transactions for the same partner', () => {
    const payment = { date_paiement: '2026-10-24', type_paiement: 'virement', montant: '12.34', statut: 'valide' };
    exportTransactionsReportPDF([
      transaction(0, { client_ou_fournisseur: 'COMMON-PARTNER ' + 'Long name '.repeat(10),
        produit_label: 'FIRST-PRODUCT', est_actif: false,
        paiements: [{ ...payment, reference_virement: 'LONG-START ' + 'Long reference '.repeat(8) + 'LONG-END' }] }),
      transaction(1, { client_ou_fournisseur: 'COMMON-PARTNER', produit_label: 'SECOND-PRODUCT',
        paiements: [{ ...payment, reference_virement: 'SECOND-REF' }] }),
    ]);
    const annex = pages().filter(page => page.includes('ANNEXE')).join('\n');
    for (const label of ['FIRST-PRODUCT', 'SECOND-PRODUCT', 'LONG-START', 'LONG-END', 'SECOND-REF', 'Annulée', 'Validé']) {
      expect(annex).toContain(label);
    }
    expect((annex.match(/\(12,34\) Tj/g) || [])).toHaveLength(2);
  });
  it('shows immutable commercial avoirs separately from refunds with reconciled net totals', () => {
    exportTransactionsReportPDF([transaction(0, {
      montant_total: '1500.00',
      montant_avoir: '600.00',
      montant_net: '900.00',
      montant_paye: '900.00',
      montant_restant: '0.00',
      est_promesse: true,
      quantite: 1000,
      quantite_couverte: 600,
      quantite_annulee: 400,
      quantite_en_attente: 0,
      avoirs_livraison_differee: [
        { date_effet: '2026-11-10', quantite_annulee: 400,
          montant_avoir: '600.00', avoir_cumule: '600.00' },
      ],
      paiements: [
        { date_paiement: '2026-10-22', type_paiement: 'cash', nature: 'paiement',
          montant: '1500.00', statut: 'valide' },
        { date_paiement: '2026-11-11', type_paiement: 'cash', nature: 'remboursement',
          montant: '600.00', statut: 'valide' },
      ],
    })]);
    const all = pages().join('\n');
    expect(all).toContain('MONTANT NET ACTIF');
    expect(all).toContain('Avoirs commerciaux');
    expect(all).toContain('Remboursement');
    expect(all).toContain('10/11/26');
    expect(all).toContain('(600,00) Tj');
    expect(all).toContain('(900,00) Tj');
    expect(all).toContain('ANNULÉ');
    expect(all).not.toContain('(ID) Tj');
    // The refund is in the payment history, while the credit is its own annex.
    expect((all.match(/\(Remboursement\) Tj/g) || []).length).toBe(1);
  });

});
