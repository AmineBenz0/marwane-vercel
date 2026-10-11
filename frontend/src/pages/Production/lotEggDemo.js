const TYPES = ['normal', 'blanc', 'double_jaune', 'double_jaune_demarrage', 'casse'];
const counts = (normal = 0, blanc = 0, double = 0, earlyDouble = 0, broken = 0) =>
  Object.fromEntries(TYPES.map((key, index) => [key, [normal, blanc, double, earlyDouble, broken][index]]));
const dateAt = (start, days) => new Date(Date.parse(`${start}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export const LOT_EGG_DEMO_SCENARIOS = [
  { value: 'mixed', label: 'Écarts de quantité et cas particuliers', description: 'S. 5 et 12 : sans saisie. S. 8 : zéro enregistré. S. 10 : saisies incomplètes. S. 15 : pic exceptionnel. S. 20 : semaine partielle.' },
  { value: 'long', label: 'Historique de 104 semaines', description: 'Deux ans de production : utilisez les poignées sous le graphique pour examiner une période.' },
  { value: 'single', label: 'Une seule semaine', description: 'Une semaine partielle : les points restent visibles même sans segment de courbe.' },
  { value: 'zero', label: 'Production enregistrée à zéro', description: 'Les trois semaines ont des saisies complètes et des quantités égales à zéro.' },
  { value: 'empty', label: 'Aucune saisie', description: 'Les semaines sans saisie restent sans quantité. Elles ne représentent pas une production égale à zéro.' },
];

export function createLotEggDemo(scenario = 'mixed') {
  const length = scenario === 'long' ? 104 : scenario === 'single' ? 1 : scenario === 'zero' ? 3 : scenario === 'empty' ? 5 : 20;
  const start = scenario === 'long' ? '2024-10-14' : '2026-05-25';
  const semaines = Array.from({ length }, (_, index) => {
    const week = index + 1;
    const missing = scenario === 'empty' || (scenario === 'mixed' && [5, 12].includes(week));
    const zero = scenario === 'zero' || (scenario === 'mixed' && week === 8);
    const partial = scenario === 'single' || (scenario === 'mixed' && week === length);
    const days = partial ? 4 : 7;
    const expected = days * 3;
    const entered = missing ? 0 : scenario === 'mixed' && week === 10 ? 9 : expected;
    const normal = scenario === 'mixed' && week === 15 ? 240000 : Math.round(60000 + index * 1900 + Math.sin(index / 2) * 7000);
    const factor = partial ? 4 / 7 : entered / expected;
    return {
      semaine: week, date_debut: dateAt(start, index * 7), date_fin: dateAt(start, index * 7 + days - 1),
      quantites: missing ? Object.fromEntries(TYPES.map((key) => [key, null])) : zero ? counts() : counts(
        Math.round(normal * factor), Math.round((850 + index * 27) * factor),
        Math.round((6 + index % 7) * factor), index < 4 ? Math.round((80 - index * 20) * factor) : 0,
        Math.round((180 + (index % 5) * 45) * factor),
      ),
      saisies: entered, saisies_attendues: expected, incomplete: entered < expected, partielle: partial,
    };
  });
  const totaux = counts();
  semaines.forEach((week) => TYPES.forEach((key) => { totaux[key] += week.quantites[key] ?? 0; }));
  return { id_lot: 'demo', semaines, totaux };
}
