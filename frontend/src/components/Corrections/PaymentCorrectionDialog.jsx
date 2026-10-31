import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import DateField from '../../utils/DateField';
import { get } from '../../services/api';
import useCorrectionFlow from './useCorrectionFlow';
import CorrectionReview from './CorrectionReview';
import { changedValues, methods } from './correctionValues';

const initial = payment => ({ date_paiement: payment.date_paiement?.slice(0, 10) || '', montant: String(payment.montant),
  type_paiement: payment.type_paiement, id_compte: payment.id_compte || '', source_reglement: payment.source_reglement || '', notes: payment.notes || '' });
export default function PaymentCorrectionDialog({ payment, transaction, initialChanges = {}, onClose, onSaved }) {
  const fundingOriginal = transaction.id_fournisseur ? payment.source_reglement || (payment.type_paiement === 'virement' && payment.id_compte ? 'banque' : 'caisse') : '';
  const [values, setValues] = useState(() => ({ ...initial(payment), source_reglement: fundingOriginal }));
  const [accounts, setAccounts] = useState([]);
  const [accountError, setAccountError] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const flow = useCorrectionFlow({ entityType: 'paiement', record: payment, onSaved });
  const protectedInstrument = ['cheque', 'lc'].includes(payment.type_paiement) || payment.id_lc;
  const financial = !protectedInstrument && payment.statut === 'valide' && transaction.est_actif !== false;
  const supplier = Boolean(transaction.id_fournisseur);
  const bank = supplier ? values.source_reglement === 'banque' || !values.source_reglement && values.type_paiement === 'virement' && Boolean(values.id_compte)
    : values.type_paiement === 'virement';
  useEffect(() => {
    setValues({ ...initial(payment), source_reglement: fundingOriginal, ...initialChanges }); setReason(''); setError(''); flow.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment.id_paiement]);
  useEffect(() => {
    if (!financial && !payment.id_compte) return;
    let active = true;
    get('/comptes-bancaires').then(rows => { if (active) { setAccounts(rows); setAccountError(''); } })
      .catch(() => { if (active) setAccountError('Les comptes bancaires ne peuvent pas être chargés.'); });
    return () => { active = false; };
  }, [reload, financial, payment.id_compte]);
  const update = field => event => setValues(v => ({ ...v, [field]: event.target.value }));
  const submit = async event => {
    event.preventDefault(); setError('');
    let payload = { notes: values.notes || null };
    if (financial) {
      if (!values.date_paiement || !Number.isFinite(Number(values.montant)) || Number(values.montant) <= 0) { setError('Indiquez une date et un montant positif.'); return; }
      if (bank && !values.id_compte) { setError('Sélectionnez le compte bancaire utilisé.'); return; }
      payload = { ...payload, date_paiement: values.date_paiement, montant: values.montant, type_paiement: values.type_paiement,
        id_compte: bank ? Number(values.id_compte) : null };
      if (supplier && (values.source_reglement !== fundingOriginal || payment.source_reglement || values.type_paiement !== payment.type_paiement)) payload.source_reglement = values.source_reglement;
    }
    const changes = changedValues(payload, payment);
    if (!Object.keys(changes).length) { setError('Aucune valeur n’a changé.'); return; }
    await flow.prepare(changes, reason);
  };
  const names = { id_compte: Object.fromEntries(accounts.map(row => [row.id_compte, `${row.nom_banque} · ${row.numero_compte}`])) };
  return <Dialog open onClose={() => !flow.busy && !flow.uncertain && onClose()} maxWidth="sm" fullWidth
    aria-labelledby="payment-correction-title" PaperProps={{ component: 'form', onSubmit: submit }}>
    <DialogTitle id="payment-correction-title">Modifier le paiement n° {payment.id_paiement}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {flow.review ? <CorrectionReview flow={flow} names={names} transaction={transaction} onCancel={onClose} /> : <>
        {!financial && <Alert severity="info">Les notes peuvent être corrigées ici. Les changements financiers de ce paiement nécessitent son action dédiée.</Alert>}
        {(error || flow.error) && <Alert severity="error" role="alert">{error || flow.error}</Alert>}
        <DateField label="Date du paiement" value={values.date_paiement} onChange={update('date_paiement')} disabled={!financial || flow.busy} fullWidth required />
        <TextField label="Montant (MAD)" type="number" value={values.montant} onChange={update('montant')} disabled={!financial || flow.busy} inputProps={{ min: 0.01, step: '0.01' }} required />
        <TextField select label="Mode de paiement" value={values.type_paiement} disabled={!financial || flow.busy} onChange={event => setValues(v => ({ ...v,
          type_paiement: event.target.value, ...(!supplier && event.target.value !== 'virement' ? { id_compte: '' } : {}),
          ...(supplier && !v.source_reglement && event.target.value === 'virement' && v.type_paiement !== 'virement' ? { source_reglement: 'caisse', id_compte: '' } : {}) }))}>
          {Object.entries(methods).filter(([key]) => !['cheque', 'lc'].includes(key) || key === payment.type_paiement).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
        </TextField>
        {supplier && financial && <TextField select label="Source du règlement" value={values.source_reglement} onChange={event => setValues(v => ({ ...v,
          source_reglement: event.target.value, ...(event.target.value === 'caisse' ? { id_compte: '' } : {}) }))} disabled={flow.busy}>
          {!values.source_reglement && <MenuItem value="">Source enregistrée conservée</MenuItem>}
          <MenuItem value="caisse">Caisse</MenuItem><MenuItem value="banque">Compte bancaire</MenuItem>
        </TextField>}
        {bank && <>
          {accountError && <Alert severity="error" action={<Button onClick={() => setReload(v => v + 1)}>Réessayer</Button>}>{accountError}</Alert>}
          <TextField select label="Compte bancaire" value={values.id_compte || ''} onChange={update('id_compte')} disabled={!financial || flow.busy || Boolean(accountError)} required>
            {!names.id_compte[values.id_compte] && <MenuItem value={values.id_compte || ''}>{values.id_compte ? `Compte n° ${values.id_compte}` : 'Choisir un compte'}</MenuItem>}
            {accounts.map(row => <MenuItem key={row.id_compte} value={row.id_compte}>{names.id_compte[row.id_compte]}</MenuItem>)}
          </TextField>
        </>}
        <TextField label="Notes (optionnel)" value={values.notes || ''} onChange={update('notes')} multiline rows={3} inputProps={{ maxLength: 4000 }} disabled={flow.busy} />
        <TextField label="Commentaire de correction (optionnel)" value={reason} onChange={event => setReason(event.target.value)} inputProps={{ maxLength: 1000 }} disabled={flow.busy} />
      </>}
    </Stack></DialogContent>
    {!flow.review && <DialogActions><Button onClick={onClose} disabled={flow.busy}>Annuler</Button>
      {flow.stale && <Button onClick={flow.refresh} disabled={flow.busy}>Actualiser l’aperçu</Button>}
      <Button type="submit" variant="contained" disabled={flow.busy}>{flow.busy ? 'Vérification…' : 'Vérifier les modifications'}</Button></DialogActions>}
  </Dialog>;
}
