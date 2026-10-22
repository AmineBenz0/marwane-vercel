import { describe, it, expect, vi } from 'vitest';
import { createReferenceCache } from './referenceCache';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

describe('reference data cache', () => {
  it('shares concurrent reads and returns independent copies', async () => {
    const cache = createReferenceCache();
    const pending = deferred();
    const load = vi.fn(() => pending.promise);
    const first = cache.get('buildings', 'session-a', load);
    const second = cache.get('buildings', 'session-a', load);
    pending.resolve([{ nom: 'A' }]);
    const [a, b] = await Promise.all([first, second]);
    a[0].nom = 'edited';
    expect(b[0].nom).toBe('A');
    expect(await cache.get('buildings', 'session-a', load)).toEqual([{ nom: 'A' }]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('expires results and isolates sessions and filter keys', async () => {
    let time = 0;
    const cache = createReferenceCache({ ttl: 100, now: () => time });
    const load = vi.fn().mockResolvedValue([]);
    await cache.get('active', 'a', load);
    await cache.get('active', 'a', load);
    await cache.get('inactive', 'a', load);
    time = 100;
    await cache.get('active', 'a', load);
    await cache.get('active', 'b', load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('does not cache failures', async () => {
    const cache = createReferenceCache();
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(['ok']);
    await expect(cache.get('buildings', 'a', load)).rejects.toThrow('offline');
    expect(await cache.get('buildings', 'a', load)).toEqual(['ok']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a read completing after invalidation cannot replace newer data', async () => {
    const cache = createReferenceCache();
    const pending = deferred();
    const old = cache.get('buildings', 'a', () => pending.promise);
    cache.clear();
    await cache.get('buildings', 'a', () => Promise.resolve(['new']));
    pending.resolve(['old']);
    await old;
    expect(await cache.get('buildings', 'a', () => Promise.resolve(['unexpected']))).toEqual(['new']);
  });
});
