export function deferredSaleStatus(sale) {
  if (!sale.est_promesse) return null;
  if (sale.est_actif === false) return { id: 'cancelled', label: 'Vente annulée', color: 'error' };
  if (Number(sale.quantite_en_attente) === 0) return { id: 'complete', label: Number(sale.quantite_annulee || 0) > 0 ? 'Reste clôturé' : 'Promesse complétée', color: 'success' };
  if (Number(sale.quantite_reservee) > 0) return { id: 'ready', label: 'Stock prêt à compléter', color: 'primary' };
  return { id: 'waiting', label: 'En attente de production', color: 'warning' };
}
