import { useEffect, useId, useRef, useState } from 'react';
import {
  Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Stack, Typography,
} from '@mui/material';
import { announceCorrection } from '../../components/Corrections/useCorrectionFlow';
import { get, patch } from '../../services/api';

const stockActions = { entree: 'Entrée', sortie: 'Sortie', reservation: 'Réservation rétablie' };

export default function ReactivationReviewDialog({ transaction, onClose, onSaved }) {
  const titleId = useId();
  const [preview, setPreview] = useState(null);
  const [confirmedStock, setConfirmedStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);
  const path = `/transactions/${transaction.id_transaction}/reactivate`;
  const affectsStock = preview && preview.stock_effect !== 'aucun';

  useEffect(() => {
    let active = true;
    setPreview(null);
    setError('');
    setLoading(true);
    setConfirmedStock(false);
    get(`${path}/preview`)
      .then(data => { if (active) setPreview(data); })
      .catch(err => { if (active) setError(err.message || 'La réactivation ne peut pas être vérifiée.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, revision]);

  async function apply() {
    if (submitting.current || !preview || (affectsStock && !confirmedStock)) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      await patch(path, {
        expected_version: preview.expected_version,
        dependency_fingerprint: preview.dependency_fingerprint,
        restore_stock: true,
        restore_cancelled_payments: false,
      });
    } catch (err) {
      setError(err.message || 'La réactivation a échoué.');
      setPreview(null);
      return;
    } finally {
      submitting.current = false;
      setSaving(false);
    }
    onSaved();
    announceCorrection();
  }

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={() => !saving && onClose()} aria-labelledby={titleId}>
      <DialogTitle id={titleId}>Réactiver {transaction.id_client ? 'la vente' : 'l’achat'} ?</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {loading && <CircularProgress aria-label="Vérification de la réactivation" size={24} />}
          {error && <Alert severity="error">{error}</Alert>}
          {!loading && !preview && <Button onClick={() => setRevision(value => value + 1)}>Actualiser l’aperçu</Button>}
          {preview && <>
            {affectsStock ? <>
              <Typography>
                {stockActions[preview.stock_effect]} · {Number(preview.stock_quantity).toLocaleString('fr-FR')}{' '}
                {preview.stock_kind === 'oeufs' ? 'œufs' : 'unités'} · {preview.product_name}
              </Typography>
              {preview.pending_quantity > 0 && <Typography>
                {Number(preview.pending_quantity).toLocaleString('fr-FR')} œufs retourneront dans la file d’attente.
              </Typography>}
              <FormControlLabel
                control={<Checkbox checked={confirmedStock} disabled={saving}
                  onChange={event => setConfirmedStock(event.target.checked)} />}
                label="Confirmer l’effet sur le stock"
              />
            </> : <Typography>Cette transaction ne modifie pas le stock suivi.</Typography>}
            <Typography>
              {preview.cancelled_payments_count} paiement(s) annulé(s) resteront dans l’historique.
              Aucun mouvement de caisse ou de banque ne sera réactivé.
            </Typography>
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Retour</Button>
        <Button variant="contained" onClick={apply}
          disabled={loading || saving || !preview || (affectsStock && !confirmedStock)}>
          {saving ? 'Réactivation…' : 'Confirmer la réactivation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
