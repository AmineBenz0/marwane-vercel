const cents = value => Math.round(Number(value ?? 0) * 100);

function netCents(transaction) {
  return transaction.montant_net != null
    ? cents(transaction.montant_net)
    : cents(transaction.montant_total) - cents(transaction.montant_avoir);
}

export const transactionNetAmount = transaction => netCents(transaction) / 100;

export function sumActiveTransactionAmounts(transactions) {
  const totals = { gross: 0, credits: 0, net: 0, paid: 0, remaining: 0 };
  for (const transaction of transactions) {
    if (transaction.est_actif === false) continue;
    totals.gross += cents(transaction.montant_total);
    totals.credits += cents(transaction.montant_avoir);
    totals.net += netCents(transaction);
    totals.paid += cents(transaction.montant_paye);
    totals.remaining += cents(transaction.montant_restant);
  }
  return {
    gross: totals.gross / 100,
    credits: totals.credits / 100,
    net: totals.net / 100,
    paid: totals.paid / 100,
    remaining: totals.remaining / 100,
  };
}
