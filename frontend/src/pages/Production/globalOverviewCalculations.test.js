import { describe, expect, it } from 'vitest';
import { belongsToUniqueLotOnDate } from './globalOverviewCalculations';

describe('common financial entry attribution across lots', () => {
  const cycles = [
    {id_cycle:1,id_lot:10,date_debut:'2026-10-01',date_fin_reelle:'2026-10-10'},
    {id_cycle:2,id_lot:10,date_debut:'2026-10-01',date_fin_reelle:'2026-10-10'},
    {id_cycle:3,id_lot:11,date_debut:'2026-10-05',date_fin_reelle:'2026-10-20'},
  ];
  it('does not double-assign a global expense when two lots overlap', () => {
    expect(belongsToUniqueLotOnDate(cycles, '10', '2026-10-06')).toBe(false);
    expect(belongsToUniqueLotOnDate(cycles, '11', '2026-10-06')).toBe(false);
  });
  it('assigns a global dated expense when only one lot is active, even across two buildings', () => {
    expect(belongsToUniqueLotOnDate(cycles, '10', '2026-10-02')).toBe(true);
    expect(belongsToUniqueLotOnDate(cycles, '11', '2026-10-16')).toBe(true);
    expect(belongsToUniqueLotOnDate(cycles, '10', '2026-10-16')).toBe(false);
    expect(belongsToUniqueLotOnDate(cycles, '10', 'n/a')).toBe(false);
  });
});
