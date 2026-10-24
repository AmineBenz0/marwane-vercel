export const categoryKey = (s) => `${s.type_oeuf}:${s.calibre || ''}`;
export function groupStock(sources) {
  const groups = new Map();
  [...sources].sort((a, b) => a.date_production.localeCompare(b.date_production) || a.id_production - b.id_production).forEach((s) => {
    if (!s.vendable || s.disponible <= 0) return;
    const key = categoryKey(s);
    if (!groups.has(key)) groups.set(key, { ...s, key, disponible: 0, sources: [] });
    const group = groups.get(key);
    group.disponible += s.disponible;
    group.sources.push(s);
  });
  return [...groups.values()];
}
export function dispatchStock(sources, requested) {
  let remaining = Math.max(0, Number(requested) || 0);
  return sources.map((s) => {
    const deducted = Math.min(remaining, s.disponible);
    remaining -= deducted;
    return { ...s, deducted, remaining: s.disponible - deducted };
  });
}
