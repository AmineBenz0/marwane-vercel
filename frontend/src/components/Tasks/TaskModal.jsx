import React, { useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  MenuItem,
  FormControlLabel,
  Switch,
  Stack,
  CircularProgress
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { format, parseISO } from 'date-fns';

const STATUT_OPTIONS = [
  { value: 'en_attente', label: 'En attente' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'complete', label: 'Complétée' },
  { value: 'annule', label: 'Annulée' },
];

const PRIORITE_OPTIONS = [
  { value: 'basse', label: 'Basse' },
  { value: 'moyenne', label: 'Moyenne' },
  { value: 'haute', label: 'Haute' },
];

const CATEGORIE_OPTIONS = [
  { value: 'travail', label: 'Travail' },
  { value: 'personnel', label: 'Personnel' },
  { value: 'rdv', label: 'Rendez-vous' },
  { value: 'urgent', label: 'Urgent' },
];

function TaskModal({ open, onClose, task, onSave, onDelete }) {
  const isEdit = !!task?.id_tache;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
    watch
  } = useForm({
    defaultValues: {
      titre: '',
      description: '',
      date_debut: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      date_fin: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      est_toute_la_journee: false,
      statut: 'en_attente',
      priorite: 'moyenne',
      categorie: 'travail',
    }
  });

  const estTouteLaJournee = watch('est_toute_la_journee');

  useEffect(() => {
    if (open) {
      if (task) {
        reset({
          ...task,
          date_debut: task.date_debut ? format(new Date(task.date_debut), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          date_fin: task.date_fin ? format(new Date(task.date_fin), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        });
      } else {
        reset({
          titre: '',
          description: '',
          date_debut: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          date_fin: format(new Date().setHours(new Date().getHours() + 1), "yyyy-MM-dd'T'HH:mm"),
          est_toute_la_journee: false,
          statut: 'en_attente',
          priorite: 'moyenne',
          categorie: 'travail',
        });
      }
    }
  }, [open, task, reset]);

  const handleFormSubmit = async (data) => {
    // Transformer les dates ISO si nécessaire ou envoyer tel quel (FastAPI accepte ISO)
    await onSave(data);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEdit ? 'Modifier la tâche' : 'Nouvelle tâche'}
      </DialogTitle>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                {...register('titre', { required: 'Le titre est requis' })}
                label="Titre"
                fullWidth
                required
                error={!!errors.titre}
                helperText={errors.titre?.message}
                autoFocus
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                {...register('description')}
                label="Description"
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('date_debut', { required: 'Requis' })}
                label="Début"
                type={estTouteLaJournee ? "date" : "datetime-local"}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('date_fin')}
                label="Fin"
                type={estTouteLaJournee ? "date" : "datetime-local"}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Controller
                    name="est_toute_la_journee"
                    control={control}
                    render={({ field }) => (
                      <Switch {...field} checked={field.value} />
                    )}
                  />
                }
                label="Toute la journée"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('statut')}
                select
                label="Statut"
                fullWidth
              >
                {STATUT_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('priorite')}
                select
                label="Priorité"
                fullWidth
              >
                {PRIORITE_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                {...register('categorie')}
                select
                label="Catégorie"
                fullWidth
              >
                {CATEGORIE_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Box>
            {isEdit && (
              <Button color="error" onClick={() => onDelete(task.id_tache)}>
                Supprimer
              </Button>
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose}>Annuler</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              startIcon={isSubmitting && <CircularProgress size={20} color="inherit" />}
            >
              Enregistrer
            </Button>
          </Stack>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default TaskModal;
