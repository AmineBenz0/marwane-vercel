// Follow sale-line order, just as the server allocates each line in a batch.
export function saleStockSummary(line, index, lines) {
  const requested = Math.max(0, Number(line.quantite) || 0);
  const reserved = lines.slice(0, index).reduce((sum, other) => {
    const sameStock = line.source_group
      ? other.source_group === line.source_group
      : line.id_production && Number(other.id_production) === Number(line.id_production)
        && Number(other.id_batiment) === Number(line.id_batiment);
    return sum + (sameStock ? Math.max(0, Number(other.quantite) || 0) : 0);
  }, 0);
  const available = Math.max(0, Number(line.source_available || 0) - reserved);
  const ready = !!line.source_ready && !!line.id_produit && line.source_available != null;
  return { requested, available, ready, covered: Math.min(requested, available), pending: Math.max(0, requested - available) };
}
