import { describe, expect, it, vi } from 'vitest';
import { loadTransactionPages } from './transactionPages';

describe('transaction register pagination for counts and exports', () => {
  it('collects all pages with the same filter and deterministic offsets', async () => {
    const get = vi.fn(async (_path, { params }) => {
      const rows = Array.from({length: 5}, (_, index) => ({id_transaction: 5 - index}));
      return rows.slice(params.skip, params.skip + params.limit);
    });
    const result = await loadTransactionPages(get, {est_actif:true}, 2, 20);
    expect(result.map(row => row.id_transaction)).toEqual([5,4,3,2,1]);
    expect(get.mock.calls.map(([path,{params}]) => [path,params.skip,params.limit,params.est_actif]))
      .toEqual([['/transactions',0,2,true],['/transactions',2,2,true],['/transactions',4,2,true]]);
  });

  it('fails closed rather than exporting duplicated or truncated data', async () => {
    const overlap = vi.fn(async (_path,{params}) =>
      params.skip === 0 ? [{id_transaction:2},{id_transaction:1}]
      : [{id_transaction:1}]);
    await expect(loadTransactionPages(overlap, {}, 2, 10)).rejects.toThrow(/changé/);
    const oversized = vi.fn(async () => [{id_transaction:1},{id_transaction:2}]);
    await expect(loadTransactionPages(oversized, {}, 2, 4)).rejects.toThrow(/trop de transactions/);
  });
});
