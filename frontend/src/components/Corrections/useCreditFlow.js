import { useRef, useState } from 'react';
import { post } from '../../services/api';
import { announceCorrection } from './useCorrectionFlow';

export default function useCreditFlow(onSaved, basePath = '/credits') {
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const running = useRef(false);
  const command = useRef(null);
  const prepare = async values => {
    if (running.current || uncertain) return;
    running.current = true; setBusy(true); setError(''); setStale(false); command.current = null;
    try {
      const next = { ...values, operation_id: crypto.randomUUID() };
      const preview = await post(`${basePath}/preview`, next);
      command.current = { command: next, dependency_fingerprint: preview.dependency_fingerprint };
      setReview(preview);
    } catch (err) { setError(err.message || 'Le crédit ne peut pas être vérifié.'); }
    finally { running.current = false; setBusy(false); }
  };
  const confirm = async () => {
    if (running.current || !command.current || stale) return;
    running.current = true; setBusy(true); setError('');
    let result;
    try { result = await post(`${basePath}/apply`, command.current); }
    catch (err) {
      const ambiguous = !err.status || err.status >= 500;
      setUncertain(ambiguous); setStale(err.status === 409);
      setError(ambiguous ? 'La réponse n’a pas été reçue. Vérifiez le même enregistrement sans le doubler.' : err.message);
    } finally { running.current = false; setBusy(false); }
    if (result) {
      command.current = null; setUncertain(false); setStale(true);
      try { await onSaved(result); }
      catch { setError('L’opération est enregistrée. Rechargez la page pour voir les derniers soldes.'); }
      finally { announceCorrection(); }
    }
  };
  return { review, busy, error, uncertain, stale, prepare, confirm,
    back: () => { if (!running.current && !uncertain) { command.current = null; setReview(null); setError(''); setStale(false); } } };
}
