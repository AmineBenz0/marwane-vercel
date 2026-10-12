// A shared log(1 + count) axis can display zero and widely different counts.
// The original data stays intact for tooltips, totals and exports.
const peak = (weeks, key) => weeks.reduce((maximum, week) => {
  const value = week[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(maximum, value) : maximum;
}, 0);

export function plotEggValue(value, compressed) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return compressed ? Math.log10(1 + value) : value;
}

export function axisEggValue(value, compressed) {
  return compressed ? Math.round(Math.expm1(value * Math.LN10)) : value;
}

export function eggAxis(weeks, series, adapted = true) {
  const maximum = Math.max(0, ...series.map(({ key }) => peak(weeks, key)));
  if (maximum === 0) return { domain: [0, 1], ticks: [0, 1], upper: 1, compressed: false };
  const headroom = maximum * 1.1;
  const roughStep = headroom / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const multiplier = [1, 2, 2.5, 5, 10].find((value) => value >= roughStep / magnitude);
  const step = Math.max(1, Math.ceil(multiplier * magnitude));
  const upper = Math.ceil(headroom / step) * step;
  const positives = weeks.flatMap((week) => series.map(({ key }) => week[key]))
    .filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const compressed = adapted && positives.length > 0 && maximum / Math.min(...positives) >= 10;
  if (compressed) {
    const counts = [0];
    for (let count = 1; count < upper; count *= 10) counts.push(count);
    counts.push(upper);
    return { domain: [0, plotEggValue(upper, true)], ticks: counts.map((value) => plotEggValue(value, true)), upper, compressed };
  }
  return {
    domain: [0, upper],
    ticks: Array.from({ length: Math.round(upper / step) + 1 }, (_, index) => index * step),
    upper,
    compressed,
  };
}
