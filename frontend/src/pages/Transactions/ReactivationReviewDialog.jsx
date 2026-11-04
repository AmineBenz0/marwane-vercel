import { useEffect, useState } from 'react';
import {
  Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Stack, Typography,
} from '@mui/material';
import { get, patch } from '../../services/api';

export default function ReactivationReviewDialog({ transaction, onClose, onSaved }) {
  const [preview, setPreview] = useState(null);
  const [confirmedStock, setConfirmedStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setPreview(null); setError(''); setLoading(true); setConfirmedStock(false);
    get(`/transactions/${transaction.id_transaction}/reactivate/preview`)
      .then(data => { if (active) setPreview(data); })
      .catch(err => { if (active) setError(err.message || 'La réactivation ne peut pas être vérifiée.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [transaction.id_transaction, revision]);

  const apply = async () => {
    if (saving || !preview || (preview.stock_effect !== 'aucun' && !confirmedStock)) return;
    setSaving(true); setError('');
    try {
      await patch(`/transactions/${transaction.id_transaction}/reactivate`, {
        expected_version: preview.expected_version,
        dependency_fingerprint: preview.dependency_fingerprint,
        restore_stock: true,
        restore_cancelled_payments: false,
      });
      await onSaved();
    } catch (err) {
      setError(err.message || 'La réactivation a échoué.');
      // A failed or uncertain apply cannot reuse a possibly stale review.
      setPreview(null);
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open fullWidth maxWidth="sm" onClose={() => !saving && onClose()} aria-labelledby="reactivation-title">
    <DialogTitle id="reactivation-title">Réactiver {transaction.id_client ? 'la vente' : 'l’achat'} ?</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {loading && <CircularProgress aria-label="Vérification de la réactivation" size={24} />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !preview && <Button onClick={() => setRevision(v => v + 1)} disabled={saving}>Actualiser l’aperçu</Button>}
      {preview && <>
        {preview.stock_effect !== 'aucun' ? <>
          <Typography>
            Stock : {preview.stock_effect === 'entree' ? 'entrée' : 'sortie'} de{' '}
            <strong>{Number(preview.stock_quantity).toLocaleString('fr-FR')}</strong>{' '}
            {preview.stock_kind === 'oeufs' ? 'œufs' : 'unités'} · {preview.product_name}
          </Typography>
          <FormControlLabel control={<Checkbox checked={confirmedStock}
            onChange={event => setConfirmedStock(event.target.checked)} disabled={saving} />}
            label="Confirmer la restauration de ce stock" />
        </> : <Typography>Cette transaction ne modifie pas le stock suivi.</Typography>}
        <Typography>
          {preview.cancelled_payments_count} paiement(s) annulé(s) conservé(s) dans l’historique.
          Aucun paiement ni mouvement de caisse ou de banque ne sera réactivé.
        </Typography>
        <Alert severity="info">Le stock et la disponibilité sont revérifiés avant l’enregistrement.</Alert>
      </>}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>Retour</Button>
      <Button variant="contained" onClick={apply}
        disabled={loading || saving || !preview || (preview.stock_effect !== 'aucun' && !confirmedStock)}>
        {saving ? 'Réactivation…' : 'Confirmer la réactivation'}
      </Button>
    </DialogActions>
  </Dialog>;
}
