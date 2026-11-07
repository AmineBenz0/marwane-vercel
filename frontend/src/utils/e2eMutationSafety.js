// This gate applies only to mutating browser tests. Read-only E2E needs
// credentials but may safely target ordinary staging.
const LIVE_ORIGINS = new Set([
  'https://marwane-vercel.vercel.app',
  'https://marwane-vercel-git-staging-airzets-projects.vercel.app',
]);

export function canRunMutatingE2E(env) {
  if (env.E2E_MUTATION_TESTS !== 'true' || env.E2E_DISPOSABLE_TARGET !== 'true') {
    return false;
  }
  if (!env.E2E_BASE_URL || !env.E2E_MUTATION_ALLOWED_ORIGIN) {
    return false;
  }
  try {
    const url = new URL(env.E2E_BASE_URL);
    const explicitlyAllowed = new URL(env.E2E_MUTATION_ALLOWED_ORIGIN);
    const localhost = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (!localhost && url.protocol !== 'https:') return false;
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.pathname !== '/' && url.pathname !== '') return false;
    if (url.origin !== explicitlyAllowed.origin) return false;
    // Preview deployment URLs on this project's staging branch share the
    // live staging database. Never allow the same Vercel project under a
    // different immutable deployment hostname either.
    if (LIVE_ORIGINS.has(url.origin)) return false;
    if (url.hostname.endsWith('.vercel.app')
        && url.hostname.startsWith('marwane-vercel-')) return false;
    return true;
  } catch {
    return false;
  }
}
