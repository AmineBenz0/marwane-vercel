import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import useNotification from './useNotification';

describe('useNotification', () => {
  it('returns a stable object across renders so effects depending on it do not loop', () => {
    const { result, rerender } = renderHook(() => useNotification());
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });
});
