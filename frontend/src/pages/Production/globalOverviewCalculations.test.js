import { describe, expect, it } from 'vitest';
import { belongsToUniqueLotOnDate, quantityAttributedToCycle } from './globalOverviewCalculations';

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

describe('egg sale lot attribution and historical stock', () => {
  const cycles = new Set([2]);
  it('attributes ordinary sold stock even without a deferred completion marker', () => {
    expect(quantityAttributedToCycle({
      est_promesse:false,
      repartition_stock:[{id_cycle:2,quantite:1,quantite_livree:0}],
    }, cycles)).toBe(1);
  });
  it('does not turn reserved-only deferred eggs into completed sales', () => {
    expect(quantityAttributedToCycle({
      est_promesse:true,
      repartition_stock:[
        {id_cycle:2,quantite:100,quantite_livree:40},
        {id_cycle:2,quantite:10,quantite_livree:0},
        {id_cycle:1,quantite:40,quantite_livree:40},
      ],
    }, cycles)).toBe(40);
  });
  it('follows allocation source lots, not the original transaction lot', () => {
    expect(quantityAttributedToCycle({
      est_promesse:true,id_cycle:1,
      repartition_stock:[{id_cycle:2,quantite:20,quantite_livree:15}],
    }, cycles)).toBe(15);
  });
});
