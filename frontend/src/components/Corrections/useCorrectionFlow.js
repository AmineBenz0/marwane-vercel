import { useRef, useState } from 'react';
import { get, post } from '../../services/api';

export const CORRECTION_EVENT = 'marwane:correction';
export const CORRECTION_REVISION = 'marwane-correction-revision';
export function announceCorrection() {
  window.dispatchEvent(new Event(CORRECTION_EVENT));
  try { localStorage.setItem(CORRECTION_REVISION, crypto.randomUUID()); } catch { /* This tab already refreshes. */ }
}

export default function useCorrectionFlow({ entityType, record, onSaved }) {
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const command = useRef(null);
  const draft = useRef(null);
  const running = useRef(false);
  const entityId = record?.[entityType === 'transaction' ? 'id_transaction' : 'id_paiement'];
  const reset = () => { command.current = null; draft.current = null; setReview(null); setError(''); setUncertain(false); setStale(false); };
  const prepare = async (changes, reason = '', refresh = false) => {
    if (running.current || uncertain) return;
    running.current = true; setBusy(true); setError('');
    command.current = null; setReview(null);
    draft.current = { changes, reason };
    try {
      const current = refresh ? await get(`/${entityType === 'transaction' ? 'transactions' : 'paiements'}/${entityId}`) : record;
      if (!current?.row_version) throw new Error('Rechargez cet enregistrement avant de le modifier.');
      const next = { operation_id: crypto.randomUUID(), reason: reason.trim() || 'Correction des informations enregistrées',
        target: { entity_type: entityType, entity_id: entityId, expected_version: current.row_version }, changes };
      const preview = await post('/corrections/preview', next);
      command.current = { ...next, dependency_fingerprint: preview.dependency_fingerprint };
      setReview(preview); setStale(false);
    } catch (err) { setError(err.message || 'L’aperçu ne peut pas être chargé.'); setStale(err.status === 409); }
    finally { running.current = false; setBusy(false); }
  };
  const confirm = async () => {
    if (running.current || !command.current || stale) return;
    running.current = true; setBusy(true); setError('');
    let result;
    try { result = await post('/corrections/apply', command.current); }
    catch (err) {
      const ambiguous = !err.status || err.status >= 500;
      setUncertain(ambiguous); setStale(err.status === 409);
      setError(ambiguous ? 'La réponse du serveur n’a pas été reçue. Réessayez avec le même enregistrement pour vérifier le résultat sans le doubler.' : err.message);
    } finally { running.current = false; setBusy(false); }
    if (result) {
      reset();
      // Refresh failures must never turn a successful correction into a retry.
      try { await onSaved?.(result); } catch { setError('La correction est enregistrée. Rechargez la page pour voir les dernières valeurs.'); } finally { announceCorrection(); }
    }
  };
  return { review, busy, error, uncertain, stale, prepare, confirm, reset,
    edit: () => { if (!busy && !uncertain) { setReview(null); setError(''); command.current = null; } },
    refresh: () => draft.current && prepare(draft.current.changes, draft.current.reason, true) };
}
