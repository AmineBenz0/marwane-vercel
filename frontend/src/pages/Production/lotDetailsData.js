import { groupDailyProductions } from '../../utils/dailyProduction';

export const shiftLotDate = (value, days) => {
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export function lotDailyRows(rows, cycleId, start, end) {
  return groupDailyProductions(rows.filter((row) => Number(row.id_cycle) === Number(cycleId)
    && row.date_production >= start && row.date_production <= end)).map((day) => ({
    ...day, eggs: day.collected + day.lost,
    feed: day.rows.some((row) => row.consommation_aliment_kg != null) ? day.feed : null,
    mortality: day.rows.some((row) => row.mortalite != null) ? day.mortality : null,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

export function lotChartDays(rows, start, end) {
  const recorded = new Map(rows.map((row) => [row.date, row]));
  const days = [];
  for (let date = start; date <= end; date = shiftLotDate(date, 1)) {
    days.push({ date, eggs: recorded.get(date)?.eggs ?? null });
  }
  return days;
}

export function downloadLotCsv(lot, rows) {
  const escape = (value) => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
  const data = [
    ['Date', 'Lot', 'Normaux', 'Doubles jaunes', 'Blancs', 'Cass�s / perdus', 'Pertes de volailles', 'Aliment (kg)'],
    ...rows.map((day) => [day.date, lot.nom_lot, day.counts.normal || 0, day.counts.double_jaune || 0,
      day.counts.blanc || 0, day.counts.casse || 0, day.mortality, day.feed]),
  ];
  const url = URL.createObjectURL(new Blob(['\uFEFF' + data.map((row) => row.map(escape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'production-lot-' + lot.id_lot + '.csv';
  link.click();
  URL.revokeObjectURL(url);
}
