import { describe, expect, it } from 'vitest';
import { canRunMutatingE2E } from './e2eMutationSafety';

const enabled = {
  E2E_MUTATION_TESTS: 'true',
  E2E_DISPOSABLE_TARGET: 'true',
  E2E_BASE_URL: 'https://ephemeral-phase8-clone.example.org',
  E2E_MUTATION_ALLOWED_ORIGIN: 'https://ephemeral-phase8-clone.example.org',
};

describe('mutating E2E safety gate', () => {
  it('requires a separately approved exact disposable origin', () => {
    expect(canRunMutatingE2E(enabled)).toBe(true);
    expect(canRunMutatingE2E({ ...enabled, E2E_MUTATION_TESTS: 'false' })).toBe(false);
    expect(canRunMutatingE2E({ ...enabled, E2E_DISPOSABLE_TARGET: 'false' })).toBe(false);
    expect(canRunMutatingE2E({ ...enabled, E2E_MUTATION_ALLOWED_ORIGIN: '' })).toBe(false);
    expect(canRunMutatingE2E({ ...enabled, E2E_MUTATION_ALLOWED_ORIGIN: 'https://other.example.org' })).toBe(false);
  });
  it('never mutates the stable staging or production address, even if explicitly allowed', () => {
    for (const url of [
      'https://marwane-vercel.vercel.app',
      'https://marwane-vercel-git-staging-airzets-projects.vercel.app',
      'https://marwane-vercel-e2redhcpf-airzets-projects.vercel.app',
      'https://marwane-vercel-7e0mv794g-airzets-projects.vercel.app',
    ]) {
      expect(canRunMutatingE2E({
        ...enabled, E2E_BASE_URL: url, E2E_MUTATION_ALLOWED_ORIGIN: url,
      })).toBe(false);
    }
  });
  it('fails closed for malformed, non-https or credential-bearing origins', () => {
    expect(canRunMutatingE2E({ ...enabled, E2E_BASE_URL: 'not-a-url' })).toBe(false);
    expect(canRunMutatingE2E({ ...enabled, E2E_BASE_URL: 'http://random.example.org',
      E2E_MUTATION_ALLOWED_ORIGIN: 'http://random.example.org' })).toBe(false);
    expect(canRunMutatingE2E({ ...enabled, E2E_BASE_URL: 'https://u:p@ephemeral-phase8-clone.example.org' })).toBe(false);
  });
  it('supports explicit local disposable targets for development', () => {
    expect(canRunMutatingE2E({
      ...enabled, E2E_BASE_URL: 'http://127.0.0.1:5173',
      E2E_MUTATION_ALLOWED_ORIGIN: 'http://127.0.0.1:5173',
    })).toBe(true);
  });
});
