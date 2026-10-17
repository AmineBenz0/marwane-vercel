import { describe, expect, it } from 'vitest';
import { buildTransactionPaymentBatch } from './transactionPaymentBatch';

describe('buildTransactionPaymentBatch', () => {
  it('keeps each line and its multiple payments together, including pay-later lines', () => {
    const payload = buildTransactionPaymentBatch({
      transactions: [{ id_produit: 1 }, { id_produit: 2 }],
      lignesData: [
        {
          ajouter_paiement: true,
          paiements: [
            { date: '2026-10-16', montant: '20', type: 'cash' },
            { date: '2026-10-16', montant: '30', type: 'lc', id_lc: 8 },
          ],
        },
        { ajouter_paiement: false, paiements: [{ montant: '75', type: 'cash' }] },
      ],
    });

    expect(payload.items).toHaveLength(2);
    expect(payload.items[0].transaction).toEqual({ id_produit: 1 });
    expect(payload.items[0].paiements).toEqual([
      expect.objectContaining({ montant: 20, type_paiement: 'cash', id_lc: null }),
      expect.objectContaining({ montant: 30, type_paiement: 'lc', id_lc: 8 }),
    ]);
    expect(payload.items[1].paiements).toEqual([]);
    expect(payload.items[0].client_ref).not.toBe(payload.items[1].client_ref);
  });
});
