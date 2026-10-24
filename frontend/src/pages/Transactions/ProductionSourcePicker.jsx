import { useEffect, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { Alert, Box, Button, CircularProgress, Grid, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { formatShortDate } from '../../utils/dateFormatting';
import { groupStock, dispatchStock } from './eggStockAllocation';
import { get } from '../../services/api';

const eggLabels = { normal: 'Normaux', double_jaune: 'Double jaune', blanc: 'Blancs' };
const sizeLabels = { demarrage: 'Démarrage', moyen: 'Moyen', gros: 'Gros' };
export default function ProductionSourcePicker({ index, control, setValue, batiments, disabled, transactionId, saleDate, children }) {
  const lines = useWatch({ control, name: 'lignes' }) || [];
  const line = lines[index] || {};
  const building = line.id_batiment;
  const [sources, setSources] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const groups = groupStock(sources);
  const selected = groups.find(g => g.sources.some(s => s.id_production === Number(line.id_production)));
  const available = selected?.disponible;
  const sourceDate = selected?.date_production;
  const groupKey = selected ? `${building}:${selected.key}` : null;
  useEffect(() => {
    setValue(`lignes.${index}.source_group`, groupKey);
    setValue(`lignes.${index}.source_available`, available ?? null);
    setValue(`lignes.${index}.source_ready`, available > 0 && !fetching && !error);
    if (sourceDate) setValue(`lignes.${index}.date_production`, sourceDate);
  }, [available, sourceDate, groupKey, fetching, error, index, setValue]);
  useEffect(() => {
    let cancelled = false;
    setSources([]); setError(''); setFetching(false);
    setValue(`lignes.${index}.source_ready`, false);
    if (!building || !saleDate) return () => { cancelled = true; };
    setFetching(true);
    get('/transactions/production-sources', { params: {
      id_batiment: building, through_date: saleDate,
      ...(transactionId ? { exclude_transaction_id: transactionId } : {}),
    } }).then(data => { if (!cancelled) setSources(data); })
      .catch(() => { if (!cancelled) setError('Impossible de charger le stock. Réessayez.'); })
      .finally(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [building, saleDate, transactionId, retry, index, setValue]);
  const reserved = (group, beforeOnly = false) => lines.reduce((sum, other, i) =>
    i !== index && (!beforeOnly || i < index) && group.sources.some(s => s.id_production === Number(other.id_production))
      ? sum + Number(other.quantite || 0) : sum, 0);
  const before = selected ? dispatchStock(selected.sources, reserved(selected, true)) : [];
  const dispatch = selected ? dispatchStock(before.map(s => ({ ...s, disponible: s.remaining })), line.quantite) : [];
  return <Box sx={{ width: '100%', mb: 1.5 }}>
    <Grid container spacing={1.25}>
      <Grid item xs={12} md={4}>
        <Controller name={`lignes.${index}.id_batiment`} control={control} render={({ field, fieldState }) =>
          <TextField {...field} select fullWidth size="small" label="Bâtiment source *" value={field.value || ''}
            disabled={disabled} error={!!fieldState.error} helperText={fieldState.error?.message}
            onChange={event => { setValue(`lignes.${index}.id_production`, ''); setValue(`lignes.${index}.id_produit`, ''); field.onChange(event); }}>
            {batiments.map(b => <MenuItem key={b.id_batiment} value={b.id_batiment}>{b.nom}</MenuItem>)}
          </TextField>} />
      </Grid>
      {children}
    </Grid>
    {building && saleDate && <Box sx={{ mt: 1 }}>
      {fetching && <CircularProgress size={22} aria-label="Chargement du stock" />}
      {error && <Alert severity="error" action={<Button onClick={() => setRetry(v => v + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!fetching && !error && sources.length === 0 && <Alert severity="info">Aucun stock disponible pour ce bâtiment à la date de vente.</Alert>}
      <Controller name={`lignes.${index}.id_production`} control={control} render={({ field, fieldState }) => <>
        {groups.length > 0 && <>
          <Typography variant="body2" sx={{ my: 1 }}>Stock disponible au {formatShortDate(saleDate)}, saisies précédentes incluses.</Typography>
          <Table size="small" aria-label="Stock d’œufs disponible">
            <TableHead><TableRow>{['Type', 'Calibre', 'Disponibles', ''].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
            <TableBody>{groups.map(group => <TableRow key={group.key} selected={group.key === selected?.key}>
              <TableCell>{eggLabels[group.type_oeuf]}</TableCell><TableCell>{sizeLabels[group.calibre] || '—'}</TableCell>
              <TableCell>{Math.max(0, group.disponible - reserved(group)).toLocaleString('fr-FR')}</TableCell>
              <TableCell><Button size="small" variant={group.key === selected?.key ? 'contained' : 'outlined'}
                disabled={disabled || group.disponible <= reserved(group)}
                aria-label={`Choisir ${eggLabels[group.type_oeuf]} ${sizeLabels[group.calibre] || ''}`}
                onClick={() => field.onChange(group.id_production)}>{group.key === selected?.key ? 'Choisi' : 'Choisir'}</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </>}
        {fieldState.error && <Alert severity="error">{fieldState.error.message}</Alert>}
      </>} />
      {selected && <>
        <Typography variant="body2" sx={{ my: 1 }}>Répartition prévue du stock · les plus anciens d’abord</Typography>
        <Table size="small" aria-label="Répartition prévue du stock">
          <TableHead><TableRow>{['Date de production', 'Disponible', 'Prélevé pour cette vente', 'Restant'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{dispatch.map(s => <TableRow key={s.id_production}><TableCell>{formatShortDate(s.date_production)}</TableCell>
            <TableCell>{s.disponible}</TableCell><TableCell>{s.deducted}</TableCell><TableCell>{s.remaining}</TableCell></TableRow>)}</TableBody>
        </Table>
        {Number(line.quantite) > selected.disponible - reserved(selected) && <Alert severity="error">La quantité dépasse le stock disponible.</Alert>}
      </>}
    </Box>}
  </Box>;
}
