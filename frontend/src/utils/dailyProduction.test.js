import { describe, expect, it } from 'vitest';
import { groupDailyProductions } from './dailyProduction';

describe('daily production cards', () => {
  it('combines type rows, separates losses and counts daily building facts once', () => {
    const rows = [
      { id_production: 1, id_batiment: 7, date_production: '2026-10-07', type_oeuf: 'normal', nombre_oeufs: 100, grammage: '62', nombre_cartons: 5, mortalite: 2, consommation_aliment_kg: '12' },
      { id_production: 2, id_batiment: 7, date_production: '2026-10-07', type_oeuf: 'blanc', nombre_oeufs: 20, grammage: '62', nombre_cartons: 2 },
      { id_production: 3, id_batiment: 7, date_production: '2026-10-07', type_oeuf: 'perdu', nombre_oeufs: 5, grammage: '0', nombre_cartons: 2 },
      { id_production: 6, id_batiment: 7, date_production: '2026-10-07', type_oeuf: 'casse', nombre_oeufs: 3, grammage: '0', nombre_cartons: 1 },
      { id_production: 4, id_batiment: 7, date_production: '2026-10-06', type_oeuf: 'normal', nombre_oeufs: 60, grammage: '60', nombre_cartons: 3 },
      { id_production: 5, id_batiment: 7, date_production: '2026-10-07', type_oeuf: 'normal', nombre_oeufs: 50, grammage: '62', est_actif: false },
    ];
    const days = groupDailyProductions(rows);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({
      date: '2026-10-07', collected: 120, lost: 8, cartons: 7,
      mortality: 2, feed: 12, grammage: 62,
      counts: { normal: 100, blanc: 20, casse: 8 },
    });
    expect(days[0].representative.id_production).toBe(1);
  });

  it('keeps buildings separate and weights historical grammages by egg count', () => {
    const days = groupDailyProductions([
      { id_batiment: 1, date_production: '2026-10-07', type_oeuf: 'normal', nombre_oeufs: 100, grammage: 60 },
      { id_batiment: 1, date_production: '2026-10-07', type_oeuf: 'normal', nombre_oeufs: 300, grammage: 64 },
      { id_batiment: 2, date_production: '2026-10-07', type_oeuf: 'perdu', nombre_oeufs: 10, grammage: 99 },
    ]);
    expect(days).toHaveLength(2);
    expect(days[0].grammage).toBe(63);
    expect(days[0].counts.normal).toBe(400);
    expect(days[1]).toMatchObject({ collected: 0, lost: 10, grammage: null, counts: { casse: 10 } });
  });
});
