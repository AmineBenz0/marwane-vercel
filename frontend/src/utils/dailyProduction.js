export const EGG_TYPE_LABELS = {
  normal: 'Normaux',
  double_jaune: 'Doubles jaunes',
  casse: 'Cassés',
  blanc: 'Blancs',
  perdu: 'Perdus',
  double_jaune_demarrage: 'Doubles jaunes démarrage',
};

/** Combine stored type rows into one card per building and date. */
export function groupDailyProductions(productions = []) {
  const groups = new Map();
  productions.filter((row) => row.est_actif !== false).forEach((row) => {
    const date = String(row.date_production).slice(0, 10);
    const key = `${row.id_batiment}-${date}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, date, id_batiment: row.id_batiment, rows: [], counts: {},
        collected: 0, lost: 0, cartons: 0, mortality: 0, feed: 0, weightedGrams: 0,
      });
    }
    const group = groups.get(key);
    const count = Number(row.nombre_oeufs || 0);
    group.rows.push(row);
    group.counts[row.type_oeuf] = (group.counts[row.type_oeuf] || 0) + count;
    group.mortality += Number(row.mortalite || 0);
    group.feed += Number(row.consommation_aliment_kg || 0);
    if (row.type_oeuf === 'perdu') {
      group.lost += count;
    } else {
      group.collected += count;
      group.cartons += Number(row.nombre_cartons || 0);
      group.weightedGrams += Number(row.grammage || 0) * count;
    }
  });
  return [...groups.values()].map((group) => ({
    ...group,
    grammage: group.collected ? group.weightedGrams / group.collected : null,
    representative: group.rows.find((row) => row.type_oeuf !== 'perdu') || group.rows[0],
  })).sort((a, b) => b.date.localeCompare(a.date) || Number(a.id_batiment) - Number(b.id_batiment));
}
