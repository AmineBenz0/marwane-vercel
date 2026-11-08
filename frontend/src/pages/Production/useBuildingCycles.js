import { useCallback, useEffect, useState } from 'react';
import { cycleProductionService } from '../../services/productionService';

export default function useBuildingCycles(buildingId) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((old) => old + 1), []);
  useEffect(() => {
    let cancelled = false;
    cycleProductionService.getCycles({ id_batiment: buildingId }).then((rows) => {
      if (!cancelled) setResult({ buildingId, revision, cycles: rows || [] });
    }).catch((err) => {
      if (cancelled) return;
      const detail = err.data?.detail || err.response?.data?.detail;
      const error = typeof detail === 'string' ? detail : err.message || 'Impossible de charger les lots.';
      setResult({ buildingId, revision, error });
    });
    return () => { cancelled = true; };
  }, [buildingId, revision]);
  const current = result?.buildingId === buildingId && result.revision === revision;
  const cycles = result?.buildingId === buildingId ? result.cycles || [] : [];
  return { cycles, loaded: current && !result.error, error: current ? result.error : '', reload };
}
