// Labels for the register export must be independent from asynchronously
// loaded filter dropdowns. Missing labels are resolved by authenticated
// resource endpoints, including soft-deleted historical entities.
const ENTITIES = [
  { field: 'id_client', type: 'clients', path: '/clients', name: 'nom_client', label: 'client' },
  { field: 'id_fournisseur', type: 'fournisseurs', path: '/fournisseurs', name: 'nom_fournisseur', label: 'fournisseur' },
  { field: 'id_produit', type: 'produits', path: '/produits', name: 'nom_produit', label: 'produit' },
  { field: 'id_batiment', type: 'batiments', path: '/batiments', name: 'nom', label: 'bâtiment' },
];
const exists = id => id !== null && id !== undefined && id !== '';
const readable = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const known = (map, id) => readable(map.get(id) ?? map.get(Number(id)) ?? map.get(String(id)));

export async function resolveTransactionExportRows(rows, catalogues, get) {
  const names = Object.fromEntries(ENTITIES.map(entity => [
    entity.type, new Map(catalogues[entity.type] || []),
  ]));
  const missing = new Map();
  for (const row of rows) {
    for (const entity of ENTITIES) {
      const rawId = row[entity.field];
      if (!exists(rawId) || known(names[entity.type], rawId)) continue;
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("Impossible de retrouver les libellés pour l'export. Réessayez.");
      }
      missing.set(`${entity.type}:${id}`, { entity, id });
    }
  }
  const requests = [...missing.values()];
  // Keep lookup traffic bounded when a historical register has many entities.
  for (let start = 0; start < requests.length; start += 5) {
    const results = await Promise.all(requests.slice(start, start + 5).map(async ({ entity, id }) => {
      try {
        const record = await get(`${entity.path}/${id}`);
        const label = readable(record?.[entity.name]);
        if (!label) throw new Error('No label');
        return { entity, id, label };
      } catch {
        throw new Error(`Impossible de retrouver le nom du ${entity.label} pour l'export. Réessayez.`);
      }
    }));
    results.forEach(({ entity, id, label }) => names[entity.type].set(id, label));
  }
  const label = (type, id) => exists(id) ? known(names[type], id) : '-';
  return rows.map(row => ({
    ...row,
    client_ou_fournisseur: exists(row.id_client)
      ? label('clients', row.id_client) : label('fournisseurs', row.id_fournisseur),
    produit_label: label('produits', row.id_produit),
    batiment_label: label('batiments', row.id_batiment),
  }));
}
