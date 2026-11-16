import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CanceledError } from 'axios';
import api, { get, post, clearReferenceCache } from './api';
import useNotificationStore from '../store/notificationStore';

describe('reference cache API integration', () => {
  const originalAdapter = api.defaults.adapter;
  let adapter;

  beforeEach(() => {
    clearReferenceCache();
    localStorage.clear();
    localStorage.setItem('access_token', 'session-a');
    adapter = vi.fn(async (config) => ({
      data: [{ request: config.url }], status: 200, statusText: 'OK', headers: {}, config,
    }));
    api.defaults.adapter = adapter;
  });
  afterEach(() => { api.defaults.adapter = originalAdapter; });

  it('shares explicitly requested lists with equivalent filter order', async () => {
    await Promise.all([
      get('/clients', { referenceData: true, params: { limit: 1000, est_actif: true } }),
      get('/clients', { referenceData: true, params: { est_actif: true, limit: 1000 } }),
    ]);
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('does not cache balances, stock, transactions, or non-opted-in contacts', async () => {
    for (const url of ['/clients', '/caisse/solde/complet', '/productions/stock', '/transactions']) {
      const config = url === '/clients' ? {} : { referenceData: true };
      await get(url, config);
      await get(url, config);
    }
    expect(adapter).toHaveBeenCalledTimes(8);
  });

  it('invalidates after successful writes through helpers and the axios instance', async () => {
    const read = () => get('/batiments', { referenceData: true });
    await read();
    await post('/transactions', {});
    await read();
    await api.put('/batiments/1', {});
    await read();
    expect(adapter).toHaveBeenCalledTimes(5);
  });

  it('invalidates when another tab writes or the authenticated session changes', async () => {
    const read = () => get('/batiments', { referenceData: true });
    await read();
    window.dispatchEvent(new StorageEvent('storage', { key: 'reference-data-revision', newValue: 'changed' }));
    await read();
    localStorage.setItem('access_token', 'session-b');
    await read();
    expect(adapter).toHaveBeenCalledTimes(3);
  });

  it('does not share caller-owned cancellation or custom authorization', async () => {
    for (let i = 0; i < 2; i += 1) {
      await get('/batiments', { referenceData: true, signal: new AbortController().signal });
      await get('/batiments', { referenceData: true, headers: { Authorization: 'custom' } });
    }
    expect(adapter).toHaveBeenCalledTimes(4);
  });
});

describe('background API requests', () => {
  it('suppresses cancelled reads and silent connection failures', async () => {
    const originalAdapter = api.defaults.adapter;
    const notify = vi.spyOn(useNotificationStore.getState(), 'error');
    api.defaults.adapter = async (config) => {
      if (config.signal) throw new CanceledError('Cancelled', config, {});
      throw Object.assign(new Error('Connection lost'), { config, request: {} });
    };
    try {
      await expect(get('/transactions/deferred-sales', { signal: new AbortController().signal }))
        .rejects.toMatchObject({ code: 'ERR_CANCELED' });
      await expect(get('/transactions/deferred-sales', { silent: true }))
        .rejects.toMatchObject({ status: null });
      expect(notify).not.toHaveBeenCalled();

      await expect(get('/transactions/deferred-sales')).rejects.toMatchObject({ status: null });
      expect(notify).toHaveBeenCalledTimes(1);
    } finally {
      api.defaults.adapter = originalAdapter;
      notify.mockRestore();
      useNotificationStore.setState({ notifications: [] });
    }
  });
});
