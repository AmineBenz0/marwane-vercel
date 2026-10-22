import { describe, expect, it } from 'vitest';
import { buildTransactionPaymentBatch } from './transactionPaymentBatch';
import { transactionValidationSchema } from './transactionValidation';

describe('buildTransactionPaymentBatch', () => {
  it('sends the funding source and bank account independently of cash method', () => {
    const payload = buildTransactionPaymentBatch({
      transactions: [{ id_fournisseur: 1 }],
      lignesData: [{ ajouter_paiement: true, paiements: [{
        date: '2026-10-22', montant: '40', type: 'cash', source_reglement: 'banque', id_compte: '2',
      }] }],
    });
    expect(payload.items[0].paiements[0]).toMatchObject({
      type_paiement: 'cash', source_reglement: 'banque', id_compte: 2,
    });
  });

  it.each([
    ['banque', 'cash', '', false],
    ['banque', 'cash', 2, true],
    ['caisse', 'virement', '', true],
    [null, 'virement', '', false],
    [null, 'cash', '', true],
  ])('validates source %s and method %s independently', async (source, type, account, valid) => {
    const request = {
      date_transaction: '2026-10-22', type_entite: 'fournisseur', id_fournisseur: 1,
      lignes: [{ id_produit: 1, quantite: 1, prix_unitaire: 40, ajouter_paiement: true,
        paiements: [{ date: '2026-10-22', montant: 40, type, source_reglement: source, id_compte: account }] }],
    };
    expect(await transactionValidationSchema.isValid(request)).toBe(valid);
  });

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
