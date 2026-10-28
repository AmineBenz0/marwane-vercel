export const fmt = (value, digits = 0) => value == null || value === '' || !Number.isFinite(Number(value))
  ? '—'
  : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: digits });

export const fmtDh = (value, digits = 2) => value == null || !Number.isFinite(Number(value))
  ? '—'
  : fmt(value, digits) + ' DH';

const isValidIsoDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const dateAtNoon = (value) => isValidIsoDate(value) ? new Date(value + 'T12:00:00') : null;

export const isoDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const dateOnly = date.toISOString().slice(0, 10);
  return isValidIsoDate(dateOnly) ? dateOnly : '';
};

const dateFromDisplay = (value) => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const date = match[3] + '-' + match[2] + '-' + match[1];
  return isValidIsoDate(date) ? date : '';
};

// Labels are localized; row identity and period filtering use the source date.
export const parseRowDate = (row) => isValidIsoDate(row.date_production)
  ? row.date_production
  : dateFromDisplay(row.date);

export const sumPresent = (rows, key) => {
  const values = rows.map((row) => row[key])
    .filter((value) => value != null && value !== '' && Number.isFinite(Number(value)));
  return values.length ? values.reduce((total, value) => total + Number(value), 0) : null;
};

export const weekStart = (value) => {
  const date = dateAtNoon(value);
  if (!date) return '';
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

export const weekEnd = (value) => {
  const date = dateAtNoon(value);
  if (!date) return '';
  date.setDate(date.getDate() + 6);
  return date.toISOString().slice(0, 10);
};

export const dateLabel = (value) => dateAtNoon(value)
  ?.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) || '—';
export const weekLabel = (value) => dateLabel(value) + ' – ' + dateLabel(weekEnd(value));

export const isMatch = (value, pattern) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll('œ', 'oe').includes(pattern);

