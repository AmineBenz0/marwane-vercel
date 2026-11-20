import { describe, expect, it } from 'vitest';
import { isPendingPayment, owedAmount, pendingPaymentAmount, remainingAfterPending } from './pendingPayments';

describe('pending payments', () => {
  const cheque = { type_paiement: 'cheque', statut: 'en_attente', statut_cheque: 'a_encaisser', montant: '1000.00' };
  it('counts uncashed cheques only', () => {
    expect(isPendingPayment(cheque)).toBe(true);
    expect(isPendingPayment({ ...cheque, statut: 'valide', statut_cheque: 'encaisse' })).toBe(false);
    expect(isPendingPayment({ ...cheque, statut: 'annule' })).toBe(false);
    expect(isPendingPayment({ ...cheque, statut_cheque: 'rejete', statut: 'rejete' })).toBe(false);
    expect(isPendingPayment({ type_paiement: 'cash', statut: 'valide', montant: '5' })).toBe(false);
  });
  it('subtracts pending amounts from what is still owed, never below zero', () => {
    expect(pendingPaymentAmount([cheque, { type_paiement: 'cash', statut: 'valide', montant: '5' }])).toBe(1000);
    expect(remainingAfterPending('1875.00', [cheque])).toBe(875);
    expect(remainingAfterPending('500.00', [cheque])).toBe(0);
    expect(remainingAfterPending('-20.00', [cheque])).toBe(-20);
  });
  it('prefers the owed figure from the API, falling back to the payments', () => {
    expect(owedAmount({ montant_restant: '100.00', montant_du: '0.00', paiements: [] })).toBe(0);
    expect(owedAmount({ montant_restant: '100.00', paiements: [{ ...cheque, montant: '40' }] })).toBe(60);
    expect(owedAmount({ montant_restant: '-15.00', montant_du: '-15.00' })).toBe(-15);
    expect(owedAmount(null)).toBe(0);
  });
});
