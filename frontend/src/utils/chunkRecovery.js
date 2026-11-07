// Recover from a version-skewed lazy import only once per loaded entry bundle.
// A stale SPA tab may request JS chunks from a Vercel deployment that is no
// longer behind the stable staging alias. Do not reload on ordinary API errors.
const CHUNK_ERROR = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk [\\w-]+ failed|chunkloaderror/i;
const RECOVERY_KEY_PREFIX = 'marwane:chunk-recovery:';

export function isChunkLoadError(error) {
  if (!error) return false;
  const message = String(error?.message || error);
  const name = String(error?.name || '');
  return CHUNK_ERROR.test(message) || CHUNK_ERROR.test(name);
}

export function recoverFailedChunk(error, options = {}) {
  if (!isChunkLoadError(error)) return false;

  const documentRef = options.documentRef ?? document;
  const storage = options.storage ?? window.sessionStorage;
  const locationRef = options.locationRef ?? window.location;

  // Build names are content-hashed by Vite. After a reload, a changed entry
  // filename allows one future recovery when a *new* deployment is released.
  const entry = documentRef.querySelector('script[type="module"][src]')
    ?.getAttribute('src') || 'unknown-entry';
  const marker = RECOVERY_KEY_PREFIX + entry;

  // Storage is required for the safety guard. If access is blocked, prefer
  // showing the error page instead of risking an infinite reload loop.
  try {
    if (storage.getItem(marker) === '1') return false;
    storage.setItem(marker, '1');
  } catch {
    return false;
  }

  try {
    locationRef.reload();
    return true;
  } catch {
    try { storage.removeItem(marker); } catch { /* unavailable storage */ }
    return false;
  }
}
