// A payment that is on its way but not counted as paid yet by the API
// (typically a cheque not cashed). Refunds and cancelled/rejected payments never count.
export const isPendingPayment = (payment) => Boolean(payment)
  && payment.statut !== 'annule'
  && payment.statut !== 'rejete'
  && payment.nature !== 'remboursement'
  && (payment.statut === 'en_attente'
    || (payment.type_paiement === 'cheque' && ['a_encaisser', 'en_attente', 'emis'].includes(payment.statut_cheque)));

export const pendingPaymentAmount = (payments) => (payments || [])
  .filter(isPendingPayment)
  .reduce((sum, payment) => sum + Number(payment.montant || 0), 0);

// What is still owed once the pending payments arrive. Credits (negative remainders) are kept as is.
export const remainingAfterPending = (montantRestant, payments) => {
  const remaining = Number(montantRestant || 0);
  if (remaining <= 0) return remaining;
  return Math.max(0, remaining - pendingPaymentAmount(payments));
};
