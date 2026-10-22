// Small, session-scoped cache for explicitly requested reference lists only.
// Financial/stock/transaction requests continue to go directly to the API.
export const createReferenceCache = ({ ttl = 60000, now = Date.now, maxEntries = 50 } = {}) => {
  const entries = new Map();
  let currentScope;

  const clear = () => entries.clear();

  const get = (key, scope, load) => {
    if (scope !== currentScope) {
      clear();
      currentScope = scope;
    }
    let entry = entries.get(key);
    if (!entry || (!entry.promise && entry.expires <= now())) {
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entry = {};
      entries.set(key, entry);
      entry.promise = Promise.resolve().then(load).then((value) => {
        // A completed write/logout may have invalidated this in-flight read.
        if (entries.get(key) === entry) {
          entry.value = value;
          entry.expires = now() + ttl;
          entry.promise = null;
        }
        return value;
      }, (error) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
    }
    // Components must not mutate another consumer's cached response.
    return (entry.promise || Promise.resolve(entry.value)).then((value) => structuredClone(value));
  };

  return { get, clear };
};
