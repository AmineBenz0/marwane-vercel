import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DateField from '../../utils/DateField';
import { getBusinessDateInput } from '../../utils/businessDate';
import { formatShortDate } from '../../utils/dateFormatting';
import { formatMontant } from '../../utils/formatNumber';
import { get } from '../../services/api';
import useCreditFlow from './useCreditFlow';

const titles = { advance: 'Enregistrer une avance', return_advance: 'Restituer une avance',
  cancel_allocation: 'Annuler l’affectation', cancel_advance: 'Annuler l’avance' };

export default function CreditOperationDialog({ action, partyType, partyId, advance, allocation, onClose, onSaved }) {
  const cancel = action.startsWith('cancel_');
  const money = ['advance', 'return_advance'].includes(action);
  const [values, setValues] = useState(() => ({ montant: action === 'return_advance' ? String(advance.available) : '',
    date_effet: getBusinessDateInput(), type_paiement: 'cash', id_compte: '' }));
  const [accounts, setAccounts] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const flow = useCreditFlow(onSaved);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    const requests = [];
    if (money && values.type_paiement === 'virement') requests.push(get('/comptes-bancaires').then(rows => { if (active) setAccounts(rows); }));
    Promise.all(requests).catch(err => { if (active) setLoadError(err.message || 'Les comptes ne peuvent pas être chargés.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [money, values.type_paiement, reload]);
  const update = key => event => setValues(v => ({ ...v, [key]: event.target.value }));
  const submit = event => {
    event.preventDefault();
    let payload = { action, reason: titles[action] };
    if (!cancel) payload = { ...payload, montant: values.montant, date_effet: values.date_effet };
    if (money) payload = { ...payload, type_paiement: values.type_paiement, id_compte: values.type_paiement === 'virement' ? Number(values.id_compte) : null };
    if (action === 'advance') payload[partyType === 'client' ? 'id_client' : 'id_fournisseur'] = Number(partyId);
    if (['return_advance', 'cancel_advance'].includes(action)) payload.id_avance = advance.id_avance;
    if (action === 'cancel_allocation') payload.id_affectation = allocation.id_affectation;
    flow.prepare(payload);
  };
  return <Dialog open fullWidth maxWidth="sm" aria-labelledby="credit-dialog-title"
    onClose={() => !flow.busy && !flow.uncertain && onClose()} PaperProps={{ component: 'form', onSubmit: submit }}>
    <DialogTitle id="credit-dialog-title">{titles[action]}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {(flow.error || loadError) && <Alert severity="error" action={loadError ? <Button onClick={() => setReload(v => v + 1)}>Réessayer</Button> : undefined}>{flow.error || loadError}</Alert>}
      {flow.review ? <>
        <Typography>Montant : <strong>{formatMontant(flow.review.montant)}</strong></Typography>
        {!cancel && <Typography>Date : {formatShortDate(values.date_effet)}</Typography>}
        {flow.review.target_transaction && <Typography>Transaction n° {flow.review.target_transaction} · Reste à régler après : <strong>{formatMontant(flow.review.target_remaining_after)}</strong></Typography>}
        {flow.review.source_after !== undefined && <Typography>Avance restant au compte : <strong>{formatMontant(flow.review.source_after)}</strong></Typography>}
        {flow.review.money_effect === 'unchanged' ? <Alert severity="info">Cette annulation rétablit les soldes des transactions. Aucun nouveau mouvement de caisse ou de banque.</Alert>
          : <Alert severity={cancel ? 'warning' : 'info'}>{cancel ? 'Les mouvements de cet enregistrement erroné seront annulés. L’historique sera conservé.'
            : `${flow.review.direction === 'ENTREE' ? 'Argent reçu' : 'Argent versé'} · ${values.type_paiement === 'cash' ? 'Espèces' : `Compte : ${accounts.find(a => a.id_compte === Number(values.id_compte))?.nom_banque || 'Compte bancaire'}`}`}</Alert>}
      </> : <>
        {!cancel && <>
          <TextField required label="Montant (MAD)" type="number" value={values.montant} onChange={update('montant')} disabled={flow.busy} inputProps={{ min: '0.01', step: '0.01' }} />
          <DateField required label="Date de l’opération" value={values.date_effet} onChange={update('date_effet')} disabled={flow.busy} fullWidth />
        </>}
        {money && <>
          <TextField select label="Moyen de règlement" value={values.type_paiement} onChange={update('type_paiement')} disabled={flow.busy}>
            <MenuItem value="cash">Espèces</MenuItem><MenuItem value="virement">Virement bancaire</MenuItem>
          </TextField>
          {values.type_paiement === 'virement' && <TextField select required label="Compte bancaire" value={values.id_compte} onChange={update('id_compte')} disabled={flow.busy || loading}>
            <MenuItem value="">Choisir un compte</MenuItem>{accounts.map(a => <MenuItem key={a.id_compte} value={a.id_compte}>{a.nom_banque} · {a.numero_compte}</MenuItem>)}
          </TextField>}
        </>}
      </>}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={flow.busy || flow.uncertain}>Annuler</Button>
      {flow.review ? <>
        {!flow.uncertain && <Button onClick={flow.back} disabled={flow.busy}>Revenir aux champs</Button>}
        <Button onClick={flow.confirm} variant="contained" disabled={flow.busy || flow.stale}>{flow.uncertain ? 'Vérifier l’enregistrement' : 'Confirmer'}</Button>
      </> : <Button type="submit" variant="contained" disabled={flow.busy || loading || Boolean(loadError)}>Vérifier</Button>}
    </DialogActions>
  </Dialog>;
}
