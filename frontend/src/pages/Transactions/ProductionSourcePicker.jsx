import { useEffect, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { Alert, Box, Button, CircularProgress, Grid, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DateField from '../../utils/DateField';
import { get } from '../../services/api';

const eggLabels = { normal: 'Normaux', double_jaune: 'Double jaune', blanc: 'Blancs', casse: 'Cassés', perdu: 'Perdus' };
const sizeLabels = { demarrage: 'Démarrage', moyen: 'Moyen', gros: 'Gros' };

export default function ProductionSourcePicker({ index, control, setValue, batiments, disabled, transactionId, saleDate }) {
  const lines = useWatch({ control, name: 'lignes' });
  const line = lines?.[index] || {};
  const building = line.id_batiment;
  const day = line.date_production;
  const [sources, setSources] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const selected = sources.find((source) => source.id_production === Number(line.id_production));
    setValue(`lignes.${index}.source_available`, selected?.disponible ?? null);
    setValue(`lignes.${index}.source_ready`, Boolean(selected?.vendable));
  }, [sources, line.id_production, index, setValue]);

  const clearSource = () => {
    setValue(`lignes.${index}.id_production`, '');
    setValue(`lignes.${index}.id_produit`, '');
    setValue(`lignes.${index}.source_ready`, false);
    setValue(`lignes.${index}.quantite`, undefined);
  };

  useEffect(() => {
    let cancelled = false;
    setSources([]);
    setError('');
    setValue(`lignes.${index}.source_ready`, false);
    if (!building || !day) return () => { cancelled = true; };
    setFetching(true);
    get('/transactions/production-sources', { params: {
      id_batiment: building, date_production: day,
      ...(transactionId ? { exclude_transaction_id: transactionId } : {}),
    } }).then((data) => {
      if (cancelled) return;
      setSources(data);
    }).catch(() => {
      if (!cancelled) setError('Impossible de charger cette saisie. Réessayez.');
    }).finally(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [building, day, transactionId, retry, index, setValue]);

  return <Box sx={{ width: '100%', mb: 1.5 }}>
    <Grid container spacing={1.25}>
      <Grid item xs={12} sm={6}>
        <Controller name={`lignes.${index}.id_batiment`} control={control} render={({ field, fieldState }) => (
          <TextField {...field} select fullWidth size="small" label="Bâtiment source *" value={field.value || ''}
            disabled={disabled} error={!!fieldState.error} helperText={fieldState.error?.message}
            onChange={(event) => { clearSource(); field.onChange(event); }}>
            {batiments.map((b) => <MenuItem key={b.id_batiment} value={b.id_batiment}>{b.nom}</MenuItem>)}
          </TextField>
        )} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <Controller name={`lignes.${index}.date_production`} control={control} render={({ field, fieldState }) => (
          <DateField {...field} fullWidth size="small" label="Date de la saisie *" value={field.value || ''}
            disabled={disabled} error={!!fieldState.error} helperText={fieldState.error?.message || 'Date de production des œufs vendus.'}
            onChange={(event) => { clearSource(); field.onChange(event); }} />
        )} />
      </Grid>
    </Grid>
    {day && saleDate && day > saleDate && <Alert severity="error" sx={{ mt: 1 }}>La vente ne peut pas précéder cette production.</Alert>}
    {building && day && <Box sx={{ mt: 1 }}>
      {fetching && <CircularProgress size={22} aria-label="Chargement de la saisie" />}
      {error && <Alert severity="error" action={<Button onClick={() => setRetry((v) => v + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!fetching && !error && sources.length === 0 && <Alert severity="info">Aucune saisie de production pour ce bâtiment à cette date.</Alert>}
      <Controller name={`lignes.${index}.id_production`} control={control} render={({ field, fieldState }) => <>
        {sources.length > 0 && <>
          <Typography variant="body2" sx={{ my: 1 }}>Choisissez le type d’œufs à vendre dans cette saisie.</Typography>
          <TableContainer>
            <Table size="small" aria-label="Œufs de la saisie sélectionnée">
              <TableHead><TableRow>{['Type', 'Calibre', 'Poids moyen', 'Produits', 'Disponibles', ''].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
              <TableBody>{sources.map((source) => {
                const reservedInForm = (lines || []).reduce((sum, other, otherIndex) => (
                  otherIndex !== index && Number(other.id_production) === source.id_production ? sum + Number(other.quantite || 0) : sum
                ), 0);
                const available = Math.max(0, source.disponible - reservedInForm);
                const selected = Number(field.value) === source.id_production;
                return <TableRow key={source.id_production} selected={selected}>
                  <TableCell>{eggLabels[source.type_oeuf] || source.type_oeuf}</TableCell>
                  <TableCell>{sizeLabels[source.calibre] || '—'}</TableCell>
                  <TableCell>{Number(source.grammage).toLocaleString('fr-FR')} g</TableCell>
                  <TableCell>{source.nombre_oeufs.toLocaleString('fr-FR')}</TableCell>
                  <TableCell>{source.vendable ? available.toLocaleString('fr-FR') : 'Non vendables'}</TableCell>
                  <TableCell><Button size="small" variant={selected ? 'contained' : 'outlined'} disabled={disabled || !source.vendable || available <= 0}
                    aria-label={`Choisir ${eggLabels[source.type_oeuf]} ${sizeLabels[source.calibre] || ''}`}
                    onClick={() => { field.onChange(source.id_production); setValue(`lignes.${index}.quantite`, undefined); }}>
                    {selected ? 'Choisi' : 'Choisir'}
                  </Button></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </TableContainer>
        </>}
        {fieldState.error && <Alert severity="error" sx={{ mt: 1 }}>{fieldState.error.message}</Alert>}
      </>} />
      {line.id_production && Number(line.quantite) > Math.max(0, (sources.find((s) => s.id_production === Number(line.id_production))?.disponible || 0) -
        (lines || []).reduce((sum, other, i) => i !== index && Number(other.id_production) === Number(line.id_production) ? sum + Number(other.quantite || 0) : sum, 0)) &&
        <Alert severity="error" sx={{ mt: 1 }}>La quantité dépasse le stock disponible de cette saisie.</Alert>}
    </Box>}
  </Box>;
}