export const chargeBucket = (charge) => {
  const text = [charge.libelle, charge.categorie].filter(Boolean).join(' ').toLowerCase().replace(/[-']/g, ' ');
  if (charge.source_journaliere || charge.id_vaccin || isMatch(text, 'vaccin')) return 'vaccine';
  if (isMatch(text, 'main d oeuvre') || isMatch(text, 'main oeuvre') || isMatch(text, 'cnss')) return 'labor';
  if (isMatch(text, 'salaire')) return 'salary';
  if (isMatch(text, 'electricite') || isMatch(text, 'electric')) return 'electricity';
  return 'other';
};

export const parseMoney = (charge) => Number(charge.montant || 0);

export const groupCycles = (cycles) => {
  const grouped = new Map();
  cycles.forEach((cycle) => {
    const key = String(cycle.id_lot || 'cycle-' + cycle.id_cycle);
    if (!grouped.has(key)) grouped.set(key, { key, cycles: [] });
    grouped.get(key).cycles.push(cycle);
  });
  return [...grouped.values()].map((group) => ({ ...group, cycle: group.cycles[0] }));
};

export function aggregateDays(dayRows, label, rowType = 'summary') {
  if (!dayRows.length) return null;
  const sum = (key) => dayRows.reduce((total, row) => total + Number(row[key] || 0), 0);
  const eggs = sumPresent(dayRows, 'oeufs');
  const deaths = sumPresent(dayRows, 'mort');
  const birdDays = sum('effectif_debut');
  const feed = sumPresent(dayRows, 'aliment_kg');
  const cost = dayRows.every((row) => row._dailyTotal != null) ? sum('_dailyTotal') : null;
  const sales = sum('_dailySales');
  const sold = sum('_dailySold');
  const hasWeights = dayRows.every((row) => !Number(row.oeufs) || row.eggMass != null);
  const last = dayRows[dayRows.length - 1];
  const formulas = [...new Set(dayRows.map((row) => row.formule).filter((value) => value && value !== '—' && value !== '-'))];
  const otherItems = dayRows.flatMap((row) => row._otherItems || []);
  const totalOther = otherItems.reduce((total, item) => total + Number(item.amount || 0), 0);
  const typeSummary = ['normal', 'double', 'white', 'broken', 'lost'].reduce((result, key) => {
    result[key] = sumPresent(dayRows, key);
    return result;
  }, {});
  return {
    ...last, ...typeSummary,
    id: rowType + '-' + dayRows[0].dateIso + '-' + label,
    rowType,
    _weekSpan: new Set(dayRows.map((row) => row._weekKey)).size,
    date: label,
    mort: deaths,
    mort_pct: birdDays ? (deaths / birdDays * 100).toFixed(2) : null,
    oeufs: eggs,
    oeufs_cum: last.oeufs_cum,
    weekCumEggs: eggs,
    ponte_pct: birdDays ? (eggs / birdDays * 100).toFixed(2) : null,
    formule: formulas.join(', ') || '—',
    aliment_kg: feed,
    prix_aliment: feed && cost != null ? sum('_feedCost') / feed : null,
    g_poule: birdDays && feed != null ? (feed * 1000 / birdDays).toFixed(1) : null,
    g_oeuf: eggs && feed != null ? (feed * 1000 / eggs).toFixed(1) : null,
    poidsOeuf: eggs && hasWeights ? dayRows.reduce((total, row) => total + Number(row.poidsOeuf || 0) * Number(row.oeufs || 0), 0) / eggs : null,
    autres: fmtDh(totalOther),
    autresQuantite: otherItems.length ? otherItems.reduce((total, item) => total + Number(item.quantity || 0), 0) : null,
    autresPrix: sum('autresQuantite') > 0 ? totalOther / sum('autresQuantite') : null,
    _labor: sum('_labor'),
    _salary: sum('_salary'),
    _electricity: sum('_electricity'),
    _feedCost: cost == null ? null : sum('_feedCost'),
    _dailyTotal: cost,
    depensesSemaine: cost,
    totalDepenses: last.totalDepenses,
    ventesSemaine: sales,
    _sales: sales,
    _sold: sold,
    prixOeuf: sold ? sales / sold : null,
    birds: last.effectif_fin,
    cumDead: last.cumDead,
    cumDeadRate: last.cumDeadRate,
    cumEggs: last.cumEggs,
    eggMass: eggs && hasWeights ? dayRows.reduce((total, row) => total + Number(row.poidsOeuf || 0) * Number(row.oeufs || 0), 0) / 1000 : null,
    fcr: hasWeights && sum('eggMass') > 0 ? feed / sum('eggMass') : null,
    cost,
    feedcost: cost == null ? null : sum('_feedCost'),
    costPerEgg: eggs && cost != null ? cost / eggs : null,
    sold,
    sales,
    margin: cost == null ? null : sales - cost,
    weeklyEggPrice: sold ? sales / sold : null,
    expected: dayRows.reduce((total, row) => total + Number(row._expectedBuildings || 0), 0),
  };
}

export function aggregateDemoDays(dayRows, label, rowType = 'summary') {
  const row = aggregateDays(dayRows, label, rowType);
  if (!row) return null;
  const sum = (key) => dayRows.reduce((total, day) => total + Number(day[key] || 0), 0);
  const cost = sum('_dailyTotal');
  const sales = sum('_dailySales');
  const sold = sum('_dailySold');
  return {
    ...row, id: 'demo-' + rowType + '-' + dayRows[0].dateIso + '-' + label,
    cost, _dailyTotal: cost, depensesSemaine: cost, costPerEgg: row.oeufs ? cost / row.oeufs : null,
    sales, _sales: sales, ventesSemaine: sales, sold, _sold: sold, margin: cost == null ? null : sales - cost,
    prixOeuf: sold ? sales / sold : null, weeklyEggPrice: sold ? sales / sold : null,
    fcr: row.eggMass ? row.aliment_kg / row.eggMass : null,
  };
}
