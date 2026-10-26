import { useCallback, useEffect, useState } from 'react';
import { get } from '../../services/api';

export default function useDeferredSales(enabled = true, refreshKey = 0) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    get('/transactions/deferred-sales').then(data => {
      if (!cancelled) setSales(data || []);
    }).catch(err => {
      if (!cancelled) setError(err.message || 'Impossible de vérifier les livraisons différées.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, refreshKey, revision]);
  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [enabled, reload]);
  return { sales, loading, error, reload };
}
