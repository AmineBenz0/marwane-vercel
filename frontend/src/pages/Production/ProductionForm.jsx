import DateField from '../../utils/DateField';
import { useState, useEffect, useRef } from 'react';
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
import { productionService, cycleProductionService } from '../../services/productionService';
import useNotification from '../../hooks/useNotification';
import compteBancaireService from '../../services/compteBancaireService';
import VaccineExpenseFields from './VaccineExpenseFields';

const EGG_TYPES = [
  { value: 'normal', label: 'Oeufs normaux' },
  { value: 'double_jaune', label: 'Double jaune' },
  { value: 'blanc', label: 'Oeufs blancs' },
  { value: 'casse', label: 'Oeufs casses' },
  { value: 'perdu', label: 'Oeuf perdu' },
];

const quantityError = (value) => {
  if (value === '' || value === undefined) return '';
  const count = Number(value);
  if (count < 0) return 'Minimum 0';
  return Number.isInteger(count) ? '' : 'Indiquez un nombre entier positif ou nul';
};

// Match the two-decimal precision of the stored average egg weight.
const eggWeightFromTray = (value) => Number((Number(value) / 30 - 2).toFixed(2));

const previewCount = (value) => {
  const count = Number(value || 0);
  return Number.isInteger(count) && count >= 0 ? count : 0;
};

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
  const [cycleContext, setCycleContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const manualFormula = useRef(false);
  const [formules, setFormules] = useState([]);
  const [calibreThresholds, setCalibreThresholds] = useState([]);
  const [loadingDaily, setLoadingDaily] = useState(!!initialData);
  const [loadError, setLoadError] = useState('');
  const [versions, setVersions] = useState({});
  const [chargeVersions, setChargeVersions] = useState({});
  const [vaccins, setVaccins] = useState([]);
  const [comptes, setComptes] = useState([]);
  const [vaccinesLoading, setVaccinesLoading] = useState(false);
  const [vaccinesError, setVaccinesError] = useState('');
  const { control, register, handleSubmit, watch, setValue, reset, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date_production: initialData?.date_production?.slice(0, 10) || preselectedDate,
      id_batiment: initialData?.id_batiment || preselectedBatimentId || '',
      quantites: Object.fromEntries(EGG_TYPES.map((type) => [type.value, ''])),
      poids_plateau: '',
      mortalite: '',
      consommation_aliment_kg: '',
      formule: '',
      depenses_vaccins: [],
    },
  });

  const quantities = watch('quantites') || {};
  const watchedBatiment = watch('id_batiment');
  const trayWeight = watch('poids_plateau');
  const watchedMortality = watch('mortalite');
  const watchedFeed = watch('consommation_aliment_kg');
  const watchedFormula = watch('formule');
  const vaccineExpenses = watch('depenses_vaccins') || [];
  const lostEggs = previewCount(quantities.casse) + previewCount(quantities.perdu);
  const vaccineTotal = vaccineExpenses.reduce(
    (sum, line) => sum + (Number(line.quantite) || 0) * (Number(line.prix_unitaire) || 0), 0,
  );
  const averageEggWeight = trayWeight !== '' && Number.isFinite(Number(trayWeight)) && Number(trayWeight) > 60
    ? eggWeightFromTray(trayWeight) : null;
  const watchedDate = watch('date_production');
  const totalEggs = EGG_TYPES.reduce(
    (sum, type) => sum + (['casse', 'perdu'].includes(type.value) ? 0 : previewCount(quantities[type.value])), 0,
  );
  const cartonPreview = EGG_TYPES.reduce((sum, type) => {
    const count = previewCount(quantities[type.value]);
    if (count <= 0 || ['casse', 'perdu'].includes(type.value)) return sum;
    const cartons = Math.ceil(count / 30);
    return sum + (type.value === 'double_jaune'
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
        const type = row.type_oeuf;
        if (Object.hasOwn(counts, type)) counts[type] += Number(row.nombre_oeufs);
      });
      const weightRows = rows.filter((row) => !['casse', 'perdu'].includes(row.type_oeuf));
      const weightCount = weightRows.reduce((sum, row) => sum + Number(row.nombre_oeufs), 0);
      const avgWeight = weightCount
        ? weightRows.reduce((sum, row) => sum + Number(row.grammage) * Number(row.nombre_oeufs), 0) / weightCount
        : 0;
      reset({
        date_production: initialData.date_production.slice(0, 10),
        id_batiment: initialData.id_batiment,
        quantites: counts,
        poids_plateau: weightCount ? Number(((Number(avgWeight.toFixed(2)) + 2) * 30).toFixed(2)) : '',
        mortalite: rows.reduce((sum, row) => sum + Number(row.mortalite || 0), 0),
        consommation_aliment_kg: Number(rows.reduce((sum, row) => sum + Number(row.consommation_aliment_kg || 0), 0).toFixed(2)),
        formule: rows.find((row) => row.formule)?.formule || '',
        depenses_vaccins: (daily.depenses_vaccins || []).map((line) => ({
          id_charge: line.id_charge, id_vaccin: line.id_vaccin, nom_vaccin: line.nom_vaccin,
          unite: line.unite, quantite: line.quantite, prix_unitaire: line.prix_unitaire, id_compte: line.id_compte || '',
        })),
      });
      setVersions(daily.versions || {});
      setChargeVersions(daily.charge_versions || {});
    }).catch(() => {
      if (!cancelled) setLoadError('Impossible de charger la saisie quotidienne. Fermez puis rouvrez le formulaire.');
    }).finally(() => {
      if (!cancelled) setLoadingDaily(false);
    });
    return () => { cancelled = true; };
  }, [open, initialData, reset]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setVaccinesLoading(true);
    setVaccinesError('');
    Promise.all([productionService.getVaccins(), compteBancaireService.getComptes()]).then(([catalogue, accounts]) => {
      if (!cancelled) { setVaccins(catalogue || []); setComptes(accounts || []); }
    }).catch(() => {
      if (!cancelled) setVaccinesError('Impossible de charger les vaccins ou les comptes. Rouvrez le formulaire pour ajouter une dépense.');
    }).finally(() => { if (!cancelled) setVaccinesLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

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

  useEffect(() => {
    if (!open || !watchedBatiment || !watchedDate) return undefined;
    let cancelled = false;
    setContextLoading(true);
    setCycleContext(null);
    setContextError('');
    cycleProductionService.getContext(watchedBatiment, watchedDate).then((data) => {
      if (!cancelled) setCycleContext(data);
    }).catch(() => {
      if (!cancelled) setContextError('Impossible de charger le cycle. Réessayez en rouvrant le formulaire.');
    }).finally(() => { if (!cancelled) setContextLoading(false); });
    return () => { cancelled = true; };
  }, [open, watchedBatiment, watchedDate]);

  useEffect(() => {
    if (initialData || manualFormula.current || contextLoading) return;
    setValue('formule', cycleContext?.cycle?.formule_suggeree || '');
  }, [cycleContext, contextLoading, initialData, setValue]);

  const missingCycle = !!cycleContext?.has_cycles && !cycleContext?.cycle;
  const deducedCalibre = (() => {
    const gramValue = averageEggWeight;
    if (!Number.isFinite(gramValue) || gramValue <= 0) return null;
    const match = calibreThresholds.find((threshold) => {
      const min = threshold.min_grammage === null || threshold.min_grammage === undefined ? null : Number(threshold.min_grammage);
      const max = threshold.max_grammage === null || threshold.max_grammage === undefined ? null : Number(threshold.max_grammage);
      return (min === null || gramValue >= min) && (max === null || gramValue < max);
    });
    return match || null;
  })();

  const onSubmit = async (data) => {
    if (loadingDaily || loadError || contextLoading || contextError || missingCycle) return;
    const counts = Object.fromEntries(Object.entries(data.quantites).map(
      ([type, count]) => [type, Number(count || 0)],
    ));
    if (!Object.values(counts).some((count) => count > 0) && !Number(data.mortalite || 0) && !Number(data.consommation_aliment_kg || 0) && !data.depenses_vaccins.length) {
      setError('root', { message: "Indiquez au moins un nombre d'œufs." });
      return;
    }
    try {
      const payload = {
        date_production: data.date_production,
        id_batiment: Number(data.id_batiment),
        quantites: counts,
        grammage: data.poids_plateau === '' ? 0 : eggWeightFromTray(data.poids_plateau),
        mortalite: data.mortalite === '' ? null : Number(data.mortalite),
        consommation_aliment_kg: data.consommation_aliment_kg === ''
          ? null : Number(data.consommation_aliment_kg),
        formule: data.formule || null,
        depenses_vaccins: data.depenses_vaccins.map((line) => ({
          ...(line.id_charge ? { id_charge: line.id_charge } : {}),
          id_vaccin: Number(line.id_vaccin), quantite: String(line.quantite),
          prix_unitaire: String(line.prix_unitaire), id_compte: line.id_compte ? Number(line.id_compte) : null,
          ...(line.mettre_a_jour_tarif ? { mettre_a_jour_tarif: true } : {}),
        })),
        ...(initialData ? { versions, charge_versions: chargeVersions } : {}),
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
      maxWidth="lg"
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
            {description || 'Indiquez le nombre de chaque type et le poids d’un plateau de 30 œufs.'}
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
          {contextLoading && <Typography sx={{ mb: 2 }}>Chargement du cycle...</Typography>}
          {contextError && <Alert severity="error" sx={{ mb: 2 }}>{contextError}</Alert>}
          {missingCycle && <Alert severity="warning" sx={{ mb: 2 }}>Aucun cycle pour cette date. Démarrez un cycle depuis la page du bâtiment.</Alert>}
          {cycleContext?.cycle && <Box sx={{ p: 1.5, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Typography fontWeight={800}>{cycleContext.cycle.nom_cycle}</Typography>
            <Typography variant="body2" color="text.secondary">
              {cycleContext.cycle.age_semaines} semaines · {Number(cycleContext.cycle.effectif_actuel || 0).toLocaleString('fr-FR')} volailles restantes à cette date
            </Typography>
          </Box>}
          <Grid container spacing={3} alignItems="flex-start">
            <Grid item xs={12} md={8}>
            <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6}>
              <DateField
                {...register('date_production', { required: 'Date requise' })}
                value={watch('date_production') || ''}
                onChange={(event) => setValue('date_production', event.target.value, { shouldValidate: true })}
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
                Laissez vide ou indiquez 0 pour les types absents. Les œufs cassés et perdus sont exclus du total collecté.
              </Typography>
            </Grid>
            {EGG_TYPES.map((type, index) => {
              const isLastField = index === EGG_TYPES.length - 1;
              const isCenteredFinalPair = EGG_TYPES.length % 3 === 2
                && index >= EGG_TYPES.length - 2;
              return (
                <Grid
                  item
                  xs={12}
                  sm={6}
                  md={4}
                  key={type.value}
                  sx={{
                    ...(isLastField && { sm: { transform: 'translateX(50%)' } }),
                    ...(isCenteredFinalPair && { md: { transform: 'translateX(50%)' } }),
                  }}
                >
                  <TextField
                    {...register(`quantites.${type.value}`, {
                      validate: (value) => quantityError(value) || true,
                    })}
                    label={type.label}
                    type="number"
                    inputProps={{ min: 0, step: 1 }}
                    InputLabelProps={{ shrink: !!initialData }}
                    fullWidth
                    disabled={loadingDaily || !!loadError}
                    error={!!quantityError(quantities[type.value])}
                    helperText={quantityError(quantities[type.value])}
                  />
                </Grid>
              );
            })}
            <Grid item xs={12}>
              <Typography fontWeight={900}>
                Total collecté (hors cassés et perdus) : {totalEggs.toLocaleString('fr-FR')} œufs
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Grid container spacing={2.5} alignItems="center">
                <Grid item xs={12} sm={6}>
                  <TextField
                    {...register('poids_plateau', {
                      validate: (value) => {
                        if (value === '') return totalEggs > 0 ? 'Champ requis' : true;
                        return (Number.isFinite(Number(value)) && Number(value) > 60)
                          || 'Le poids du plateau doit être supérieur à 60 g.';
                      },
                    })}
                    label="Poids du plateau (g)"
                    type="number"
                    inputProps={{ min: 60.01, step: '0.01' }}
                    value={trayWeight ?? ''}
                    fullWidth
                    disabled={loadingDaily || !!loadError}
                    error={!!errors.poids_plateau}
                    helperText={errors.poids_plateau?.message}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box
                    component="output"
                    aria-label="Poids moyen de l’œuf"
                    aria-live="polite"
                    aria-atomic="true"
                    sx={{ display: 'block', px: 2 }}
                  >
                    <Typography variant="caption" color="text.secondary" fontWeight={800}>
                      Poids moyen de l’œuf
                    </Typography>
                    <Typography variant="h5" color="primary.main" fontWeight={900} sx={{ my: 0.25 }}>
                      {averageEggWeight === null ? '—' : `${averageEggWeight.toLocaleString('fr-FR', {
                        minimumFractionDigits: 2, maximumFractionDigits: 2,
                      })} g`}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Grid>
            {Number(quantities.normal || 0) > 0 && (
              <Grid item xs={12}>
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
                    {deducedCalibre?.label || 'Saisir le poids du plateau'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Calibre des œufs normaux déduit du poids moyen calculé.
                  </Typography>
                </Box>
              </Grid>
            )}

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
                InputLabelProps={{ shrink: !!initialData }}
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
                InputLabelProps={{ shrink: !!initialData }}
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
                onChange={(event) => { manualFormula.current = true; setValue('formule', event.target.value); }}
                fullWidth
                helperText={cycleContext?.cycle && !initialData
                  ? 'Préselection selon l’âge du lot. Vous pouvez la modifier.'
                  : 'Formule utilisée ce jour'}
              >
                <MenuItem value="">Non précisée</MenuItem>
                {formules.map((formule) => (
                  <MenuItem key={formule.value} value={formule.value}>
                    {formule.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <VaccineExpenseFields control={control} register={register} setValue={setValue} errors={errors}
                vaccins={vaccins} onVaccinsChange={setVaccins} comptes={comptes} loading={vaccinesLoading} loadError={vaccinesError}
                disabled={isSubmitting || loadingDaily || !!loadError} />
            </Grid>
          </Grid>
          </Grid>

          <Grid item xs={12} md={4}>
            <Box
              component="aside"
              aria-label="Recapitulatif de la journee"
              sx={{
                p: 2.5,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.default',
                position: { md: 'sticky' },
                top: 8,
              }}
            >
              <Typography variant="subtitle1" fontWeight={900} sx={{ mb: 2 }}>
                Recapitulatif de la journee
              </Typography>
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {[
                  ['Oeufs collectes', `${totalEggs.toLocaleString('fr-FR')} oeufs`],
                  ['Casses et perdus', `${lostEggs.toLocaleString('fr-FR')} oeufs`],
                  ['Poids moyen', averageEggWeight === null
                    ? '-'
                    : `${averageEggWeight.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`],
                  ['Calibre', deducedCalibre?.label || '-'],
                  ['Cartons calcules', `${cartonPreview}`],
                  ['Mortalite', watchedMortality !== '' && watchedMortality != null
                    ? `${Number(watchedMortality).toLocaleString('fr-FR')} sujets`
                    : '-'],
                  ['Aliment consomme', watchedFeed !== '' && watchedFeed != null
                    ? `${Number(watchedFeed).toLocaleString('fr-FR')} kg`
                    : '-'],
                  ['Formule', formules.find((item) => item.value === watchedFormula)?.label || 'Non precisee'],
                  ['Depenses vaccins', `${vaccineTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`],
                ].map(([label, value], index, items) => (
                  <Box
                    key={label}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 2,
                      alignItems: 'baseline',
                      pb: 1,
                      borderBottom: index < items.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                    <Typography variant="body2" fontWeight={800} textAlign="right">{value}</Typography>
                  </Box>
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                Le recapitulatif se met a jour pendant la saisie.
              </Typography>
            </Box>
          </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexShrink: 0, bgcolor: 'background.paper' }}>
          <Button onClick={onClose} color="inherit">Annuler</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || loadingDaily || !!loadError || contextLoading || !!contextError || missingCycle}
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
