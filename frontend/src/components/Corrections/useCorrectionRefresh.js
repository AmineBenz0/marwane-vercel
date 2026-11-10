import { useEffect, useRef } from 'react';
import { CORRECTION_EVENT, CORRECTION_REVISION } from './useCorrectionFlow';
export default function useCorrectionRefresh(refresh) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; });
  useEffect(() => {
    const update = () => latest.current();
    const storage = event => { if (event.key === CORRECTION_REVISION) update(); };
    window.addEventListener(CORRECTION_EVENT, update);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(CORRECTION_EVENT, update); window.removeEventListener('storage', storage); };
  }, []);
}
