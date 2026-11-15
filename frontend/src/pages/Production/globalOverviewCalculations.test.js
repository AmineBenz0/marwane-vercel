import { describe, expect, it } from 'vitest';
import { belongsToUniqueLotOnDate, eggSaleForCycles, isoDate, weekStart, weekEnd } from './globalOverviewCalculations';

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
    expect(eggSaleForCycles({
      est_promesse:false, quantite:1, montant_total:1.5,
      repartition_stock:[{id_cycle:2,quantite:1,quantite_livree:0}],
    }, cycles)).toEqual({ quantity:1, cents:150 });
  });
  it('does not turn reserved-only deferred eggs into completed sales', () => {
    expect(eggSaleForCycles({
      est_promesse:true, quantite:150, montant_total:150,
      quantites_livrees_par_source:{1:40, 2:0, 3:40},
      repartition_stock:[
        {id_production:1,id_cycle:2,quantite:100},
        {id_production:2,id_cycle:2,quantite:10},
        {id_production:3,id_cycle:1,quantite:40},
      ],
    }, cycles)).toEqual({ quantity:40, cents:4000 });
  });
  it('follows allocation source lots, not the original transaction lot', () => {
    expect(eggSaleForCycles({
      est_promesse:true,id_cycle:1,quantite:20,montant_total:20,
      quantites_livrees_par_source:{1:15},
      repartition_stock:[{id_production:1,id_cycle:2,quantite:20}],
    }, cycles)).toEqual({ quantity:15, cents:1500 });
  });
  it('reconciles credited sales and cent rounding across sources', () => {
    const sale = {
      est_promesse:true, quantite:4, quantite_annulee:1, montant_total:'0.02', montant_net:'0.01',
      quantites_livrees_par_source:{1:1, 2:1, 3:1},
      repartition_stock:[
        {id_production:3,id_cycle:1,quantite:1},
        {id_production:2,id_cycle:2,quantite:1},
        {id_production:1,id_cycle:1,quantite:1},
      ],
    };
    expect(eggSaleForCycles(sale, new Set([1]))).toEqual({ quantity:2, cents:0 });
    expect(eggSaleForCycles(sale, new Set([2]))).toEqual({ quantity:1, cents:1 });
    expect(eggSaleForCycles(sale, new Set([1, 2]))).toEqual({ quantity:3, cents:1 });
    expect(eggSaleForCycles({...sale, repartition_stock:[]}, cycles)).toEqual({ quantity:0, cents:0 });
  });
});

it('uses calendar dates when grouping weeks', () => {
  expect(weekStart('2026-11-01')).toBe('2026-10-26');
  expect(weekEnd('2026-10-26')).toBe('2026-11-01');
  expect(isoDate('2026-02-30')).toBe('');
});
