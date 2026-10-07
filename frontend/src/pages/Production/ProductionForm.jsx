import DateField from '../../utils/DateField';
import { useState, useEffect } from 'react';
import {
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Typography,
  Box,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { productionService } from '../../services/productionService';
import useNotification from '../../hooks/useNotification';

const EGG_TYPES = [
  { value: 'normal', label: 'Oeufs normaux' },
  { value: 'double_jaune', label: 'Double jaune' },
  { value: 'casse', label: 'Oeufs casses' },
  { value: 'blanc', label: 'Oeufs blancs' },
  { value: 'perdu', label: 'Oeufs perdus' },
];

function ProductionForm({
  open,
  onClose,
  onSuccess,
  initialData,
  batiments,
  preselectedBatimentId = '',
  preselectedDate = new Date().toISOString().split('T')[0],
  title,
  description,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const notification = useNotification();
  const [formules, setFormules] = useState([]);
  const [calibreThresholds, setCalibreThresholds] = useState([]);
  const [loadingDaily, setLoadingDaily] = useState(!!initialData);
  const [loadError, setLoadError] = useState('');
  const [versions, setVersions] = useState({});
  const [hasLegacyType, setHasLegacyType] = useState(false);
  const { register, handleSubmit, watch, setValue, reset, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date_production: initialData?.date_production?.slice(0, 10) || preselectedDate,
      id_batiment: initialData?.id_batiment || preselectedBatimentId || '',
      quantites: Object.fromEntries(EGG_TYPES.map((type) => [type.value, ''])),
      grammage: '',
      mortalite: '',
      consommation_aliment_kg: '',
      formule: '',
    },
  });

  const quantities = watch('quantites') || {};
  const watchedBatiment = watch('id_batiment');
  const watchedGrammage = watch('grammage');
  const eggTypeOptions = hasLegacyType
    ? [...EGG_TYPES, { value: 'double_jaune_demarrage', label: 'Double jaune démarrage (historique)' }]
    : EGG_TYPES;
  const totalEggs = eggTypeOptions.reduce(
    (sum, type) => sum + (type.value === 'perdu' ? 0 : Number(quantities[type.value] || 0)), 0,
  );
  const cartonPreview = eggTypeOptions.reduce((sum, type) => {
    const count = Number(quantities[type.value] || 0);
    if (count <= 0 || type.value === 'perdu') return sum;
    const cartons = Math.ceil(count / 30);
    return sum + (type.value.startsWith('double_jaune')
      ? (cartons * 2) + 1
      : cartons + Math.ceil(cartons / 10));
  }, 0);

  useEffect(() => {
    if (!open || !initialData) return undefined;
    let cancelled = false;
    setLoadingDaily(true);
    setLoadError('');
    productionService.getDailyProduction(
      initialData.id_batiment, initialData.date_production.slice(0, 10),
    ).then((daily) => {
      if (cancelled) return;
      const rows = daily.records || [];
      const counts = Object.fromEntries(EGG_TYPES.map((type) => [type.value, 0]));
      rows.forEach((row) => {
        counts[row.type_oeuf] = (counts[row.type_oeuf] || 0) + Number(row.nombre_oeufs);
      });
      const producedRows = rows.filter((row) => row.type_oeuf !== 'perdu');
      const weightRows = producedRows.length ? producedRows : rows;
      const weightCount = weightRows.reduce((sum, row) => sum + Number(row.nombre_oeufs), 0);
      const avgWeight = weightCount
        ? weightRows.reduce((sum, row) => sum + Number(row.grammage) * Number(row.nombre_oeufs), 0) / weightCount
        : 0;
      reset({
        date_production: initialData.date_production.slice(0, 10),
        id_batiment: initialData.id_batiment,
        quantites: counts,
        grammage: Number(avgWeight.toFixed(2)),
        mortalite: rows.reduce((sum, row) => sum + Number(row.mortalite || 0), 0),
        consommation_aliment_kg: Number(rows.reduce((sum, row) => sum + Number(row.consommation_aliment_kg || 0), 0).toFixed(2)),
        formule: rows.find((row) => row.formule)?.formule || '',
      });
      setVersions(daily.versions || {});
      setHasLegacyType(counts.double_jaune_demarrage > 0);
    }).catch(() => {
      if (!cancelled) setLoadError('Impossible de charger la saisie quotidienne. Fermez puis rouvrez le formulaire.');
    }).finally(() => {
      if (!cancelled) setLoadingDaily(false);
    });
    return () => { cancelled = true; };
  }, [open, initialData, reset]);

  useEffect(() => {
    const fetchFormules = async () => {
      try {
        const [formulesData, thresholdsData] = await Promise.all([
          productionService.getFormules(),
          productionService.getCalibreThresholds(),
        ]);
        setFormules(formulesData || []);
        setCalibreThresholds(thresholdsData || []);
      } catch (err) {
        setFormules([]);
        setCalibreThresholds([]);
      }
    };
    if (open) fetchFormules();
  }, [open]);

  const deducedCalibre = (() => {
    const gramValue = Number(watchedGrammage);
    if (!Number.isFinite(gramValue) || gramValue <= 0) return null;
    const match = calibreThresholds.find((threshold) => {
      const min = threshold.min_grammage === null || threshold.min_grammage === undefined ? null : Number(threshold.min_grammage);
      const max = threshold.max_grammage === null || threshold.max_grammage === undefined ? null : Number(threshold.max_grammage);
      return (min === null || gramValue >= min) && (max === null || gramValue < max);
    });
    return match || null;
  })();

  const onSubmit = async (data) => {
    if (loadingDaily || loadError) return;
    const counts = Object.fromEntries(Object.entries(data.quantites).map(
      ([type, count]) => [type, Number(count || 0)],
    ));
    if (!Object.values(counts).some((count) => count > 0)) {
      setError('root', { message: "Indiquez au moins un nombre d'œufs." });
      return;
    }
    try {
      const payload = {
        date_production: data.date_production,
        id_batiment: Number(data.id_batiment),
        quantites: counts,
        grammage: Number(data.grammage),
        mortalite: data.mortalite === '' ? null : Number(data.mortalite),
        consommation_aliment_kg: data.consommation_aliment_kg === ''
          ? null : Number(data.consommation_aliment_kg),
        formule: data.formule || null,
        ...(initialData ? { versions } : {}),
      };
      if (initialData) {
        await productionService.updateDailyProduction(payload);
        notification.success('Saisie quotidienne mise à jour');
      } else {
        await productionService.createDailyProduction(payload);
        notification.success('Production quotidienne enregistrée');
      }
      onSuccess();
    } catch (err) {
      const detail = err.data?.detail || err.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : (err.message || 'Une erreur est survenue');
      setError('root', { message });
      notification.error(message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, sm: 3 },
          maxHeight: { xs: '100dvh', sm: 'calc(100dvh - 32px)' },
          display: 'flex',
          overflow: 'hidden',
        },
      }}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%' }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 'bold', flexShrink: 0 }}>
          {title || (initialData ? 'Modifier la saisie' : 'Saisir la production du jour')}
        </DialogTitle>
        <DialogContent
          sx={{
            py: 2,
            minHeight: 0,
            flex: '1 1 auto',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            scrollbarGutter: 'stable',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(100, 116, 139, 0.45) transparent',
            '&::-webkit-scrollbar': { width: 8 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'rgba(100, 116, 139, 0.35)',
              borderRadius: 8,
              border: '2px solid transparent',
              backgroundClip: 'content-box',
            },
            '&::-webkit-scrollbar-thumb:hover': { backgroundColor: 'rgba(100, 116, 139, 0.6)' },
          }}
        >
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
            {description || 'Indiquez le nombre de chaque type et un grammage moyen commun à toute la collecte.'}
          </Typography>

          {initialData && (
            <Alert severity="info" sx={{ mb: 2 }}>
              La modification porte sur tous les types de ce bâtiment pour cette journée.
            </Alert>
          )}
          {(loadError || errors.root?.message) && (
            <Alert severity="error" sx={{ mb: 2 }}>{loadError || errors.root.message}</Alert>
          )}
          {loadingDaily && <Typography sx={{ mb: 2 }}>Chargement de la saisie...</Typography>}
          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6}>
              <DateField
                {...register('date_production', { required: 'Date requise' })}
                label="Date de production"
                inputProps={{ readOnly: !!initialData }}

                fullWidth
                InputLabelProps={{ shrink: true }}
                error={!!errors.date_production}
                helperText={errors.date_production?.message}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('id_batiment', { required: 'Batiment requis' })}
                select
                value={watchedBatiment || ''}
                onChange={(event) => setValue('id_batiment', event.target.value, { shouldValidate: true })}
                label="Batiment"
                fullWidth
                SelectProps={{ readOnly: !!preselectedBatimentId || !!initialData }}
                error={!!errors.id_batiment}
                helperText={errors.id_batiment?.message}
              >
                <MenuItem value="" disabled>Selectionner un batiment</MenuItem>
                {batiments.map((batiment) => (
                  <MenuItem key={batiment.id_batiment} value={batiment.id_batiment}>{batiment.nom}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" fontWeight={900}>Nombre d'œufs par type</Typography>
              <Typography variant="caption" color="text.secondary">
                Laissez vide ou indiquez 0 pour les types absents. Les œufs cassés et perdus sont distincts.
              </Typography>
            </Grid>
            {eggTypeOptions.map((type) => (
              <Grid item xs={12} sm={6} key={type.value}>
                <TextField
                  {...register(`quantites.${type.value}`, {
                    min: { value: 0, message: 'Minimum 0' },
                    validate: (value) => value === '' || (
                      Number.isInteger(Number(value)) && Number(value) >= 0
                    ) || 'Indiquez un nombre entier positif ou nul',
                  })}
                  label={type.label}
                  type="number"
                  inputProps={{ min: 0, step: 1 }}
                  fullWidth
                  disabled={loadingDaily || !!loadError}
                  error={!!errors.quantites?.[type.value]}
                  helperText={errors.quantites?.[type.value]?.message}
                />
              </Grid>
            ))}
            <Grid item xs={12}>
              <Typography fontWeight={900}>
                Total collecté : {totalEggs.toLocaleString('fr-FR')} œufs
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('grammage', {
                  required: 'Champ requis',
                  min: { value: 0, message: 'Doit etre positif' },
                })}
                label="Grammage moyen global (g)"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                fullWidth
                error={!!errors.grammage}
                helperText={errors.grammage?.message}
              />
            </Grid>
            {Number(quantities.normal || 0) > 0 && (
              <Grid item xs={12} sm={6}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: deducedCalibre ? 'success.50' : 'grey.100',
                    border: '1px solid',
                    borderColor: deducedCalibre ? 'success.light' : 'divider',
                    height: '100%',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" fontWeight={800}>
                    Calibre déduit
                  </Typography>
                  <Typography variant="h6" fontWeight={900}>
                    {deducedCalibre?.label || 'Saisir le grammage'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Calibre des œufs normaux déduit du grammage global.
                  </Typography>
                </Box>
              </Grid>
            )}

            <Grid item xs={12}>
              <Box
                sx={{
                  p: 2.5,
                  bgcolor: 'primary.50',
                  borderRadius: 2,
                  border: '1px dashed',
                  borderColor: 'primary.main',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    Calcul automatique des cartons
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Base sur les regles de stockage et de securite
                  </Typography>
                </Box>
                <Typography variant="h4" color="primary.main" fontWeight="bold">
                  {cartonPreview}
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" fontWeight={900}>
                Suivi du bâtiment
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Ces champs aident l'utilisateur à suivre la mortalité, l'aliment et la formule du jour.
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                {...register('mortalite', {
                  min: { value: 0, message: 'Doit etre positif' },
                })}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === '') {
                    setValue('mortalite', '');
                    return;
                  }
                  const parsedValue = Number(value);
                  setValue('mortalite', Number.isFinite(parsedValue) ? Math.max(0, Math.trunc(parsedValue)) : 0, {
                    shouldValidate: true,
                  });
                }}
                label="Mortalité"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                fullWidth
                error={!!errors.mortalite}
                helperText={errors.mortalite?.message || 'Optionnel'}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                {...register('consommation_aliment_kg', {
                  min: { value: 0, message: 'Doit etre positif' },
                })}
                label="Aliment consommé (kg)"
                type="number"
                inputProps={{ step: '0.01' }}
                fullWidth
                error={!!errors.consommation_aliment_kg}
                helperText={errors.consommation_aliment_kg?.message || 'Optionnel'}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                {...register('formule')}
                select
                label="Formule"
                value={watch('formule') || ''}
                onChange={(event) => setValue('formule', event.target.value)}
                fullWidth
                helperText="Optionnel"
              >
                <MenuItem value="">Non précisée</MenuItem>
                {formules.map((formule) => (
                  <MenuItem key={formule.value} value={formule.value}>
                    {formule.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexShrink: 0, bgcolor: 'background.paper' }}>
          <Button onClick={onClose} color="inherit">Annuler</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || loadingDaily || !!loadError}
            sx={{ px: 4, borderRadius: 2 }}
          >
            {isSubmitting ? 'Enregistrement...' : (initialData ? 'Mettre a jour' : 'Enregistrer')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default ProductionForm;
