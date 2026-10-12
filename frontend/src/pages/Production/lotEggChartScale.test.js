import { describe, expect, it } from 'vitest';
import { eggAxis, groupEggSeries } from './lotEggChartScale';

const series = ['normal', 'blanc', 'double_jaune', 'double_jaune_demarrage', 'casse'].map((key) => ({ key }));
const weeks = [
  { normal: 240000, blanc: 1000, double_jaune: 12, double_jaune_demarrage: 0, casse: 200 },
  { normal: 60000, blanc: 2000, double_jaune: 4, double_jaune_demarrage: 0, casse: 350 },
  { normal: null, blanc: null, double_jaune: null, double_jaune_demarrage: null, casse: null },
];

describe('Egg chart readability', () => {
  it('keeps rare counts readable across a 20,000-fold volume disparity and retains zero categories', () => {
    const groups = groupEggSeries(weeks, series);
    expect(groups.map((group) => group.map(({ key }) => key))).toEqual([
      ['normal'], ['blanc', 'casse'], ['double_jaune', 'double_jaune_demarrage'],
    ]);
    expect(groupEggSeries(weeks, series, true)).toEqual([series]);
    expect(weeks[2].normal).toBeNull();
    expect(weeks[0].double_jaune).toBe(12);
  });

  it('fits the selected period with integer ticks, a zero baseline and room above real peaks', () => {
    const normal = [series[0]];
    expect(eggAxis(weeks, normal).domain).toEqual([0, 300000]);
    expect(eggAxis(weeks.slice(1), normal).domain).toEqual([0, 80000]);
    expect(eggAxis(weeks, [series[2]]).domain).toEqual([0, 15]);
    for (const group of groupEggSeries(weeks, series)) {
      const axis = eggAxis(weeks, group);
      expect(axis.ticks.every(Number.isInteger)).toBe(true);
      expect(axis.ticks[0]).toBe(0);
      expect(axis.ticks.at(-1)).toBe(axis.domain[1]);
    }
  });

  it('handles real zeros, missing weeks, one egg, similar volumes and hiding every curve', () => {
    expect(groupEggSeries([{ normal: 0, blanc: null }], series)).toEqual([series]);
    expect(eggAxis([{ normal: 0 }, { normal: null }], [series[0]])).toEqual({ domain: [0, 1], ticks: [0, 1] });
    expect(eggAxis([{ normal: 1 }], [series[0]]).domain).toEqual([0, 2]);
    expect(groupEggSeries([{ normal: 100, blanc: 70 }], series.slice(0, 2))).toEqual([series.slice(0, 2)]);
    expect(groupEggSeries(weeks, [])).toEqual([]);
  });
});
