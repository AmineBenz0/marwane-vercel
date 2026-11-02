import { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DateField from '../../utils/DateField';
import { get } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import { formatShortDate } from '../../utils/dateFormatting';
import useCreditFlow from './useCreditFlow';

const metadataLabels = { numero_reference: 'Référence LC', numero_serie: 'Numéro de série', banque_emettrice: 'Banque émettrice' };

export default function LCCorrectionDialog({ lc: sourceLc, cancelUsage = false, onClose, onSaved }) {
  const [lc] = useState(sourceLc);
  const [context, setContext] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [values, setValues] = useState({ montant: String(lc.montant), date_emission: lc.date_emission,
    numero_reference: lc.numero_reference || '', numero_serie: lc.numero_serie || '', banque_emettrice: lc.banque_emettrice || '',
    date_disponibilite: lc.date_disponibilite, notes: lc.notes || '', date_effet: '', id_compte: '',
    holder: `${lc.type_detenteur}:${lc.id_client || lc.id_fournisseur}`, reason: '' });
  const flow = useCreditFlow(onSaved, '/lettres-credit/corrections');
  useEffect(() => {
    let active = true;
    setLoadError('');
    Promise.all([get(`/lettres-credit/${lc.id_lc}/correction-context`), get('/comptes-bancaires'),
      get('/clients', { params: { limit: 1000, est_actif: true } }), get('/fournisseurs', { params: { limit: 1000, est_actif: true } })])
      .then(([data, banks, buyers, sellers]) => {
        if (!active) return;
        setContext(data.plan); setAccounts(banks); setClients(buyers); setSuppliers(sellers);
        setValues(v => ({ ...v, date_effet: data.plan.date_effet || '', id_compte: data.plan.id_compte || '' }));
      }).catch(err => { if (active) setLoadError(err.message || 'Les opérations liées ne peuvent pas être chargées.'); });
    return () => { active = false; };
  }, [lc.id_lc, reload]);
  const update = field => event => setValues(v => ({ ...v, [field]: event.target.value }));
  const submit = event => {
    event.preventDefault();
    const changes = {};
    if (!cancelUsage) {
      for (const field of [...Object.keys(metadataLabels), 'montant', 'date_emission', 'date_disponibilite', 'notes']) {
        const value = ['notes', 'numero_serie', 'banque_emettrice'].includes(field) ? values[field] || null : values[field];
        if (field === 'montant' ? Number(value) !== Number(lc[field]) : value !== (lc[field] ?? null)) changes[field] = value;
      }
      if (context.date_effet && values.date_effet !== context.date_effet) changes.date_effet = values.date_effet;
      if (context.usage === 'deposit' && Number(values.id_compte) !== context.id_compte) changes.id_compte = Number(values.id_compte);
      if (values.holder !== `${lc.type_detenteur}:${lc.id_client || lc.id_fournisseur}`) {
        const [kind, id] = values.holder.split(':');
        changes.id_client = kind === 'client' ? Number(id) : null;
        changes.id_fournisseur = kind === 'fournisseur' ? Number(id) : null;
      }
    }
    flow.prepare({ id_lc: lc.id_lc, expected_version: lc.version_utilisation, action: cancelUsage ? 'cancel_usage' : 'correct', reason: values.reason, changes });
  };
  const preview = flow.review;
  const accountLabel = id => accounts.find(a => a.id_compte === id)?.nom_banque || `Compte n° ${id}`;
  return <Dialog open maxWidth="sm" fullWidth aria-labelledby="lc-correction-title"
    onClose={() => !flow.busy && !flow.uncertain && onClose()} PaperProps={{ component: 'form', onSubmit: submit }}>
    <DialogTitle id="lc-correction-title">{cancelUsage ? 'Annuler l’utilisation de la LC' : 'Corriger la lettre de crédit'}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {(loadError || flow.error) && <Alert severity="error">{loadError || flow.error}</Alert>}
      {loadError && <Button onClick={() => setReload(v => v + 1)}>Réessayer le chargement</Button>}
      {!context && !loadError && <CircularProgress aria-label="Chargement des opérations liées" />}
      {preview ? <>
        {Object.entries(metadataLabels).filter(([k]) => preview.before[k] !== preview.after[k]).map(([k, label]) => <Typography key={k} sx={{ overflowWrap: 'anywhere' }}>
          {label} : {preview.before[k] || 'Non renseigné'} → <strong>{preview.after[k] || 'Non renseigné'}</strong>
        </Typography>)}
        <Typography>Montant de la LC : {formatMontant(preview.before.montant)} → <strong>{formatMontant(preview.after.montant)}</strong></Typography>
        {['date_emission', 'date_disponibilite'].filter(k => preview.before[k] !== preview.after[k]).map(k => <Typography key={k}>
          {k === 'date_emission' ? 'Émission' : 'Disponibilité'} : {formatShortDate(preview.before[k])} → {formatShortDate(preview.after[k])}
        </Typography>)}
        {preview.date_effet && <Typography>Date de l’utilisation : {preview.usage_before?.date_effet ? `${formatShortDate(preview.usage_before.date_effet)} → ` : ''}{formatShortDate(preview.date_effet)}</Typography>}
        {(preview.before.id_client !== preview.after.id_client || preview.before.id_fournisseur !== preview.after.id_fournisseur) && <Typography>Détenteur : {preview.after.id_client ? clients.find(c => c.id_client === preview.after.id_client)?.nom_client : suppliers.find(s => s.id_fournisseur === preview.after.id_fournisseur)?.nom_fournisseur}</Typography>}
        {preview.before.notes !== preview.after.notes && <Typography sx={{ overflowWrap: 'anywhere' }}>Notes : {preview.after.notes || 'Non renseigné'}</Typography>}
        {preview.id_compte && <Typography>Compte après correction : {accountLabel(preview.id_compte)}</Typography>}
        {preview.bank_balances?.map(a => <Typography key={a.id_compte}>Solde de {accountLabel(a.id_compte)} : {formatMontant(a.before)} → <strong>{formatMontant(a.after)}</strong></Typography>)}
        {preview.remaining_after !== null && <Typography>{Number(preview.remaining_after) < 0 ? `Crédit ${preview.balance_side || (lc.id_client ? 'client' : 'fournisseur')} après correction : ` : 'Reste à régler après : '}<strong>{formatMontant(Math.abs(Number(preview.remaining_after)))}</strong></Typography>}
        <Alert severity={cancelUsage ? 'warning' : 'info'}>{cancelUsage
          ? 'L’utilisation et ses mouvements seront annulés ensemble. La LC redeviendra disponible et l’historique sera conservé.'
          : preview.usage === 'cession' ? 'La cession sera remplacée en conservant son historique. Aucun argent supplémentaire en caisse.'
            : preview.money_effect === 'replaced' ? 'Le mouvement lié sera annulé et remplacé une seule fois, avec les nouveaux montant, date et compte.' : 'Aucun changement de caisse ou de banque.'}</Alert>
        <Typography variant="body2">{values.reason}</Typography>
      </> : context && <>
        <Alert severity={cancelUsage ? 'warning' : 'info'}>{cancelUsage ? 'Annulez uniquement une utilisation enregistrée par erreur.'
          : 'Les changements seront appliqués à la LC et à son paiement, sa cession ou son versement lié dans une seule opération.'}</Alert>
        {!cancelUsage && <>
          {Object.entries(metadataLabels).map(([field, label]) => <TextField key={field} label={label} value={values[field]} onChange={update(field)}
            required={field === 'numero_reference'} inputProps={{ maxLength: field === 'banque_emettrice' ? 100 : 50 }} disabled={flow.busy} />)}
          <TextField label="Montant de la LC (MAD)" type="number" value={values.montant} onChange={update('montant')} inputProps={{ min: 0.01, step: '0.01' }} required disabled={flow.busy} />
          <DateField fullWidth required label="Date d’émission" value={values.date_emission} onChange={update('date_emission')} disabled={flow.busy} />
          <DateField fullWidth required label="Date de disponibilité" value={values.date_disponibilite} onChange={update('date_disponibilite')} disabled={flow.busy} />
          {context.date_effet && <DateField fullWidth required label="Date de l’utilisation" value={values.date_effet} onChange={update('date_effet')} disabled={flow.busy} />}
          {context.usage === 'deposit' && <TextField select label="Compte du versement" value={values.id_compte} onChange={update('id_compte')} required disabled={flow.busy}>
            {accounts.map(a => <MenuItem key={a.id_compte} value={a.id_compte}>{a.nom_banque} · {a.numero_compte}</MenuItem>)}
          </TextField>}
          {['unused', 'cession'].includes(context.usage) && <TextField select label={context.usage === 'cession' ? 'Destinataire de la cession' : 'Client détenteur'} value={values.holder} onChange={update('holder')} required disabled={flow.busy}>
            {clients.map(c => <MenuItem key={`client:${c.id_client}`} value={`client:${c.id_client}`}>{c.nom_client}</MenuItem>)}
            {context.usage === 'cession' && suppliers.map(s => <MenuItem key={`fournisseur:${s.id_fournisseur}`} value={`fournisseur:${s.id_fournisseur}`}>{s.nom_fournisseur}</MenuItem>)}
          </TextField>}
          <TextField label="Notes" multiline rows={2} value={values.notes} onChange={update('notes')} inputProps={{ maxLength: 4000 }} disabled={flow.busy} />
        </>}
        <TextField label="Motif de la correction" required value={values.reason} onChange={update('reason')} inputProps={{ minLength: 3, maxLength: 1000 }} multiline rows={2} disabled={flow.busy} />
      </>}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={flow.busy || flow.uncertain}>Annuler</Button>
      {preview ? <>
        {!flow.uncertain && <Button onClick={flow.back} disabled={flow.busy}>Revenir aux champs</Button>}
        <Button variant="contained" onClick={flow.confirm} disabled={flow.busy || flow.stale}>{flow.uncertain ? 'Vérifier l’enregistrement' : 'Confirmer la correction'}</Button>
      </> : <Button type="submit" variant="contained" disabled={!context || Boolean(loadError) || flow.busy}>Vérifier les modifications</Button>}
    </DialogActions>
  </Dialog>;
}
