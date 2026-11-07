import { describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, recoverFailedChunk } from './chunkRecovery';

function environment(entry = '/assets/index-OLD.js') {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const current = { entry };
  const documentRef = {
    querySelector: () => ({ getAttribute: () => current.entry }),
  };
  const locationRef = { reload: vi.fn() };
  return { current, storage, documentRef, locationRef };
}

describe('stale lazy-module recovery after deployment change', () => {
  it('recognizes browser and Vite lazy-chunk errors but not API/network failures', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/MonthlyReportPage-OLD.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Failed to fetch /api/transactions'))).toBe(false);
    expect(isChunkLoadError(new TypeError('Cannot read properties of undefined'))).toBe(false);
  });

  it('reloads exactly once for an old entry and can reload once after a new deployment', () => {
    const env = environment();
    const failure = new TypeError('Failed to fetch dynamically imported module: /assets/MonthlyReportPage-OLD.js');
    expect(recoverFailedChunk(failure, env)).toBe(true);
    expect(env.locationRef.reload).toHaveBeenCalledTimes(1);
    expect(recoverFailedChunk(failure, env)).toBe(false);
    expect(env.locationRef.reload).toHaveBeenCalledTimes(1);

    env.current.entry = '/assets/index-NEW.js';
    expect(recoverFailedChunk(failure, env)).toBe(true);
    expect(env.locationRef.reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload on unrelated errors or when session storage is unavailable', () => {
    const env = environment();
    expect(recoverFailedChunk(new Error('DB unreachable'), env)).toBe(false);
    env.storage.getItem = () => { throw new Error('blocked'); };
    expect(recoverFailedChunk(new Error('Loading chunk X failed'), env)).toBe(false);
    expect(env.locationRef.reload).not.toHaveBeenCalled();
  });

  it('releases the guard if the browser refuses the reload', () => {
    const env = environment();
    env.locationRef.reload.mockImplementationOnce(() => { throw new Error('blocked'); });
    const failure = new Error('Failed to fetch dynamically imported module');
    expect(recoverFailedChunk(failure, env)).toBe(false);
    expect(recoverFailedChunk(failure, env)).toBe(true);
    expect(env.locationRef.reload).toHaveBeenCalledTimes(2);
  });
});
