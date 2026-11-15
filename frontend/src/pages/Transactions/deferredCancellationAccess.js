/** Release 4 remains hidden until Phase 8 migration + staging approval. */
export const deferredCancellationEnabled = () =>
  import.meta.env.VITE_ENABLE_DEFERRED_CANCELLATION_WRITES === 'true';
