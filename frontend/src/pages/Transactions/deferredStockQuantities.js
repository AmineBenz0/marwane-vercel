export function deferredStockQuantities(sale = {}) {
  const pending = sale.est_promesse !== false && sale.est_actif !== false
    ? Math.max(0, Number(sale.quantite_en_attente || 0))
    : 0;
  const reserved = Math.min(pending, Math.max(0, Number(sale.quantite_reservee || 0)));
  return {
    completed: Math.max(0, Number(sale.quantite_completee || 0)),
    reserved,
    toProduce: Math.max(0, pending - reserved),
  };
}
