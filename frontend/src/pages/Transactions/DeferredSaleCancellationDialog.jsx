import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Stack, Typography,
} from '@mui/material';
import { get, post } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import { formatShortDate } from '../../utils/dateFormatting';

const money = value => formatMontant(value, { useCompactNotation: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eggs = value => `${Number(value || 0).toLocaleString('fr-FR')} œufs`;

const Row = ({ label, value, strong = false }) => <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
  <Typography variant="body2" color="text.secondary">{label}</Typography>
  <Typography variant="body2" fontWeight={strong ? 800 : 700} sx={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</Typography>
</Stack>;

// A fresh secure UUID identifies one user-approved request. It is preserved
// across network retries until the confirmation is explicitly abandoned.
function newOperationId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const chars = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${chars.slice(0, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}-${chars.slice(16, 20)}-${chars.slice(20)}`;
}

/** One explicit, irreversible stock+commercial-avoir action; never refunds cash. */
export default function DeferredSaleCancellationDialog({
  open, transactionId, onClose, onCompleted, onStale,
}) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const operationId = useRef(null);

  useEffect(() => {
    if (!open || !transactionId) return undefined;
    let alive = true;
    operationId.current = newOperationId();
    setPreview(null);
    setError('');
    setStale(false);
    setLoading(true);
    get(`/transactions/${transactionId}/cancel-remainder/preview`)
      .then(quote => { if (alive) setPreview(quote); })
      .catch(err => { if (alive) setError(err?.message || "Impossible de calculer l'avoir. Actualisez la vente."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, transactionId]);

  const close = () => {
    if (!submitting) onClose?.();
  };

  const confirm = async () => {
    if (!preview || submitting || stale || !operationId.current) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await post(`/transactions/${transactionId}/cancel-remainder`, {
        operation_id: operationId.current,
        expected_version: preview.expected_version,
        quantite_en_attente_attendue: preview.quantite_en_attente_attendue,
        montant_paye_attendu: preview.montant_paye,
        date_effet_attendue: preview.date_effet,
      });
      await onCompleted?.(result);
      onClose?.();
    } catch (err) {
      // If the server accepted the write but the response was lost, the same
      // operation_id is safe to resubmit. A 409 is different: refresh all
      // sale/stock figures instead of proposing a stale quantity or amount.
      if (err?.status === 409 || err?.response?.status === 409) setStale(true);
      setError(err?.message || "L'annulation n'a pas pu être confirmée. Vérifiez la vente avant de réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  return <Dialog open={Boolean(open)} onClose={close} fullWidth maxWidth="sm"
    aria-labelledby="cancel-deferred-sale-heading">
    <DialogTitle id="cancel-deferred-sale-heading">Annuler les œufs restants ?</DialogTitle>
    <DialogContent dividers>
      {loading ? <Stack alignItems="center" spacing={1.5} sx={{ py: 3 }}>
        <CircularProgress size={26} aria-label="Calcul de l'avoir" />
        <Typography variant="body2">Vérification de la vente…</Typography>
      </Stack> : preview ? <Stack spacing={2}>
        <Typography variant="body2">
          Seuls les œufs encore non attribués seront annulés. Les œufs déjà livrés et les paiements enregistrés restent inchangés.
        </Typography>
        <Stack spacing={1}>
          <Row label="Œufs déjà couverts" value={eggs(preview.quantite_couverte)} />
          <Row label="Œufs à annuler" value={eggs(preview.quantite_annulee)} strong />
          <Row label="Date de l'avoir" value={formatShortDate(preview.date_effet)} />
        </Stack>
        <Divider />
        <Stack spacing={1}>
          <Row label="Montant initial" value={money(preview.montant_initial)} />
          <Row label="Nouvel avoir commercial" value={`− ${money(preview.montant_avoir)}`} strong />
          <Row label="Montant net après annulation" value={money(preview.montant_net)} strong />
          <Row label="Déjà payé" value={money(preview.montant_paye)} />
          <Row label={Number(preview.montant_restant) < 0 ? 'Crédit client' : 'Reste à encaisser'}
            value={money(Math.abs(Number(preview.montant_restant)))} strong />
        </Stack>
        <Alert severity="info">
          Cette annulation est définitive et crée un avoir commercial. Aucun remboursement ni mouvement de caisse n'est effectué automatiquement.
        </Alert>
      </Stack> : null}
      {error && <Alert severity={stale ? 'warning' : 'error'} sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}>
      <Button onClick={close} disabled={submitting}>Retour</Button>
      {stale ? <Button variant="contained" onClick={() => { onStale?.(); close(); }}>Actualiser la vente</Button>
        : <Button variant="contained" color="error" disabled={!preview || loading || submitting}
          onClick={confirm} aria-label={error ? 'Réessayer' : "Confirmer l'annulation des œufs restants"}>
          {submitting ? 'Enregistrement…' : error ? 'Réessayer' : "Confirmer l'annulation"}
        </Button>}
    </DialogActions>
  </Dialog>;
}
