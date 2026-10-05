import { describe, expect, it } from 'vitest';
import { formatMonthYear, formatShortDate, formatShortDateTime } from './dateFormatting';

describe('date formatting', () => {
  it('formats ISO date-only values as dd/MM/yy without shifting the day', () => {
    expect(formatShortDate('2026-10-05')).toBe('05/10/26');
  });

  it('formats Date values and timestamps with a two-digit year', () => {
    expect(formatShortDate(new Date(2026, 9, 5))).toBe('05/10/26');
    expect(formatShortDateTime('2026-10-05T14:07:00')).toBe('05/10/26 14:07');
  });

  it('formats month grouping labels consistently in French', () => {
    expect(formatMonthYear('2026-10')).toBe('oct. 2026');
  });

  it('uses a stable fallback for empty or invalid values', () => {
    expect(formatShortDate(null)).toBe('-');
    expect(formatShortDate('not a date')).toBe('-');
    expect(formatShortDate('', 'N/A')).toBe('N/A');
  });
});
