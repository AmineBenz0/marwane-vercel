import { describe, expect, it } from 'vitest';
import { axisEggValue, eggAxis, plotEggValue } from './lotEggChartScale';

const series = ['normal', 'blanc', 'double_jaune', 'double_jaune_demarrage', 'casse'].map((key) => ({ key }));
const weeks = [
  { normal: 240000, blanc: 1000, double_jaune: 12, double_jaune_demarrage: 0, casse: 200 },
  { normal: 60000, blanc: 2000, double_jaune: 4, double_jaune_demarrage: 0, casse: 350 },
  { normal: null, blanc: null, double_jaune: null, double_jaune_demarrage: null, casse: null },
];

describe('Egg chart readability', () => {
  it('keeps rare counts readable on one axis across a 20,000-fold volume disparity', () => {
    const axis = eggAxis(weeks, series);
    expect(axis.compressed).toBe(true);
    expect(plotEggValue(12, true)).toBeGreaterThan(axis.domain[1] * 0.15);
    expect(axis.ticks.map((tick) => axisEggValue(tick, true))).toEqual([0, 1, 10, 100, 1000, 10000, 100000, 300000]);
    expect(eggAxis(weeks, series, false).domain).toEqual([0, 300000]);
    expect(weeks[2].normal).toBeNull();
    expect(weeks[0].double_jaune).toBe(12);
  });

  it('fits the selected period with integer ticks, a zero baseline and room above real peaks', () => {
    const normal = [series[0]];
    expect(eggAxis(weeks, normal).domain).toEqual([0, 300000]);
    expect(eggAxis(weeks.slice(1), normal).domain).toEqual([0, 80000]);
    expect(eggAxis(weeks, [series[2]]).domain).toEqual([0, 15]);
    const axis = eggAxis(weeks, normal);
    expect(axis.compressed).toBe(false);
    expect(axis.ticks.every(Number.isInteger)).toBe(true);
    expect(axis.ticks[0]).toBe(0);
    expect(axis.ticks.at(-1)).toBe(axis.domain[1]);
  });

  it('handles real zeros, missing weeks, one egg, similar volumes and hiding every curve', () => {
    expect(eggAxis([{ normal: 0 }, { normal: null }], [series[0]]).domain).toEqual([0, 1]);
    expect(eggAxis([{ normal: 1 }], [series[0]]).domain).toEqual([0, 2]);
    expect(eggAxis([{ normal: 100, blanc: 70 }], series.slice(0, 2)).compressed).toBe(false);
    expect(eggAxis(weeks, []).domain).toEqual([0, 1]);
    expect(plotEggValue(null, true)).toBeNull();
    expect(plotEggValue(NaN, true)).toBeNull();
    expect(plotEggValue(0, true)).toBe(0);
    for (const value of [0, 1, 12, 1000, 240000]) expect(axisEggValue(plotEggValue(value, true), true)).toBe(value);
  });
});
