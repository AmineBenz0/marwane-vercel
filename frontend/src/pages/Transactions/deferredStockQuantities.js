/** Counts the stock on the current production API. Covered eggs are not
 * necessarily delivered; reserved eggs are still awaiting completion. */
export function deferredStockQuantities(sale = {}) {
  const pending = sale.est_promesse !== false && sale.est_actif !== false
    ? Math.max(0, Number(sale.quantite_en_attente || 0))
    : 0;
  const covered = Math.max(0, Number(sale.quantite_couverte || 0));
  const reserved = Math.min(pending, Math.max(0, Number(sale.quantite_reservee || 0)));
  return { covered, pending, reserved, toProduce: Math.max(0, pending - reserved) };
}
