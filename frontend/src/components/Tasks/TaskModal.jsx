import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { addDays, addHours, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

const DATE = 'yyyy-MM-dd';
const DATE_TIME = "yyyy-MM-dd'T'HH:mm";

const PRIORITE_OPTIONS = [
  { value: 'basse', label: 'Basse' },
  { value: 'moyenne', label: 'Moyenne' },
  { value: 'haute', label: 'Haute' },
];

const CATEGORIE_OPTIONS = [
  { value: '', label: 'Sans catégorie' },
  { value: 'travail', label: 'Travail' },
  { value: 'personnel', label: 'Personnel' },
  { value: 'rdv', label: 'Rendez-vous' },
  { value: 'urgent', label: 'Urgent' },
];

function formatDateForInput(value, allDay) {
  if (!value) return '';
  const date = parseISO(allDay ? value.slice(0, 10) : value);
  return isValid(date) ? format(date, allDay ? DATE : DATE_TIME) : '';
}

function serializeCalendarDate(value, allDay) {
  if (!value) return null;
  return allDay ? value : parseISO(value).toISOString();
}

function updatePlannedDate(task, plannedDate) {
  const allDay = Boolean(task?.est_toute_la_journee);
  const start = formatDateForInput(task?.date_debut, allDay);
  const currentDate = start.split('T')[0];
  if (plannedDate === currentDate) return {};
  if (!plannedDate) {
    return { date_debut: null, date_fin: null, est_toute_la_journee: false };
  }
  if (!currentDate) return { date_debut: plannedDate, est_toute_la_journee: true };

  // Moving a dated task from the checklist preserves its calendar time and span.
  const dayShift = differenceInCalendarDays(parseISO(plannedDate), parseISO(currentDate));
  const shiftDate = (value) => {
    if (!value) return null;
    const date = parseISO(allDay ? value.slice(0, 10) : value);
    if (!isValid(date)) return null;
    const shifted = addDays(date, dayShift);
    return allDay ? format(shifted, DATE) : shifted.toISOString();
  };

  return {
    date_debut: shiftDate(task.date_debut),
    date_fin: shiftDate(task.date_fin),
  };
}

function TaskModal({ open, onClose, task, onSave, onDelete, calendar = false }) {
  const isEdit = Boolean(task?.id_tache);
  const [showNotes, setShowNotes] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    getValues,
    formState: { dirtyFields, errors, isSubmitting },
    watch,
  } = useForm({
    defaultValues: {
      titre: '',
      description: '',
      date_debut: '',
      date_fin: '',
      est_toute_la_journee: false,
      priorite: 'moyenne',
      categorie: 'travail',
    },
  });
  const allDay = watch('est_toute_la_journee');

  useEffect(() => {
    if (!open) return;
    const eventAllDay = Boolean(task?.est_toute_la_journee);
    const start = formatDateForInput(task?.date_debut, eventAllDay);
    const now = new Date();
    reset({
      titre: task?.titre ?? '',
      description: task?.description ?? '',
      date_debut: calendar
        ? start || format(now, eventAllDay ? DATE : DATE_TIME)
        : start.split('T')[0],
      date_fin: formatDateForInput(task?.date_fin, eventAllDay)
        || (calendar && !task ? format(addHours(now, 1), DATE_TIME) : ''),
      est_toute_la_journee: eventAllDay,
      priorite: task?.priorite ?? 'moyenne',
      categorie: task?.categorie ?? (isEdit ? '' : 'travail'),
    });
    setShowNotes(Boolean(task?.description));
  }, [calendar, isEdit, open, reset, task]);

  const handleFormSubmit = async (data) => {
    const values = {
      titre: data.titre.trim(),
      description: data.description?.trim() || null,
    };
    if (calendar) {
      if (!isEdit || dirtyFields.date_debut || dirtyFields.est_toute_la_journee) {
        values.date_debut = serializeCalendarDate(data.date_debut, allDay);
      }
      if (!isEdit || dirtyFields.date_fin || dirtyFields.est_toute_la_journee) {
        values.date_fin = serializeCalendarDate(data.date_fin, allDay);
      }
      if (!isEdit || dirtyFields.est_toute_la_journee) values.est_toute_la_journee = allDay;
      if (!isEdit || dirtyFields.priorite) values.priorite = data.priorite;
      if (!isEdit || dirtyFields.categorie) values.categorie = data.categorie || null;
    } else {
      Object.assign(values, updatePlannedDate(task, data.date_debut));
    }
    try {
      await onSave(values);
      onClose();
    } catch {
      // The page reports the save failure. Keep the form open for a retry.
    }
  };

  const toggleAllDay = (checked) => {
    const [start, end] = getValues(['date_debut', 'date_fin']);
    const convert = (value, time) => {
      if (!value) return '';
      const day = value.split('T')[0];
      return checked ? day : `${day}T${time}`;
    };
    setValue('date_debut', convert(start, '09:00'), { shouldDirty: true });
    setValue('date_fin', convert(end, '10:00'), { shouldDirty: true });
  };

  const showDescription = calendar || showNotes;

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      aria-labelledby="task-form-title"
      maxWidth={calendar ? 'sm' : 'xs'}
      fullWidth
    >
      <DialogTitle id="task-form-title">
        {isEdit ? 'Modifier la tâche' : 'Nouvelle tâche'}
      </DialogTitle>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                {...register('titre', { validate: value => Boolean(value.trim()) || 'Le titre est requis' })}
                label="Titre"
                fullWidth
                required
                error={Boolean(errors.titre)}
                helperText={errors.titre?.message}
                inputProps={{ maxLength: 255 }}
                autoFocus
              />
            </Grid>
            <Grid item xs={12} sm={calendar ? 6 : 12}>
              <TextField
                {...register('date_debut', { required: calendar && 'Requis' })}
                label={calendar ? 'Début' : 'Date prévue (facultative)'}
                type={calendar && !allDay ? 'datetime-local' : 'date'}
                fullWidth
                required={calendar}
                error={Boolean(errors.date_debut)}
                helperText={errors.date_debut?.message}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            {calendar && (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    {...register('date_fin')}
                    label="Fin"
                    type={allDay ? 'date' : 'datetime-local'}
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
                          <Switch
                            {...field}
                            checked={field.value}
                            onChange={(_, checked) => {
                              toggleAllDay(checked);
                              field.onChange(checked);
                            }}
                          />
                        )}
                      />
                    }
                    label="Toute la journée"
                  />
                </Grid>
              </>
            )}
            <Grid item xs={12}>
              {showDescription ? (
                <TextField
                  {...register('description')}
                  label={calendar ? 'Description' : 'Consignes'}
                  fullWidth
                  multiline
                  rows={3}
                  autoFocus={!calendar && !task?.description}
                />
              ) : (
                <Button onClick={() => setShowNotes(true)} sx={{ textTransform: 'none' }}>
                  Ajouter des consignes
                </Button>
              )}
            </Grid>
            {calendar && (
              <>
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
                <Grid item xs={12} sm={6}>
                  <TextField
                    {...register('categorie')}
                    select
                    label="Catégorie"
                    fullWidth
                  >
                    {CATEGORIE_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                  </TextField>
                </Grid>
              </>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Box>
            {isEdit && onDelete && (
              <Button color="error" onClick={() => onDelete(task.id_tache)} disabled={isSubmitting}>
                Supprimer
              </Button>
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose} disabled={isSubmitting}>Annuler</Button>
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
