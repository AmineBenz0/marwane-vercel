import { describe, expect, it } from 'vitest';
import { auditedCorrectionChanges } from './auditedCorrectionChanges';

const initial = {
  id_transaction: 12, row_version: 2, date_transaction: '2026-11-01',
  date_echeance: null, id_client: 4, id_fournisseur: null,
  id_produit: 3, id_production: 22, id_batiment: 1,
  quantite: 10, prix_unitaire: '13.20',
  est_actif: true, est_promesse: false, allocation_automatique: true,
  date_livraison_prevue: null,
};

const payload = (changes = {}) => ({
  date_transaction: initial.date_transaction, date_echeance: '',
  id_client: initial.id_client, id_fournisseur: null,
  id_produit: initial.id_produit, id_production: initial.id_production,
  id_batiment: initial.id_batiment, quantite: initial.quantite,
  prix_unitaire: 13.2, est_actif: true, est_promesse: false,
  allocation_automatique: true, date_livraison_prevue: null,
  ...changes,
});

describe('auditedCorrectionChanges', () => {
  it('returns only actual eligible changes, preserving empty due dates', () => {
    expect(auditedCorrectionChanges(initial, payload({ date_echeance: '2026-11-30' })))
      .toEqual({ date_echeance: '2026-11-30' });
    expect(auditedCorrectionChanges(initial, payload())).toBeNull();
  });

  it('uses the audited route when previously recorded payments are unchanged', () => {
    const oldPayment = {
      id_paiement: 6, date_paiement: '2026-11-02', montant: '5.00',
      type_paiement: 'cash', notes: null, id_compte: null,
    };
    const submitted = { id_paiement: 6, date_paiement: '2026-11-02',
      montant: 5, type_paiement: 'cash', notes: '', id_compte: null };
    expect(auditedCorrectionChanges(
      initial, payload({ date_echeance: '2026-11-30' }), [submitted], [oldPayment],
    )).toEqual({ date_echeance: '2026-11-30' });
    expect(auditedCorrectionChanges(
      initial, payload({ date_echeance: '2026-11-30' }),
      [{ ...submitted, montant: 6 }], [oldPayment],
    )).toBeNull();
  });

  it('never routes edited, new or partial payment collections through audited apply', () => {
    const previous = [{ id_paiement: 1, date_paiement: '2026-11-02', montant: 4, type_paiement: 'cash' }];
    const transaction = payload({ prix_unitaire: 14 });
    expect(auditedCorrectionChanges(initial, transaction,
      [{ date_paiement: '2026-11-02', montant: 4, type_paiement: 'cash' }], previous)).toBeNull();
    expect(auditedCorrectionChanges(initial, transaction,
      [{ id_paiement: 1, date_paiement: '2026-11-02', montant: 5, type_paiement: 'cash' }], previous)).toBeNull();
  });

  it('does not use the new writer for quantity, stock origin or supplier changes', () => {
    for (const changes of [
      { quantite: 11 }, { id_production: 21 },
      { id_fournisseur: 3 }, { id_produit: 4 },
      { date_transaction: '2026-11-02' },
    ]) {
      expect(auditedCorrectionChanges(initial, payload(changes))).toBeNull();
    }
  });

  it('requires a real versioned transaction before entering audited editing', () => {
    expect(auditedCorrectionChanges({ ...initial, row_version: null },
      payload({ date_echeance: '2026-11-30' }))).toBeNull();
  });
});
