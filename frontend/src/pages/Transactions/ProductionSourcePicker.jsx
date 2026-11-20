import { useEffect, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { Alert, Box, Button, ButtonBase, CircularProgress, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatShortDate } from '../../utils/dateFormatting';
import { groupStock, dispatchStock } from './eggStockAllocation';
import { get } from '../../services/api';
import ExpandableDetails from '../../components/ExpandableDetails';
import DetailRows from '../../components/DetailRows';

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
  const allChoices = productosChoices(produits, groups);
  const choices = typeChoices(allChoices, line);
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
    {/* Phone order: building, egg type, then quantity and price. Desktop: building, quantity and price on one row, egg type below. */}
    <Grid container spacing={1.25} sx={{ '& > :not(.source-first)': { order: { xs: 2, md: 0 } } }}>
      <Grid item xs={12} md={4} className="source-first" sx={{ order: 0 }}>
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
      {building && saleDate && <Grid item xs={12} className="source-first" sx={{ order: { xs: 1, md: 3 } }}>
      {fetching && <CircularProgress size={22} aria-label="Chargement du stock" />}
      {error && <Alert severity="error" action={<Button onClick={() => setRetry(v => v + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!fetching && !error && sources.length === 0 && <Alert severity="info">Aucun stock disponible. Vous pouvez choisir une livraison différée.</Alert>}
      <Controller name={`lignes.${index}.id_production`} control={control} render={({ field, fieldState }) => <>
        {choices.length > 0 && <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }} role="group" aria-label="Type d’œufs vendu">
            {choices.map(group => {
              const chosen = group.key === selected?.key;
              const count = Math.max(0, group.disponible - reserved(group));
              return <ButtonBase key={group.type_oeuf} disabled={disabled || fetching || !!error} aria-pressed={chosen}
                aria-label={`Choisir ${eggLabels[group.type_oeuf]}`}
                onClick={() => {
                  if (Number(group.id_produit) !== Number(line.id_produit)) resetNewDeferredDelivery();
                  field.onChange(group.id_production || '');
                  setValue(`lignes.${index}.id_produit`, group.id_produit, { shouldDirty: true });
                }}
                sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75, px: 1.5, py: 0.75, borderRadius: 999,
                  border: '1.5px solid', borderColor: chosen ? 'primary.main' : 'divider',
                  bgcolor: chosen ? 'rgba(13, 148, 136, 0.08)' : 'background.paper',
                  color: chosen ? 'primary.dark' : 'text.primary',
                  '&:hover': { borderColor: 'primary.main' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
                  '&.Mui-disabled': { opacity: 0.6 } }}>
                <Typography component="span" variant="body2" fontWeight={700}>{eggLabels[group.type_oeuf]}</Typography>
                <Typography component="span" variant="body2" color={count ? 'text.secondary' : 'text.disabled'}>{count.toLocaleString('fr-FR')}</Typography>
              </ButtonBase>;
            })}
          </Stack>
          {selected && (() => {
            const count = Math.max(0, selected.disponible - reserved(selected));
            const otherCalibres = selected.type_oeuf === 'normal'
              ? allChoices.filter(c => c.type_oeuf === 'normal' && c.key !== selected.key && c.disponible > 0) : [];
            const rows = (selected.sources.length ? dispatch : []).map(source => ({
              key: source.id_production,
              label: `Production du ${formatShortDate(source.date_production)}`,
              value: `${source.disponible.toLocaleString('fr-FR')} œufs`,
              hint: source.deducted > 0 ? `− ${source.deducted.toLocaleString('fr-FR')} pour cette vente` : null,
            }));
            return <Box aria-label={`Stock pour la vente ${index + 1}`} sx={{ mt: 1 }}>
              <Typography variant="body2">
                <Box component="span" fontWeight={700}>{count.toLocaleString('fr-FR')} œufs en stock</Box>
                {` au ${formatShortDate(saleDate)}`}
                {sizeLabels[selected.calibre] ? ` · calibre ${sizeLabels[selected.calibre].toLowerCase()} (automatique)` : ''}
              </Typography>
              {otherCalibres.length > 0 && <Typography variant="caption" color="text.secondary" display="block">
                Les œufs les plus anciens partent en premier. Aussi en stock : {otherCalibres.map(c => `${c.disponible.toLocaleString('fr-FR')} ${sizeLabels[c.calibre]?.toLowerCase() || ''}`).join(', ')}.
              </Typography>}
              {rows.length > 0 && <ExpandableDetails label="Voir le stock par date" meta={`${rows.length} jour${rows.length > 1 ? 's' : ''}`} sx={{ mt: 0.25 }}>
                <DetailRows rows={rows} ariaLabel="Stock par date de production" />
              </ExpandableDetails>}
            </Box>;
          })()}
        </>}
        {fieldState.error && <Alert severity="error" sx={{ mt: 1 }}>{fieldState.error.message}</Alert>}
      </>} />

      </Grid>}
    </Grid>
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

const TYPE_ORDER = ['normal', 'double_jaune', 'blanc'];
const CALIBRE_FALLBACK = ['gros', 'moyen', 'demarrage'];
const firstDate = (choice) => choice.sources[0]?.date_production || '9999-12-31';

/**
 * One choice per egg type. For normal eggs the calibre is not chosen by the user: it follows
 * the stock, oldest eggs first (a line can only take one calibre). A line that already has a
 * normal calibre (editing) keeps it.
 */
function typeChoices(allChoices, line) {
  return TYPE_ORDER.map((type) => {
    const candidates = allChoices.filter((c) => c.type_oeuf === type);
    if (!candidates.length) return null;
    if (type !== 'normal') return candidates[0];
    const current = candidates.find((c) => Number(c.id_produit) === Number(line.id_produit)
      || c.sources.some((s) => s.id_production === Number(line.id_production)));
    if (current) return current;
    const inStock = candidates.filter((c) => c.disponible > 0).sort((a, b) => firstDate(a).localeCompare(firstDate(b)));
    if (inStock.length) return inStock[0];
    return [...candidates].sort((a, b) => CALIBRE_FALLBACK.indexOf(a.calibre) - CALIBRE_FALLBACK.indexOf(b.calibre))[0];
  }).filter(Boolean);
}
