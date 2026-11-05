// A complete and deterministic transaction result drives all list cards,
// quick filters, counts and exports. Never silently drop page 2+.
export async function loadTransactionPages(get, params = {}, pageSize = 500, maxRows = 50000) {
  const rows = [];
  const seen = new Set();
  for (let skip = 0; skip < maxRows; skip += pageSize) {
    const page = await get('/transactions', { params: { ...params, skip, limit: pageSize } });
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error('Résultat du registre invalide. Actualisez la page.');
    }
    for (const row of page) {
      if (seen.has(row.id_transaction)) {
        throw new Error('Les transactions ont changé pendant le chargement. Actualisez la page.');
      }
      seen.add(row.id_transaction);
      rows.push(row);
    }
    if (page.length < pageSize) return rows;
  }
  throw new Error('Le registre contient trop de transactions pour un chargement complet. Affinez les filtres.');
}
