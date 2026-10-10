import { describe, expect, it } from 'vitest';
import { getDefaultDueDate } from './dueDates';

describe('getDefaultDueDate', () => {
  it('adds two calendar months to the entry date', () => {
    expect(getDefaultDueDate('2026-08-10')).toBe('2026-10-10');
  });

  it('clamps to the final day when the target month is shorter', () => {
    expect(getDefaultDueDate('2026-12-31')).toBe('2027-02-28');
  });
});
