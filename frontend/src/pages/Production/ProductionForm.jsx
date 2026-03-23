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
  { value: 'normal', label: '🥚 Normal' },
  { value: 'double_jaune', label: '🥚🥚 Double Jaune' },
  { value: 'double_jaune_demarrage', label: '🥚🥚 Double Jaune Démarrage' },
  { value: 'casse', label: '💥 Cassé' },
  { value: 'blanc', label: '⚪ Blanc' },
  { value: 'perdu', label: '❌ Perdu' },
];

const CALIBRES = [
  { value: 'demarrage', label: 'Démarrage' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'gros', label: 'Gros' },
];

function ProductionForm({ open, onClose, onSuccess, initialData, batiments }) {
  const notification = useNotification();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: initialData ? {
      ...initialData,
      date_production: initialData.date_production ? initialData.date_production.split('T')[0] : new Date().toISOString().split('T')[0]
    } : {
      date_production: new Date().toISOString().split('T')[0],
      id_batiment: '',
      type_oeuf: 'normal',
      calibre: 'moyen',
      nombre_oeufs: '',
      grammage: '',
    }
  });

  const watchedNombre = watch('nombre_oeufs');
  const watchedType = watch('type_oeuf');
  const watchedBatiment = watch('id_batiment');
  const watchedCalibre = watch('calibre');

  // Aperçu du calcul des cartons
  const [cartonPreview, setCartonPreview] = useState(0);

  useEffect(() => {
    const nb = parseInt(watchedNombre);
    if (!isNaN(nb) && nb > 0) {
      // 1 carton = 30 œufs
      const nb_pleins = Math.ceil(nb / 30);
      if (watchedType === 'double_jaune' || watchedType === 'double_jaune_demarrage') {
        // "Quand double jaune utilisé, 2 fois plus de carton + 1"
        setCartonPreview((nb_pleins * 2) + 1);
      } else {
        // "Calcul carton tout les 10 cartons = 1 carton en plus"
        const nb_securite = Math.ceil(nb_pleins / 10);
        setCartonPreview(nb_pleins + nb_securite);
      }
    } else {
      setCartonPreview(0);
    }
  }, [watchedNombre, watchedType]);

  // Reset calibre if type is not normal
  useEffect(() => {
    if (watchedType !== 'normal') {
      setValue('calibre', null);
    } else if (!watchedCalibre) {
      setValue('calibre', 'moyen');
    }
  }, [watchedType, setValue, watchedCalibre]);

  const onSubmit = async (data) => {
    try {
      if (initialData) {
        await productionService.updateProduction(initialData.id_production, data);
        notification.success("Enregistrement mis à jour");
      } else {
        await productionService.createProduction(data);
        notification.success("Production enregistrée avec succès");
      }
      onSuccess();
    } catch (err) {
      notification.error(err.response?.data?.detail || "Une erreur est survenue");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle sx={{ pb: 1, fontWeight: 'bold' }}>
          {initialData ? 'Modifier Saisie' : 'Saisie Production Quotidienne'}
        </DialogTitle>
        <DialogContent sx={{ py: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
            Remplissez les informations de collecte pour le bâtiment sélectionné.
          </Typography>
          
          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('date_production', { required: "Date requise" })}
                label="Date de Production"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                error={!!errors.date_production}
                helperText={errors.date_production?.message}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('id_batiment', { required: "Bâtiment requis" })}
                select
                value={watchedBatiment || ''}
                label="Bâtiment"
                fullWidth
                error={!!errors.id_batiment}
                helperText={errors.id_batiment?.message}
              >
                <MenuItem value="" disabled>Sélectionner un bâtiment</MenuItem>
                {batiments.map(b => (
                  <MenuItem key={b.id_batiment} value={b.id_batiment}>{b.nom}</MenuItem>
                ))}
              </TextField>
            </Grid>
 
            <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
 
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('type_oeuf', { required: true })}
                select
                value={watchedType || ''}
                label="Type d'œuf"
                fullWidth
              >
                {EGG_TYPES.map(t => (
                  <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            {watchedType === 'normal' && (
              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('calibre', { required: watchedType === 'normal' })}
                  select
                  value={watchedCalibre || ''}
                  label="Calibre"
                  fullWidth
                  error={!!errors.calibre}
                  helperText={errors.calibre?.message}
                >
                  {CALIBRES.map(c => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('nombre_oeufs', { 
                  required: "Champ requis", 
                  min: { value: 1, message: "Minimum 1" } 
                })}
                label="Nombre d'œufs"
                type="number"
                fullWidth
                error={!!errors.nombre_oeufs}
                helperText={errors.nombre_oeufs?.message}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('grammage', { 
                  required: "Champ requis", 
                  min: { value: 0, message: "Doit être positif" } 
                })}
                label="Grammage moyen (g)"
                type="number"
                inputProps={{ step: '0.1' }}
                fullWidth
                error={!!errors.grammage}
                helperText={errors.grammage?.message}
              />
            </Grid>
            
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
                  alignItems: 'center'
                }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    Calcul Automatique des Cartons
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Basé sur les règles de stockage et sécurité
                  </Typography>
                </Box>
                <Typography variant="h4" color="primary.main" fontWeight="bold">
                  {cartonPreview}
                </Typography>
              </Box>
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
            {isSubmitting ? 'Enregistrement...' : (initialData ? 'Mettre à jour' : 'Enregistrer')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default ProductionForm;
