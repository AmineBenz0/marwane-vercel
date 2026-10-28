import { useEffect, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { Alert, Box, Button, CircularProgress, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { formatShortDate } from '../../utils/dateFormatting';
import { groupStock, dispatchStock } from './eggStockAllocation';
import { get } from '../../services/api';
import { LayersOutlined } from '@mui/icons-material';
import ExpandableDetails from '../../components/ExpandableDetails';

const eggLabels = { normal: 'Normaux', double_jaune: 'Double jaune', blanc: 'Blancs' };
const sizeLabels = { demarrage: 'Démarrage', moyen: 'Moyen', gros: 'Gros' };
const productCategory = (name = '') => {
  const value = name.trim().toLowerCase().replaceAll('œ', 'oe');
  if (value === 'oeufs - demarrage') return { type_oeuf: 'normal', calibre: 'demarrage' };
  if (value === 'oeufs - moyen') return { type_oeuf: 'normal', calibre: 'moyen' };
  if (value === 'oeufs - gros') return { type_oeuf: 'normal', calibre: 'gros' };
  if (value === 'oeufs - double jaune') return { type_oeuf: 'double_jaune', calibre: null };
  if (value === 'oeufs - blancs') return { type_oeuf: 'blanc', calibre: null };
  return null;
};

export default function ProductionSourcePicker({ index, control, setValue, batiments, produits = [], disabled, transactionId, saleDate, children }) {
  const lines = useWatch({ control, name: 'lignes' }) || [];
  const line = lines[index] || {};
  const building = line.id_batiment;
  const [sources, setSources] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const groups = groupStock(sources);
  const choices = productosChoices(produits, groups);
  const selected = choices.find(g => g.sources.some(s => s.id_production === Number(line.id_production))
    || Number(g.id_produit) === Number(line.id_produit));
  const available = selected?.disponible;
  const sourceDate = selected?.date_production;
  const groupKey = selected ? `${building}:${selected.key}` : null;
  const resetNewDeferredDelivery = () => {
    if (transactionId) return;
    setValue(`lignes.${index}.est_promesse`, false, { shouldDirty: true, shouldValidate: true });
    setValue(`lignes.${index}.date_livraison_prevue`, '', { shouldDirty: true, shouldValidate: true });
  };
  useEffect(() => {
    setValue(`lignes.${index}.source_group`, groupKey);
    setValue(`lignes.${index}.source_available`, available ?? null);
    setValue(`lignes.${index}.source_ready`, !fetching && !error);
    setValue(`lignes.${index}.date_production`, sourceDate || '');
    setValue(`lignes.${index}.id_produit`, selected?.id_produit || '');
  }, [available, sourceDate, groupKey, fetching, error, index, setValue, selected?.id_produit]);
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
  const reserved = (group, beforeOnly = true) => lines.reduce((sum, other, i) =>
    i !== index && (!beforeOnly || i < index) && (other.source_group === `${building}:${group.key}` || (Number(other.id_batiment) === Number(building) && group.sources.some(s => s.id_production === Number(other.id_production))))
      ? sum + Number(other.quantite || 0) : sum, 0);
  const before = selected ? dispatchStock(selected.sources, reserved(selected, true)) : [];
  const dispatch = selected ? dispatchStock(before.map(s => ({ ...s, disponible: s.remaining })), line.quantite) : [];
  return <Box sx={{ width: '100%', mb: 1.5 }}>
    <Grid container spacing={1.25}>
      <Grid item xs={12} md={4}>
        <Controller name={`lignes.${index}.id_batiment`} control={control} render={({ field, fieldState }) =>
          <TextField {...field} select fullWidth size="small" label="Bâtiment source *" value={field.value || ''}
            disabled={disabled} error={!!fieldState.error} helperText={fieldState.error?.message}
            onChange={event => {
              if (String(event.target.value) !== String(field.value || '')) resetNewDeferredDelivery();
              setValue(`lignes.${index}.id_production`, '');
              setValue(`lignes.${index}.id_produit`, '');
              field.onChange(event);
            }}>
            {batiments.map(b => <MenuItem key={b.id_batiment} value={b.id_batiment}>{b.nom}</MenuItem>)}
          </TextField>} />
      </Grid>
      {children}
    </Grid>
    {building && saleDate && <Box sx={{ mt: 1 }}>
      {fetching && <CircularProgress size={22} aria-label="Chargement du stock" />}
      {error && <Alert severity="error" action={<Button onClick={() => setRetry(v => v + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!fetching && !error && sources.length === 0 && <Alert severity="info">Aucun stock disponible. Vous pouvez choisir une livraison différée.</Alert>}
      <Controller name={`lignes.${index}.id_production`} control={control} render={({ field, fieldState }) => <>
        {choices.length > 0 && <>
          <Typography variant="body2" sx={{ my: 1 }}>Stock disponible au {formatShortDate(saleDate)}, saisies précédentes incluses.</Typography>
          <Stack spacing={1.25} role="group" aria-label="Stock d’œufs disponible">
            {choices.map(group => {
              const chosen = group.key === selected?.key;
              const count = Math.max(0, group.disponible - reserved(group));
              const dates = new Set(group.sources.map(source => source.date_production));
              return <Paper key={group.key} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', borderColor: chosen ? 'primary.main' : 'divider', bgcolor: chosen ? 'action.selected' : 'background.paper' }}>
                <Button fullWidth disabled={disabled || fetching || !!error} aria-pressed={chosen}
                  aria-label={`Choisir ${eggLabels[group.type_oeuf]} ${sizeLabels[group.calibre] || ''}`}
                  onClick={() => {
                    if (Number(group.id_produit) !== Number(line.id_produit)) resetNewDeferredDelivery();
                    field.onChange(group.id_production || '');
                    setValue(`lignes.${index}.id_produit`, group.id_produit, { shouldDirty: true });
                  }}
                  sx={{ p: 1.75, textTransform: 'none', justifyContent: 'space-between', textAlign: 'left', color: 'text.primary', gap: 2 }}>
                  <Box>
                    <Typography component="span" display="block" fontWeight={700}>{eggLabels[group.type_oeuf]}</Typography>
                    <Typography component="span" display="block" variant="body2" color="text.secondary">{sizeLabels[group.calibre] ? `Calibre ${sizeLabels[group.calibre].toLowerCase()}` : 'Sans distinction de calibre'}</Typography>
                    <Typography component="span" display="block" variant="caption" color="text.secondary" sx={{ mt: 0.75 }}>
                      {count ? `Stock de ${dates.size} journée(s)` : 'Aucun stock · livraison différée possible'}{chosen ? ' · Sélectionné' : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography component="span" display="block" variant="h6" fontWeight={700}>{count.toLocaleString('fr-FR')}</Typography>
                    <Typography component="span" variant="caption" color="text.secondary">œufs disponibles</Typography>
                  </Box>
                </Button>
                {group.sources.length > 0 && <Box sx={{ m: 1.5, mt: 0 }}><ExpandableDetails icon={<LayersOutlined />} label={chosen ? 'Stock et prélèvements prévus' : 'Détail du stock par date'} contentSx={{ p: 1.25 }}>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ '& th, & td': { px: 1, py: 1.25 }, '& th': { textTransform: 'none !important' } }} aria-label={chosen ? 'Répartition prévue du stock' : `Stock ${eggLabels[group.type_oeuf]} ${sizeLabels[group.calibre] || ''}`}>
                      <TableHead><TableRow><TableCell>Date de production</TableCell><TableCell align="right">Disponible</TableCell>{chosen && <TableCell align="right">Œufs pour cette vente</TableCell>}</TableRow></TableHead>
                      <TableBody>{(chosen ? dispatch : group.sources).map(source => <TableRow key={source.id_production}>
                        <TableCell>{formatShortDate(source.date_production)}</TableCell><TableCell align="right">{source.disponible.toLocaleString('fr-FR')}</TableCell>
                        {chosen && <TableCell align="right">{source.deducted.toLocaleString('fr-FR')}</TableCell>}
                      </TableRow>)}</TableBody>
                    </Table>
                  </Box>
                </ExpandableDetails></Box>}
              </Paper>;
            })}
          </Stack>
        </>}
        {fieldState.error && <Alert severity="error">{fieldState.error.message}</Alert>}
      </>} />

    </Box>}
  </Box>;
}

function productosChoices(products, stockGroups) {
  return products.map((product) => {
    const category = productCategory(product.nom_produit);
    if (!category) return null;
    const key = `${category.type_oeuf}:${category.calibre || ''}`;
    const stock = stockGroups.find((group) => group.key === key);
    return {
      ...(stock || { ...category, key, disponible: 0, sources: [] }),
      id_produit: product.id_produit,
      id_production: stock?.id_production || null,
    };
  }).filter(Boolean);
}
