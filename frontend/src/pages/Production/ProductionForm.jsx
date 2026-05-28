import React, { useState, useEffect } from 'react';
import {
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
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { productionService } from '../../services/productionService';
import useNotification from '../../hooks/useNotification';

const EGG_TYPES = [
  { value: 'normal', label: 'Oeufs normaux' },
  { value: 'double_jaune', label: 'Double jaune' },
  { value: 'double_jaune_demarrage', label: 'Double jaune demarrage' },
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
  preselectedEggType = 'normal',
  title,
  description,
}) {
  const notification = useNotification();
  const [formules, setFormules] = useState([]);
  const [calibreThresholds, setCalibreThresholds] = useState([]);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: initialData ? {
      ...initialData,
      date_production: initialData.date_production ? initialData.date_production.split('T')[0] : new Date().toISOString().split('T')[0],
    } : {
      date_production: new Date().toISOString().split('T')[0],
      id_batiment: preselectedBatimentId || '',
      type_oeuf: preselectedEggType,
      nombre_oeufs: '',
      grammage: '',
      mortalite: '',
      consommation_aliment_kg: '',
      formule: '',
      oeufs_perdus: '',
    },
  });

  const watchedNombre = watch('nombre_oeufs');
  const watchedType = watch('type_oeuf');
  const watchedBatiment = watch('id_batiment');
  const watchedGrammage = watch('grammage');
  const showDailyLossField = !initialData && watchedType !== 'perdu';
  const eggTypeOptions = initialData?.type_oeuf === 'perdu'
    ? EGG_TYPES
    : EGG_TYPES.filter((type) => type.value !== 'perdu');

  const [cartonPreview, setCartonPreview] = useState(0);

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
    const nb = parseInt(watchedNombre, 10);
    if (!Number.isNaN(nb) && nb > 0) {
      const fullCartons = Math.ceil(nb / 30);
      if (watchedType === 'double_jaune' || watchedType === 'double_jaune_demarrage') {
        setCartonPreview((fullCartons * 2) + 1);
      } else {
        const safetyCartons = Math.ceil(fullCartons / 10);
        setCartonPreview(fullCartons + safetyCartons);
      }
    } else {
      setCartonPreview(0);
    }
  }, [watchedNombre, watchedType]);

  const deducedCalibre = (() => {
    if (watchedType !== 'normal') return null;
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
    try {
      const lostEggs = Number(data.oeufs_perdus || 0);
      const payload = {
        ...data,
        oeufs_perdus: undefined,
        calibre: undefined,
        mortalite: data.mortalite === '' || data.mortalite === null ? null : Number(data.mortalite),
        consommation_aliment_kg: data.consommation_aliment_kg === '' || data.consommation_aliment_kg === null
          ? null
          : Number(data.consommation_aliment_kg),
        formule: data.formule || null,
      };
      if (initialData) {
        await productionService.updateProduction(initialData.id_production, payload);
        notification.success('Saisie mise a jour');
      } else {
        await productionService.createProduction(payload);
        if (showDailyLossField && lostEggs > 0) {
          await productionService.createProduction({
            date_production: data.date_production,
            id_batiment: data.id_batiment,
            type_oeuf: 'perdu',
            nombre_oeufs: lostEggs,
            grammage: data.grammage || 0,
            mortalite: null,
            consommation_aliment_kg: null,
            formule: null,
          });
        }
        notification.success(lostEggs > 0 ? 'Production et pertes enregistrees' : 'Production enregistree avec succes');
      }
      onSuccess();
    } catch (err) {
      notification.error(err.response?.data?.detail || 'Une erreur est survenue');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle sx={{ pb: 1, fontWeight: 'bold' }}>
          {title || (initialData ? 'Modifier la saisie' : 'Saisir la production du jour')}
        </DialogTitle>
        <DialogContent sx={{ py: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
            {description || 'Remplissez les informations de collecte pour le batiment selectionne.'}
          </Typography>

          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('date_production', { required: 'Date requise' })}
                label="Date de production"
                type="date"
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
                disabled={!!preselectedBatimentId && !initialData}
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

            <Grid item xs={12} sm={6}>
              <TextField
                {...register('type_oeuf', { required: true })}
                select
                value={watchedType || ''}
                label="Type de saisie"
                fullWidth
              >
                {eggTypeOptions.map((type) => (
                  <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('nombre_oeufs', {
                  required: 'Champ requis',
                  min: { value: 1, message: 'Minimum 1' },
                })}
                label="Nombre d'oeufs"
                type="number"
                fullWidth
                error={!!errors.nombre_oeufs}
                helperText={errors.nombre_oeufs?.message}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('grammage', {
                  required: 'Champ requis',
                  min: { value: 0, message: 'Doit etre positif' },
                })}
                label="Grammage moyen (g)"
                type="number"
                inputProps={{ step: '0.1' }}
                fullWidth
                error={!!errors.grammage}
                helperText={errors.grammage?.message}
              />
            </Grid>
            {watchedType === 'normal' && (
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
                    Seuils faciles à modifier plus tard.
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

            {showDailyLossField && (
              <>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" fontWeight={900}>
                    Pertes du jour
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Si des oeufs sont perdus ou casses aujourd'hui, indiquez-les ici. Sinon laissez vide.
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    {...register('oeufs_perdus', {
                      min: { value: 0, message: 'Doit etre positif' },
                    })}
                    label="Oeufs perdus"
                    type="number"
                    fullWidth
                    error={!!errors.oeufs_perdus}
                    helperText={errors.oeufs_perdus?.message || 'Optionnel'}
                  />
                </Grid>
                <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
              </>
            )}

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
                label="Mortalité"
                type="number"
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
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit">Annuler</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
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
