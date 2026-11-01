/** Present the canonical backend balance without hiding debts or credits. */
export function transactionBalance(transaction, remaining = transaction.montant_restant) {
  const value = remaining === null || remaining === undefined ? NaN : Number(remaining);
  if (!Number.isFinite(value)) return { label: 'Solde indisponible', amount: null, credit: false, color: 'text.secondary' };
  if (transaction.est_actif === false) return { label: 'Solde (historique)', amount: value, credit: false, color: 'text.secondary' };
  const sale = transaction.id_client !== null && transaction.id_client !== undefined;
  const credit = value < 0;
  return {
    label: credit ? (sale ? 'Crédit client' : 'Crédit fournisseur') : (sale ? 'Reste à encaisser' : 'Reste à payer'),
    amount: credit ? -value : value,
    credit,
    color: credit ? 'info.main' : value > 0 ? 'warning.main' : 'success.main',
  };
}
