import { describe, expect, it } from 'vitest';
import { vaccineExpenseTotal } from './vaccineExpenses';

describe('vaccine expense decimal totals', () => {
  it('matches monetary half-up rounding', () => {
    expect(vaccineExpenseTotal('1.005', '1')).toBe(1.01);
    expect(vaccineExpenseTotal('2', '50.25')).toBe(100.5);
    expect(vaccineExpenseTotal('0.1', '0.2')).toBe(0.02);
  });
  it('ignores incomplete, nonfinite and overprecision inputs in the preview', () => {
    for (const value of ['', 'Infinity', '-1', '1.0001']) expect(vaccineExpenseTotal(value, '1')).toBe(0);
  });
});
