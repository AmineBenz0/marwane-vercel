export function deferredSaleStatus(sale) {
  if (!sale.est_promesse) return null;
  if (sale.est_actif === false) return { id: 'cancelled', label: 'Annulée', color: 'default' };
  if (sale.quantite_en_attente === 0) return { id: 'complete', label: 'Stock complet', color: 'success' };
  if (sale.quantite_reservee > 0) return { id: 'ready', label: 'À compléter', color: 'info' };
  return { id: 'waiting', label: 'En attente de production', color: 'warning' };
}
