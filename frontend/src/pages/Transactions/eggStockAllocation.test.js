import { describe, expect, it } from 'vitest';
import { groupStock, dispatchStock } from './eggStockAllocation';
describe('automatic dated stock', () => {
  it('combines identical eggs and consumes the oldest dates first', () => {
    const groups = groupStock([
      { id_production: 2, date_production: '2026-10-24', type_oeuf: 'normal', calibre: 'moyen', vendable: true, disponible: 1000 },
      { id_production: 1, date_production: '2026-10-23', type_oeuf: 'normal', calibre: 'moyen', vendable: true, disponible: 200 },
      { id_production: 3, date_production: '2026-10-24', type_oeuf: 'normal', calibre: 'gros', vendable: true, disponible: 50 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].disponible).toBe(1200);
    expect(dispatchStock(groups[0].sources, 500).map(s => [s.deducted, s.remaining])).toEqual([[200, 0], [300, 700]]);
  });
});
