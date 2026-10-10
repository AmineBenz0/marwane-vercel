import { describe, expect, it } from 'vitest';
import { getDefaultPaymentDate } from './paymentDates';

describe('getDefaultPaymentDate', () => {
  it('adds two calendar months to the entry date', () => {
    expect(getDefaultPaymentDate('2026-08-10')).toBe('2026-10-10');
  });

  it('clamps to the final day when the target month is shorter', () => {
    expect(getDefaultPaymentDate('2026-12-31')).toBe('2027-02-28');
  });
});
