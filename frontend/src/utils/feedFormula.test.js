import { describe, expect, it } from 'vitest';
import { carriedFeedFormula } from './feedFormula';

const formulas = [
  { value: '25-1% Sem vita', age_min: 18, age_max: 25 },
  { value: '26-35 Sem', age_min: 26, age_max: 35 },
  { value: '36-45 Sem', age_min: 36, age_max: 45 },
  { value: '46-55 Sem', age_min: 46, age_max: 55 },
];
const selection = { value: '26-35 Sem', age: 24, date: '2026-01-01', cycleId: 1, buildingId: 7 };
const cycle = (age, id = 1) => ({ id_cycle: id, age_semaines: age, formule_suggeree: '25-1% Sem vita' });

describe('unsaved formula selections', () => {
  it('carries forward and resumes normal even after skipping the matching phase', () => {
    expect(carriedFeedFormula(selection, cycle(25), formulas, '2026-01-02', 7)).toBe('26-35 Sem');
    expect(carriedFeedFormula(selection, cycle(26), formulas, '2026-02-01', 7)).toBe('26-35 Sem');
    expect(carriedFeedFormula(selection, cycle(36), formulas, '2026-04-01', 7)).toBe('36-45 Sem');
  });
  it('keeps a backward exception but resumes once the normal option is selected', () => {
    expect(carriedFeedFormula({ ...selection, age: 40 }, cycle(46), formulas, '2026-02-01', 7)).toBe('26-35 Sem');
    expect(carriedFeedFormula({ ...selection, value: '36-45 Sem', age: 40 }, cycle(46), formulas, '2026-02-01', 7)).toBe('46-55 Sem');
  });
  it('never applies an unsaved selection to another lot, building, or earlier date', () => {
    expect(carriedFeedFormula(selection, cycle(24, 2), formulas, '2026-01-02', 7)).toBe('25-1% Sem vita');
    expect(carriedFeedFormula(selection, cycle(24), formulas, '2026-01-02', 8)).toBe('25-1% Sem vita');
    expect(carriedFeedFormula(selection, cycle(24), formulas, '2025-12-31', 7)).toBe('25-1% Sem vita');
  });
});
