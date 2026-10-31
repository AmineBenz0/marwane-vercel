import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DateField from '../../utils/DateField';
import { get } from '../../services/api';
import useCorrectionFlow from '../../components/Corrections/useCorrectionFlow';
import CorrectionReview from '../../components/Corrections/CorrectionReview';
import { changedValues, eggCategory, money } from '../../components/Corrections/correctionValues';

const original = tx => ({ date_transaction: tx.date_transaction?.slice(0, 10) || '', date_echeance: tx.date_echeance?.slice(0, 10) || '',
  quantite: String(tx.quantite), prix_unitaire: String(tx.prix_unitaire), id_produit: tx.id_produit || '', id_batiment: tx.id_batiment || '',
  [tx.id_client ? 'id_client' : 'id_fournisseur']: tx.id_client || tx.id_fournisseur || '' });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });
export default function TransactionEditForm({ open, onClose, onCorrected, initialValues: providedRecord, initialChanges = {} }) {
  const [transaction, setTransaction] = useState(providedRecord);
  const [values, setValues] = useState(() => original(transaction));
  const [refs, setRefs] = useState({ produits: [], clients: [], fournisseurs: [], batiments: [] });
  const [referenceError, setReferenceError] = useState('');
  const [sources, setSources] = useState([]);
  const [sourceError, setSourceError] = useState('');
  const [manual, setManual] = useState(false);
  const [allocations, setAllocations] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const flow = useCorrectionFlow({ entityType: 'transaction', record: transaction, onSaved: onCorrected });
  const inactive = transaction.est_actif === false;
  const party = transaction.id_client ? 'id_client' : 'id_fournisseur';
  const product = refs.produits.find(row => row.id_produit === Number(values.id_produit));
  const oldProduct = refs.produits.find(row => row.id_produit === transaction.id_produit);
  const category = eggCategory(product?.nom_produit);
  const eggs = Boolean(category || (!oldProduct && (transaction.id_batiment || transaction.repartition_stock?.length)));
  const minimum = Math.max(1, (transaction.est_promesse ? Number(transaction.quantite_completee || 0) : 0) + Number(transaction.quantite_annulee || 0));
  useEffect(() => {
    if (!open) return;
    setTransaction(providedRecord);
    setValues({ ...original(providedRecord), ...initialChanges });
    setAllocations(Object.fromEntries((initialChanges.stock_allocations || providedRecord.repartition_stock || []).map(a => [a.id_production, String(a.quantite)])));
    setManual(Boolean(initialChanges.stock_allocations)); setError(''); setReason(''); flow.reset();
    // Drafts reset on opening a record, not on background refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, providedRecord.id_transaction]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setReferenceError('');
    Promise.all(['produits', 'clients', 'fournisseurs', 'batiments'].map(path => get(`/${path}`, { params: { limit: 1000 } })))
      .then(([produits, clients, fournisseurs, batiments]) => { if (active) setRefs({ produits, clients, fournisseurs, batiments }); })
      .catch(() => { if (active) setReferenceError('Les listes ne peuvent pas être chargées. Réessayez avant de changer le contact ou le stock.'); });
    return () => { active = false; };
  }, [open, reload]);
  const cutoff = transaction.est_promesse ? today() : values.date_transaction;
  useEffect(() => {
    if (!open || !eggs || !values.id_batiment || !cutoff) return;
    let active = true;
    setSourceError(''); setSources([]);
    get('/transactions/production-sources', { params: { id_batiment: values.id_batiment, through_date: cutoff, exclude_transaction_id: transaction.id_transaction } })
      .then(rows => { if (active) setSources(rows); }).catch(() => { if (active) setSourceError('Les productions ne peuvent pas être chargées. Réessayez pour choisir les origines.'); });
    return () => { active = false; };
  }, [open, eggs, values.id_batiment, cutoff, transaction.id_transaction, reload]);
  const names = Object.fromEntries([['id_produit', 'produits', 'nom_produit'], ['id_client', 'clients', 'nom_client'],
    ['id_fournisseur', 'fournisseurs', 'nom_fournisseur'], ['id_batiment', 'batiments', 'nom']].map(([key, collection, label]) =>
    [key, Object.fromEntries(refs[collection].map(row => [row[key], row[label]]))]));
  names.id_production = Object.fromEntries([...(transaction.repartition_stock || []), ...sources].map(row =>
    [row.id_production, `Production du ${row.date_production?.split('-').reverse().join('/') || `n° ${row.id_production}`}`]));
  const sourceRows = [...sources, ...(transaction.repartition_stock || []).filter(row => !sources.some(source => source.id_production === row.id_production))];
  const update = key => event => setValues(v => ({ ...v, [key]: event.target.value }));
  const submit = async event => {
    event.preventDefault(); setError('');
    if (!Number.isInteger(Number(values.quantite)) || Number(values.quantite) < minimum || !Number.isFinite(Number(values.prix_unitaire)) || Number(values.prix_unitaire) <= 0) {
      setError(`Indiquez une quantité entière d’au moins ${minimum} et un prix positif.`); return;
    }
    if (!values.date_transaction || values.date_echeance && values.date_echeance < values.date_transaction) {
      setError('La date d’échéance ne peut pas précéder la transaction.'); return;
    }
    const payload = { ...values, quantite: Number(values.quantite), prix_unitaire: values.prix_unitaire,
      id_produit: Number(values.id_produit), [party]: Number(values[party]), date_echeance: values.date_echeance || null };
    if (eggs) payload.id_batiment = Number(values.id_batiment) || null; else delete payload.id_batiment;
    delete payload.stock_allocations;
    const changes = changedValues(payload, transaction);
    if (manual) {
      if (Object.values(allocations).some(amount => amount !== '' && (!Number.isInteger(Number(amount)) || Number(amount) < 0))) {
        setError('Indiquez un nombre entier positif d’œufs par production.'); return;
      }
      changes.stock_allocations = Object.entries(allocations).filter(([, amount]) => Number(amount) > 0).map(([id, amount]) => ({ id_production: Number(id), quantite: Number(amount) }));
    }
    if (!Object.keys(changes).length) { setError('Aucune valeur n’a changé.'); return; }
    await flow.prepare(changes, reason);
  };
  const products = refs.produits.filter(row => row.id_produit === transaction.id_produit || row.est_actif !== false
    && (row.usage ? row.usage === (transaction.id_client ? 'vendu' : 'achete') : row[transaction.id_client ? 'pour_clients' : 'pour_fournisseurs'])
    && Boolean(eggCategory(row.nom_produit)) === Boolean(eggCategory(oldProduct?.nom_produit)));
  return <Dialog open={open} onClose={() => !flow.busy && !flow.uncertain && onClose()} fullWidth maxWidth="sm"
    PaperProps={{ component: 'form', onSubmit: submit }} aria-labelledby="transaction-edit-title">
    <DialogTitle id="transaction-edit-title">Modifier la transaction n° {transaction.id_transaction}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {flow.review ? <CorrectionReview flow={flow} names={names} transaction={transaction} onCancel={onClose} /> : <>
        <Alert severity="info">{inactive ? 'Réactivez cette transaction depuis son détail avant de la modifier.' : 'Corrigez les informations enregistrées. Les conséquences sur le paiement et le stock seront présentées avant confirmation.'}</Alert>
        {referenceError && <Alert severity="error" action={<Button onClick={() => setReload(v => v + 1)}>Réessayer</Button>}>{referenceError}</Alert>}
        {(error || flow.error) && <Alert severity="error" role="alert">{error || flow.error}</Alert>}
        <DateField label="Date de la transaction" value={values.date_transaction} onChange={update('date_transaction')} disabled={flow.busy || inactive} fullWidth required />
        <TextField select label={transaction.id_client ? 'Client' : 'Fournisseur'} value={values[party]} onChange={update(party)} disabled={flow.busy || inactive || !refs[transaction.id_client ? 'clients' : 'fournisseurs'].length}>
          {!names[party][values[party]] && <MenuItem value={values[party]}>Contact n° {values[party]}</MenuItem>}
          {refs[transaction.id_client ? 'clients' : 'fournisseurs'].filter(row => row.est_actif !== false || row[party] === transaction[party]).map(row => <MenuItem key={row[party]} value={row[party]}>{row[transaction.id_client ? 'nom_client' : 'nom_fournisseur']}</MenuItem>)}
        </TextField>
        <TextField select label="Produit" value={values.id_produit} onChange={update('id_produit')} disabled={flow.busy || inactive || !products.length}>
          {!products.some(row => row.id_produit === Number(values.id_produit)) && <MenuItem value={values.id_produit}>Produit n° {values.id_produit}</MenuItem>}
          {products.map(row => <MenuItem key={row.id_produit} value={row.id_produit}>{row.nom_produit}</MenuItem>)}
        </TextField>
        <TextField label="Quantité" type="number" value={values.quantite} onChange={update('quantite')} disabled={flow.busy || inactive} required inputProps={{ min: minimum, step: 1 }} helperText={transaction.est_promesse ? `Minimum : ${minimum} (œufs fournis et reliquat clôturé)` : ''} />
        <TextField label="Prix unitaire (MAD)" type="number" value={values.prix_unitaire} onChange={update('prix_unitaire')} disabled={flow.busy || inactive} required inputProps={{ min: 0.01, step: '0.01' }} />
        <Typography fontWeight={700}>Montant total : {money(Number(values.quantite) * Number(values.prix_unitaire))}</Typography>
        <DateField label="Date d’échéance du paiement (optionnel)" value={values.date_echeance || ''} onChange={update('date_echeance')} disabled={flow.busy || inactive} fullWidth />
        {eggs && <>
          <TextField select label="Bâtiment source" value={values.id_batiment} onChange={update('id_batiment')} disabled={flow.busy || inactive}>
            {!names.id_batiment[values.id_batiment] && <MenuItem value={values.id_batiment}>Bâtiment n° {values.id_batiment}</MenuItem>}
            {refs.batiments.map(row => <MenuItem key={row.id_batiment} value={row.id_batiment}>{row.nom}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Checkbox checked={manual} onChange={event => setManual(event.target.checked)} disabled={flow.busy || inactive} />} label="Choisir les productions à utiliser" />
          {manual && <>
            <Typography variant="body2">Indiquez les œufs pour cette vente par production. Les quantités déjà fournies doivent être conservées.</Typography>
            {sourceError && <Alert severity="error" action={<Button onClick={() => setReload(v => v + 1)}>Réessayer</Button>}>{sourceError}</Alert>}
            {sourceRows.filter(row => Number(allocations[row.id_production]) > 0 || !category || row.type_oeuf === category[0] && (row.calibre || null) === category[1]).map(row => <TextField key={row.id_production} type="number"
              label={names.id_production[row.id_production]} value={allocations[row.id_production] || ''} disabled={flow.busy || inactive} inputProps={{ min: 0, step: 1 }}
              onChange={event => setAllocations(v => ({ ...v, [row.id_production]: event.target.value }))} helperText={row.disponible === undefined ? 'Origine enregistrée précédemment' : `${row.disponible} œufs proposés · la disponibilité finale sera vérifiée`} />)}
          </>}
        </>}
        <TextField label="Commentaire (optionnel)" value={reason} onChange={event => setReason(event.target.value)} inputProps={{ maxLength: 1000 }} disabled={flow.busy || inactive} multiline maxRows={3} />
      </>}
    </Stack></DialogContent>
    {!flow.review && <DialogActions><Button onClick={onClose} disabled={flow.busy}>Annuler</Button>
      {flow.stale && <Button onClick={flow.refresh} disabled={flow.busy}>Actualiser l’aperçu</Button>}
      <Button type="submit" variant="contained" disabled={flow.busy || inactive}>{flow.busy ? 'Vérification…' : 'Vérifier les modifications'}</Button></DialogActions>}
  </Dialog>;
}
