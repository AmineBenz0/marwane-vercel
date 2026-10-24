// Deterministic examples for the register preview; never persisted to the API.
export const DEMO_LOTS = {
  active: {
    name: 'Hisex', status: 'en cours', start: '2025-11-10', weeks: 49, startAge: 17,
    buildings: [{ id: '1', initial: 62000 }, { id: '2', initial: 60000 }],
  },
  previous: {
    name: 'Lohmann', status: 'terminé', start: '2024-06-24', weeks: 70, startAge: 17,
    buildings: [{ id: '1', initial: 58000 }, { id: '2', initial: 56000 }],
  },
};

const round = (value, digits = 2) => Number(value.toFixed(digits));
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const formulas = [
  [17, '17-1% Sem vita'], [25, '25-1% Sem vita'], [35, '26-35 Sem'],
  [45, '36-45 Sem'], [55, '46-55 Sem'], [65, '56-65 Sem'],
  [75, '66-75 Sem'], [85, '76-85 Sem'], [Infinity, '86-Réforme'],
];
const formatMoney = (value) => value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' DH';

export function buildDemoDays(lotId, buildingId = 'all') {
  const lot = DEMO_LOTS[lotId] || DEMO_LOTS.active;
  const buildings = lot.buildings.filter((building) => buildingId === 'all' || building.id === buildingId);
  if (!buildings.length) return [];
  const initial = sum(buildings, 'initial');
  const states = buildings.map((building) => ({
    ...building, birds: building.initial, cumulativeEggs: 0, cumulativeDeaths: 0,
    cumulativeCost: 0, stock: 0, weekEggs: 0,
  }));
  const days = [];
  for (let index = 0; index < lot.weeks * 7; index += 1) {
    const date = new Date(lot.start + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    const dateIso = date.toISOString().slice(0, 10);
    const weekday = (date.getUTCDay() + 6) % 7;
    const monday = new Date(date);
    monday.setUTCDate(monday.getUTCDate() - weekday);
    const key = monday.toISOString().slice(0, 10);
    const age = lot.startAge + Math.floor(index / 7);
    const formula = formulas.find(([lastAge]) => age <= lastAge)[1];
    const records = states.map((state) => {
      const offset = Number(state.id) * 1.7;
      const opening = state.birds;
      const deaths = Math.max(1, Math.round(opening * (0.00014 + (Math.sin(index / 11 + offset) + 1) * 0.000025)));
      state.birds -= deaths;
      state.cumulativeDeaths += deaths;
      const baseRate = age < 25 ? Math.min(0.945, 0.30 + (age - 17) * 0.083) : 0.945 - Math.max(0, age - 30) * 0.0023;
      const heatDip = index % 91 >= 54 && index % 91 <= 57 ? 0.045 : 0;
      const rate = Math.max(0.22, Math.min(0.96, baseRate + Math.sin(index / 5 + offset) * 0.012 - heatDip));
      // Match performance totals: broken and lost eggs are tracked separately.
      const eggs = Math.round(opening * rate);
      const double = Math.round(eggs * (0.012 + (Math.sin(index / 23) + 1) * 0.002));
      const white = Math.round(eggs * 0.007);
      const broken = Math.round(eggs * (0.006 + (Math.sin(index / 7 + offset) + 1) * 0.002));
      const lost = Math.round(eggs * 0.0015);
      const normal = eggs - double - white;
      const feed = round(opening * (106 + Math.min(10, (age - 17) * 0.6) + Math.sin(index / 6 + offset) * 1.5) / 1000, 1);
      const feedPrice = round(4.16 + Math.sin(index / 38) * 0.14 + Math.floor(index / 90) * 0.045 + Number(state.id) * 0.015, 3);
      const feedCost = round(feed * feedPrice);
      const eggWeight = round(52 + Math.min(12, (age - 17) * 0.5) + Math.sin(index / 18 + offset) * 0.4, 1);
      const otherItems = [];
      const addItem = (label, quantity, price) => otherItems.push({
        label: label + ' · Bâtiment ' + state.id, quantity, price, amount: round(quantity * price),
      });
      if (index % 14 === 2) addItem('Désinfectant et produits de nettoyage', 8, 95);
      if (weekday === 4) addItem('Plateaux de conditionnement des œufs', 600, 1.4);
      if (index % 35 === 8) addItem('Rappel de vaccination Newcastle – flacons et consommables vétérinaires', Math.ceil(opening / 1000), 175);
      if (index % 45 === 20) addItem('Maintenance du convoyeur, remplacement des roulements et remise en état de la ventilation', 1, 1450 + Number(state.id) * 180);
      const labor = weekday === 6 ? 1450 + Number(state.id) * 150 : 0;
      const salary = date.getUTCDate() === 28 ? 8200 + Number(state.id) * 350 : 0;
      const electricity = date.getUTCDate() === 15 ? round(3400 + Math.sin(index / 30) * 450 + Number(state.id) * 180) : 0;
      const otherCost = sum(otherItems, 'amount');
      const dailyCost = round(feedCost + otherCost + labor + salary + electricity);
      state.cumulativeCost = round(state.cumulativeCost + dailyCost);
      state.cumulativeEggs += eggs;
      if (weekday === 0) state.weekEggs = 0;
      state.weekEggs += eggs;
      state.stock += eggs;
      let sold = 0;
      if (weekday === 2 || weekday === 5) {
        sold = Math.floor(state.stock * (weekday === 5 ? 0.94 : 0.83) / 30) * 30;
        state.stock -= sold;
      }
      const salePrice = round(1.16 + Math.sin(index / 31 + offset) * 0.075 + (lotId === 'previous' ? -0.06 : 0), 3);
      const sales = round(sold * salePrice);
      return {
        mort: deaths, oeufs: eggs, normal, double, white, broken, lost,
        effectif_debut: opening, effectif_fin: state.birds, aliment_kg: feed,
        eggMass: eggs * eggWeight / 1000, _feedCost: feedCost, _dailyTotal: dailyCost,
        _labor: labor, _salary: salary, _electricity: electricity,
        _otherItems: otherItems, _dailySold: sold, _dailySales: sales,
        totalDepenses: state.cumulativeCost, cumEggs: state.cumulativeEggs,
        cumDead: state.cumulativeDeaths, oeufs_cum: state.weekEggs,
      };
    });
    const eggs = sum(records, 'oeufs');
    const opening = sum(records, 'effectif_debut');
    const remaining = sum(records, 'effectif_fin');
    const feed = round(sum(records, 'aliment_kg'), 1);
    const feedCost = round(sum(records, '_feedCost'));
    const cost = round(sum(records, '_dailyTotal'));
    const eggMass = sum(records, 'eggMass');
    const sold = sum(records, '_dailySold');
    const sales = round(sum(records, '_dailySales'));
    const cumulativeCost = round(sum(records, 'totalDepenses'));
    const otherItems = records.flatMap((record) => record._otherItems);
    const otherQuantity = sum(otherItems, 'quantity');
    const deaths = sum(records, 'mort');
    days.push({
      id: 'demo-' + lotId + '-' + buildingId + '-' + dateIso, rowType: 'day',
      date: date.toLocaleDateString('fr-FR', { timeZone: 'UTC' }), dateIso,
      _weekKey: key, _expectedBuildings: buildings.length, _actualBuildings: buildings.length,
      effectif_debut: opening, effectif_fin: remaining, birds: remaining,
      mort: deaths, mort_pct: round(deaths / opening * 100, 2),
      oeufs: eggs, oeufs_cum: sum(records, 'oeufs_cum'), ponte_pct: round(eggs / opening * 100, 2),
      normal: sum(records, 'normal'), double: sum(records, 'double'),
      white: sum(records, 'white'), broken: sum(records, 'broken'), lost: sum(records, 'lost'),
      cumEggs: sum(records, 'cumEggs'), cumDead: sum(records, 'cumDead'),
      cumDeadRate: sum(records, 'cumDead') / initial * 100,
      formule: formula, aliment_kg: feed, prix_aliment: feedCost / feed,
      g_poule: feed * 1000 / opening, g_oeuf: feed * 1000 / eggs,
      poidsOeuf: eggMass * 1000 / eggs, eggMass, fcr: feed / eggMass,
      autres: otherItems.map((item) => item.label + ': ' + item.quantity + ' × ' + formatMoney(item.price)).join(' · ') || '—',
      autresQuantite: otherQuantity || null, autresPrix: otherQuantity ? sum(otherItems, 'amount') / otherQuantity : null,
      _otherItems: otherItems, _labor: sum(records, '_labor'),
      _salary: sum(records, '_salary'), _electricity: round(sum(records, '_electricity')),
      _feedCost: feedCost, feedcost: feedCost, _dailyTotal: cost, cost,
      depensesSemaine: cost, totalDepenses: cumulativeCost, costPerEgg: cost / eggs,
      _dailySold: sold, _dailySales: sales, sold, sales, margin: sales - cost,
      ventesSemaine: null, prixOeuf: null, weeklyEggPrice: null,
    });
  }
  const weeks = new Map();
  days.forEach((day) => {
    const totals = weeks.get(day._weekKey) || { sales: 0, sold: 0, charges: 0, feed: 0 };
    totals.sales += day._dailySales;
    totals.sold += day._dailySold;
    totals.charges += day._dailyTotal - day._feedCost;
    totals.feed += day._feedCost;
    weeks.set(day._weekKey, totals);
  });
  return days.map((day) => {
    const week = weeks.get(day._weekKey);
    return {
      ...day, _weekSales: { value: round(week.sales), quantity: week.sold },
      _weekCharges: { total: round(week.charges) }, _weekCost: round(week.charges + week.feed),
    };
  });
}
