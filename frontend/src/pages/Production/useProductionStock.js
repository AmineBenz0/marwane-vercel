import { useCallback, useEffect, useRef, useState } from 'react';
import { productionService } from '../../services/productionService';
import { localToday } from './useProductionView';
import useCorrectionRefresh from '../../components/Corrections/useCorrectionRefresh';

// Current inventory is independent of the date selected for daily activity.
export default function useProductionStock() {
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const reload = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await productionService.getStock(localToday());
      if (request === requestId.current) setStock(result);
    } catch (err) {
      if (request === requestId.current) {
        setStock(null);
        setError(err?.message || 'Impossible de charger le stock actuel.');
      }
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, []);
  useCorrectionRefresh(reload);
  useEffect(() => {
    reload();
    return () => { requestId.current += 1; };
  }, [reload]);
  return { stock, loading, error, reload };
}
