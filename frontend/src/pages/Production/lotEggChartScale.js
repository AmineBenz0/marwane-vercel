// Keep curves within one order of magnitude together. Missing values never
// become zero; the scale is based only on recorded quantities.
const peak = (weeks, key) => weeks.reduce((maximum, week) => {
  const value = week[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(maximum, value) : maximum;
}, 0);

export function groupEggSeries(weeks, series, commonScale = false) {
  if (!series.length) return [];
  if (commonScale) return [series];
  const ranked = series.map((item) => ({ item, maximum: peak(weeks, item.key) }))
    .sort((a, b) => b.maximum - a.maximum);
  const groups = [];
  ranked.filter(({ maximum }) => maximum > 0).forEach(({ item, maximum }) => {
    const last = groups[groups.length - 1];
    if (last && last.maximum / maximum <= 10) last.series.push(item);
    else groups.push({ maximum, series: [item] });
  });
  const zeros = ranked.filter(({ maximum }) => maximum === 0).map(({ item }) => item);
  if (!groups.length) return [series];
  groups[groups.length - 1].series.push(...zeros);
  return groups.map((group) => series.filter((item) => group.series.includes(item)));
}

export function eggAxis(weeks, series) {
  const maximum = Math.max(0, ...series.map(({ key }) => peak(weeks, key)));
  if (maximum === 0) return { domain: [0, 1], ticks: [0, 1] };
  const headroom = maximum * 1.1;
  const roughStep = headroom / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const multiplier = [1, 2, 2.5, 5, 10].find((value) => value >= roughStep / magnitude);
  const step = Math.max(1, Math.ceil(multiplier * magnitude));
  const upper = Math.ceil(headroom / step) * step;
  return {
    domain: [0, upper],
    ticks: Array.from({ length: Math.round(upper / step) + 1 }, (_, index) => index * step),
  };
}
