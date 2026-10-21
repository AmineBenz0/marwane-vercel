import { describe, expect, it } from 'vitest';
import { lotChartDays, lotDailyRows, shiftLotDate } from './lotDetailsData';

describe('lot detail production aggregation', () => {
  it('groups type rows by day, respects the cycle and dates, and counts shared daily fields once as stored', () => {
    const base = { id_cycle: 4, id_batiment: 2, date_production: '2026-10-20', est_actif: true };
    const days = lotDailyRows([
      { ...base, type_oeuf: 'normal', nombre_oeufs: 100, mortalite: 2, consommation_aliment_kg: 12 },
      { ...base, type_oeuf: 'blanc', nombre_oeufs: 20, mortalite: 0, consommation_aliment_kg: 0 },
      { ...base, type_oeuf: 'casse', nombre_oeufs: 3 },
      { ...base, type_oeuf: 'perdu', nombre_oeufs: 2 },
      { ...base, id_cycle: 5, nombre_oeufs: 999 },
      { ...base, date_production: '2026-10-19', nombre_oeufs: 999 },
      { ...base, est_actif: false, nombre_oeufs: 999 },
    ], 4, '2026-10-20', '2026-10-21');
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ eggs: 125, mortality: 2, feed: 12, counts: { normal: 100, blanc: 20, casse: 5 } });
  });

  it('keeps missing days and unrecorded daily fields distinct from recorded zero values', () => {
    const days = lotDailyRows([{ id_cycle: 4, id_batiment: 2, date_production: '2026-10-20', type_oeuf: 'normal', nombre_oeufs: 0 }], 4, '2026-10-19', '2026-10-21');
    expect(days[0]).toMatchObject({ eggs: 0, feed: null, mortality: null });
    expect(lotChartDays(days, '2026-10-19', '2026-10-21')).toEqual([
      { date: '2026-10-19', eggs: null }, { date: '2026-10-20', eggs: 0 }, { date: '2026-10-21', eggs: null },
    ]);
    expect(shiftLotDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});
