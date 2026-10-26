export function deferredSaleStatus(sale) {
  if (!sale.est_promesse) return null;
  if (sale.est_actif === false) return { id: 'cancelled', label: 'Annulée', color: 'default' };
  if (Number(sale.quantite_en_attente) === 0) return { id: 'complete', label: 'Réservation complète', color: 'success' };
  if (Number(sale.quantite_couverte ?? sale.quantite_reservee) > 0) return { id: 'ready', label: 'Stock partiellement réservé', color: 'info' };
  return { id: 'waiting', label: 'En attente de production', color: 'warning' };
}
