import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { get } from '../../services/api';
import DateField from '../../utils/DateField';
import { getBusinessDateInput } from '../../utils/businessDate';
import { formatMontant } from '../../utils/formatNumber';
import { formatShortDate } from '../../utils/dateFormatting';
import useCreditFlow from './useCreditFlow';

export default function AdvanceSettlementDialog({ transaction: initialTransaction, partyType, partyId, advance, supplierSource = null, onClose, onSaved, onOtherPayment }) {
  const [transaction] = useState(initialTransaction);
  const [date, setDate] = useState(getBusinessDateInput);
  const [options, setOptions] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [targets, setTargets] = useState({});
  const [extra, setExtra] = useState('');
  const [payExtra, setPayExtra] = useState(true);
  const [method, setMethod] = useState(supplierSource === 'banque' ? 'virement' : 'cash');
  const [account, setAccount] = useState('');
  const flow = useCreditFlow(onSaved, '/credits/settlements');
  const transactionId = transaction?.id_transaction;
  const advanceId = advance?.id_avance;
  const supplier = transaction ? Boolean(transaction.id_fournisseur) : partyType === 'fournisseur';
  const bank = supplier ? supplierSource === 'banque' || !supplierSource && method === 'virement' : method === 'virement';
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setOptions(null);
    const params = { date_effet: date, ...(transactionId ? { id_transaction: transactionId }
      : { [partyType === 'client' ? 'id_client' : 'id_fournisseur']: Number(partyId) }), ...(advanceId ? { id_avance: advanceId } : {}) };
    Promise.all([get('/credits/settlements/options', { params }), get('/comptes-bancaires')]).then(([data, banks]) => {
      if (!active) return;
      setOptions(data); setAccounts(banks);
      setAmount(data.montant_avance);
      setTargets(Object.fromEntries(data.targets.map(t => [t.id_transaction, t.montant])));
      setExtra(Math.max(0, Number(data.targets[0]?.before || 0) - Number(data.montant_avance)).toFixed(2));
    }).catch(err => { if (active) setError(err.message || 'Les avances ne peuvent pas être chargées.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [transactionId, partyType, partyId, advanceId, date, reload]);
  const submit = event => {
    event.preventDefault();
    const command = { date_effet: date, reason: transactionId ? 'Règlement avec avance et complément' : 'Utilisation des avances sur les transactions sélectionnées',
      ...(transactionId ? { id_transaction: transactionId, montant_avance: amount } : {
        [partyType === 'client' ? 'id_client' : 'id_fournisseur']: Number(partyId),
        cibles: options.targets.map(t => ({ id_transaction: t.id_transaction, montant: targets[t.id_transaction] || '0' })) }),
      ...(advanceId ? { id_avance: advanceId } : {}) };
    if (transactionId && payExtra && Number(extra) > 0) command.paiement = {
      date_paiement: date, montant: extra, type_paiement: method, id_compte: bank ? Number(account) : null,
      source_reglement: supplier ? supplierSource || (bank ? 'banque' : 'caisse') : null };
    flow.prepare(command);
  };
  const preview = flow.review;
  const selected = transactionId ? Number(amount) : Object.values(targets).reduce((n, v) => n + Number(v || 0), 0);
  return <Dialog open fullWidth maxWidth="sm" aria-labelledby="advance-settlement-title" onClose={() => !flow.busy && !flow.uncertain && onClose()}
    PaperProps={{ component: 'form', onSubmit: submit }}>
    <DialogTitle id="advance-settlement-title">{transactionId ? 'Régler avec une avance' : 'Utiliser les avances disponibles'}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {(error || flow.error) && <Alert severity="error">{error || flow.error}</Alert>}
      {flow.stale && !flow.uncertain && <Button onClick={() => { flow.back(); setReload(v => v + 1); }}>Actualiser les avances</Button>}
      {error && <Button onClick={() => setReload(v => v + 1)}>Réessayer le chargement</Button>}
      {loading && <CircularProgress size={24} aria-label="Chargement des avances disponibles" />}
      {!preview && <DateField label="Date du règlement" value={date} onChange={event => setDate(event.target.value)} required fullWidth disabled={flow.busy} />}
      {!preview && onOtherPayment && <Button onClick={onOtherPayment} disabled={flow.busy}>Chèque, LC ou autre règlement</Button>}
      {preview ? <>
        <Typography>Avance utilisée : <strong>{formatMontant(preview.montant_avance)}</strong></Typography>
        {Number(preview.payment_amount) > 0 && <Typography>{supplier ? 'Argent supplémentaire à verser' : 'Argent supplémentaire à encaisser'} : <strong>{formatMontant(preview.payment_amount)}</strong></Typography>}
        {preview.targets.filter(t => Number(t.montant) > 0 || transactionId).map(t => <Stack key={t.id_transaction} spacing={0.5} sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
          <Typography fontWeight={600}>{supplier ? 'Achat' : 'Vente'} n°{t.id_transaction} · {formatShortDate(t.date_transaction)}</Typography>
          <Typography variant="body2">Avance : {formatMontant(t.montant)} · Reste après : {formatMontant(t.after)}</Typography>
        </Stack>)}
        <Typography>Avances encore disponibles : <strong>{formatMontant(preview.advance_after)}</strong></Typography>
        <Alert severity="info">{preview.money_effect === 'unchanged' ? 'L’argent de l’avance a déjà été enregistré. Cette utilisation ne crée aucun nouveau mouvement.'
          : `Seul le complément de ${formatMontant(preview.payment_amount)} ${supplier ? 'sortira' : 'entrera'} ${preview.money_effect === 'bank' ? 'sur le compte bancaire' : 'en caisse'}. L’avance et le complément seront enregistrés ensemble.`}</Alert>
      </> : options && <>
        <Alert severity="info">Avances disponibles au {formatShortDate(date)} : <strong>{formatMontant(options.available)}</strong></Alert>
        {transactionId ? <>
          <Typography>Reste à régler : <strong>{formatMontant(options.targets[0]?.before || 0)}</strong></Typography>
          <TextField label="Avance à utiliser (MAD)" type="number" value={amount} onChange={event => { setAmount(event.target.value); setExtra(Math.max(0, Number(options.targets[0]?.before || 0) - Number(event.target.value)).toFixed(2)); }} required
            inputProps={{ min: 0, max: Math.min(Number(options.available), Number(options.targets[0]?.capacity || 0)), step: '0.01' }} disabled={flow.busy} />
          <FormControlLabel control={<Checkbox checked={payExtra} onChange={event => setPayExtra(event.target.checked)} disabled={flow.busy} />} label="Enregistrer le complément maintenant" />
          {payExtra && Number(options.targets[0]?.before || 0) > Number(amount) && <>
            <TextField label={supplier ? 'Complément à verser (MAD)' : 'Complément à encaisser (MAD)'} type="number" value={extra} onChange={event => setExtra(event.target.value)} required disabled={flow.busy} inputProps={{ min: 0.01, step: '0.01' }} />
            <TextField select label="Moyen du complément" value={method} onChange={event => setMethod(event.target.value)} disabled={flow.busy}>
              <MenuItem value="cash">Espèces</MenuItem><MenuItem value="virement">Virement bancaire</MenuItem>
            </TextField>
            {bank && <TextField select required label="Compte bancaire" value={account} onChange={event => setAccount(event.target.value)} disabled={flow.busy}>
              {accounts.map(a => <MenuItem key={a.id_compte} value={a.id_compte}>{a.nom_banque} · {a.numero_compte}</MenuItem>)}
            </TextField>}
          </>}
        </> : <>
          <Typography variant="body2" color="text.secondary">Les plus anciennes transactions sont proposées en premier. Vous pouvez ajuster les montants avant de confirmer.</Typography>
          {options.targets.map(t => <TextField key={t.id_transaction} label={`${supplier ? 'Achat' : 'Vente'} n°${t.id_transaction} · ${formatShortDate(t.date_transaction)}`} type="number" value={targets[t.id_transaction] ?? ''}
            onChange={event => setTargets(v => ({ ...v, [t.id_transaction]: event.target.value }))} helperText={`${t.produit_nom} · Reste : ${formatMontant(t.before)}`} disabled={flow.busy} inputProps={{ min: 0, max: Number(t.capacity), step: '0.01' }} />)}
          {!options.targets.length && <Typography>Aucune transaction à régler à cette date.</Typography>}
          <Typography>Total proposé : <strong>{formatMontant(selected)}</strong></Typography>
        </>}
      </>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={flow.busy || flow.uncertain}>Annuler</Button>
      {preview ? <>{!flow.uncertain && <Button onClick={flow.back} disabled={flow.busy}>Revenir aux champs</Button>}
        <Button variant="contained" onClick={flow.confirm} disabled={flow.busy || flow.stale}>{flow.uncertain ? 'Vérifier l’enregistrement' : 'Confirmer le règlement'}</Button></>
        : <Button type="submit" variant="contained" disabled={flow.busy || loading || Boolean(error) || !options || (selected <= 0 && !(transactionId && payExtra && Number(extra) > 0))}>Vérifier le règlement</Button>}
    </DialogActions>
  </Dialog>;
}
