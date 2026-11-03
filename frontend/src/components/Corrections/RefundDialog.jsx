import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DateField from '../../utils/DateField';
import { get, post } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import { formatShortDate } from '../../utils/dateFormatting';
import { getBusinessDateInput } from '../../utils/businessDate';
import { announceCorrection } from './useCorrectionFlow';

export default function RefundDialog({ transaction, credit, onClose, onSaved }) {
  const [values, setValues] = useState(() => ({ montant: String(credit), date_paiement: getBusinessDateInput(), type_paiement: 'cash', id_compte: '', reason: '' }));
  const [accounts, setAccounts] = useState([]);
  const [accountError, setAccountError] = useState('');
  const [reload, setReload] = useState(0);
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const command = useRef(null);
  const running = useRef(false);
  const customer = transaction.id_client !== null && transaction.id_client !== undefined;
  useEffect(() => {
    if (values.type_paiement !== 'virement') return;
    let active = true;
    get('/comptes-bancaires').then(rows => { if (active) { setAccounts(rows); setAccountError(''); } })
      .catch(() => { if (active) setAccountError('Les comptes bancaires ne peuvent pas être chargés.'); });
    return () => { active = false; };
  }, [values.type_paiement, reload]);
  const update = field => event => setValues(v => ({ ...v, [field]: event.target.value }));
  const prepare = async event => {
    event.preventDefault();
    if (running.current || uncertain) return;
    running.current = true; setBusy(true); setError(''); setStale(false);
    try {
      const next = { ...values, operation_id: crypto.randomUUID(), id_transaction: transaction.id_transaction,
        id_compte: values.type_paiement === 'virement' ? Number(values.id_compte) : null };
      const preview = await post('/remboursements/preview', next);
      command.current = { ...next, dependency_fingerprint: preview.dependency_fingerprint };
      setReview(preview);
    } catch (err) { setError(err.message || 'Le remboursement ne peut pas être vérifié.'); }
    finally { running.current = false; setBusy(false); }
  };
  const confirm = async () => {
    if (running.current || !command.current || stale) return;
    running.current = true; setBusy(true); setError('');
    let result;
    try { result = await post('/remboursements/apply', command.current); }
    catch (err) {
      const ambiguous = !err.status || err.status >= 500;
      setUncertain(ambiguous); setStale(err.status === 409);
      setError(ambiguous ? 'La réponse n’a pas été reçue. Réessayez pour vérifier le même remboursement sans le doubler.' : err.message);
    } finally { running.current = false; setBusy(false); }
    if (result) {
      try { await onSaved(result); }
      catch { setError('Le remboursement est enregistré. Rechargez la page pour voir le nouveau solde.'); command.current = null; setStale(true); }
      finally { announceCorrection(); }
    }
  };
  const back = () => { command.current = null; setReview(null); setError(''); setStale(false); };
  return <Dialog open onClose={() => !busy && !uncertain && onClose()} maxWidth="sm" fullWidth aria-labelledby="refund-title"
    PaperProps={{ component: 'form', onSubmit: prepare }}>
    <DialogTitle id="refund-title">{customer ? 'Enregistrer un remboursement au client' : 'Enregistrer un remboursement du fournisseur'}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {review ? <>
        <Typography>{customer ? 'Argent rendu au client' : 'Argent reçu du fournisseur'} : <strong>{formatMontant(review.montant)}</strong></Typography>
        <Typography>Date : {formatShortDate(review.date_paiement)}</Typography>
        <Typography>{review.type_paiement === 'cash' ? (customer ? 'Sortie de caisse' : 'Entrée en caisse')
          : `${customer ? 'Compte débité' : 'Compte crédité'} : ${accounts.find(a => a.id_compte === review.id_compte)?.nom_banque || 'Compte bancaire'}`}</Typography>
        <Typography>Crédit restant après remboursement : <strong>{formatMontant(review.credit_after)}</strong></Typography>
        <Alert severity="info">La vente ou l’achat et les paiements d’origine restent dans l’historique.</Alert>
      </> : <>
        <Typography>Crédit disponible : <strong>{formatMontant(credit)}</strong></Typography>
        <TextField required label="Montant remboursé (MAD)" type="number" value={values.montant} onChange={update('montant')}
          disabled={busy} inputProps={{ min: '0.01', max: credit, step: '0.01' }} />
        <DateField required label="Date du remboursement" value={values.date_paiement} onChange={update('date_paiement')} disabled={busy} fullWidth />
        <TextField select label="Mode du remboursement" value={values.type_paiement} onChange={update('type_paiement')} disabled={busy}>
          <MenuItem value="cash">Espèces</MenuItem><MenuItem value="virement">Virement bancaire</MenuItem>
        </TextField>
        {values.type_paiement === 'virement' && <>
          {accountError && <Alert severity="error" action={<Button onClick={() => setReload(v => v + 1)}>Réessayer</Button>}>{accountError}</Alert>}
          <TextField select required label={customer ? 'Compte débité' : 'Compte crédité'} value={values.id_compte} onChange={update('id_compte')} disabled={busy || Boolean(accountError)}>
            <MenuItem value="">Choisir un compte</MenuItem>
            {accounts.map(a => <MenuItem key={a.id_compte} value={a.id_compte}>{a.nom_banque} · {a.numero_compte}</MenuItem>)}
          </TextField>
        </>}
        <TextField required label="Motif du remboursement" value={values.reason} onChange={update('reason')} disabled={busy}
          multiline rows={2} inputProps={{ minLength: 3, maxLength: 1000 }} />
      </>}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={busy || uncertain}>Annuler</Button>
      {review && !uncertain && <Button onClick={back} disabled={busy}>Revenir aux champs</Button>}
      {review ? <Button variant="contained" onClick={confirm} disabled={busy || stale}>{uncertain ? 'Vérifier l’enregistrement' : 'Confirmer le remboursement'}</Button>
        : <Button type="submit" variant="contained" disabled={busy || values.type_paiement === 'virement' && Boolean(accountError)}>Vérifier le remboursement</Button>}
    </DialogActions>
  </Dialog>;
}
