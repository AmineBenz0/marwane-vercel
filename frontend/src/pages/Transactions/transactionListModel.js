import { deferredSaleStatus } from './deferredSaleStatus';

const isSale = transaction => transaction.id_client !== null;
const isPurchase = transaction => transaction.id_fournisseur !== null;

const isUnpaid = transaction => {
  const status = transaction.est_en_retard ? 'en_retard' : (transaction.statut_paiement || 'impaye');
  return status === 'impaye' || status === 'partiel' || status === 'en_retard';
};

export function filterTransactions(transactions, quickFilter = 'all', stockFilter = 'all') {
  return transactions.filter(transaction => {
    if (quickFilter === 'deferred') return transaction.est_promesse && (
      stockFilter === 'all' || (stockFilter === 'pending'
        ? transaction.est_actif !== false && Number(transaction.quantite_en_attente || 0) > 0
        : stockFilter === 'reserved'
        ? transaction.est_actif !== false && Number(transaction.quantite_couverte || 0) > 0
        : deferredSaleStatus(transaction)?.id === stockFilter)
    );
    if (quickFilter === 'ventes') return isSale(transaction);
    if (quickFilter === 'achats') return isPurchase(transaction);
    if (quickFilter === 'non_payees') return transaction.est_actif !== false && isUnpaid(transaction);
    return true;
  });
}

export function countTransactionQuickFilters(transactions) {
  const active = transactions.filter(transaction => transaction.est_actif !== false);
  return {
    all: transactions.length,
    ventes: transactions.filter(isSale).length,
    achats: transactions.filter(isPurchase).length,
    non_payees: active.filter(isUnpaid).length,
    deferred: transactions.filter(transaction => transaction.est_promesse).length,
  };
}

export function summarizeTransactions(transactions) {
  const active = transactions.filter(transaction => transaction.est_actif !== false);
  const ventes = transactions.filter(isSale);
  const achats = transactions.filter(isPurchase);
  const activeVentes = active.filter(isSale);
  const activeAchats = active.filter(isPurchase);
  return {
    total: transactions.length,
    ventes: ventes.length,
    achats: achats.length,
    nonPayees: active.filter(isUnpaid).length,
    totalVentes: activeVentes.reduce((sum, transaction) => sum + parseFloat(transaction.montant_total || 0), 0),
    totalAchats: activeAchats.reduce((sum, transaction) => sum + parseFloat(transaction.montant_total || 0), 0),
  };
}
