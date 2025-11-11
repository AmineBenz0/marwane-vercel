/**
 * Composant ModalForm réutilisable.
 * 
 * Affiche un formulaire dans une modal avec les fonctionnalités suivantes :
 * - Support pour création et édition
 * - Validation en temps réel avec react-hook-form + yup
 * - Gestion des erreurs (validation et serveur)
 * - Modal réutilisable avec Material-UI
 * 
 * @param {boolean} open - Contrôle l'ouverture/fermeture de la modal
 * @param {Function} onClose - Callback appelé lors de la fermeture de la modal
 * @param {Function} onSubmit - Callback appelé lors de la soumission du formulaire (reçoit les données validées)
 * @param {object} initialValues - Valeurs initiales pour le formulaire (pour l'édition)
 * @param {object} validationSchema - Schéma de validation Yup
 * @param {Array} fields - Configuration des champs du formulaire
 * @param {string} title - Titre de la modal
 * @param {string} submitLabel - Label du bouton de soumission (défaut: "Enregistrer")
 * @param {boolean} loading - Indique si la soumission est en cours
 * @param {string} errorMessage - Message d'erreur serveur à afficher
 */

import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress,
  Typography,
  FormControl,
  FormLabel,
  FormControlLabel,
  Switch,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
  FormHelperText,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

/**
 * Composant ModalForm.
 */
function ModalForm({
  open = false,
  onClose,
  onSubmit,
  initialValues = {},
  validationSchema,
  fields = [],
  title = 'Formulaire',
  submitLabel = 'Enregistrer',
  loading = false,
  errorMessage = null,
}) {
  // Initialiser react-hook-form avec le resolver Yup
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setError,
    clearErrors,
  } = useForm({
    resolver: validationSchema ? yupResolver(validationSchema) : undefined,
    defaultValues: initialValues,
    mode: 'onChange', // Validation en temps réel
  });

  // Réinitialiser le formulaire lorsque initialValues change (pour l'édition)
  useEffect(() => {
    if (open) {
      reset(initialValues);
      clearErrors(); // Nettoyer les erreurs précédentes
    }
  }, [open, initialValues, reset, clearErrors]);

  // Nettoyer les erreurs serveur lorsque la modal se ferme
  useEffect(() => {
    if (!open) {
      reset();
      clearErrors();
    }
  }, [open, reset, clearErrors]);

  /**
   * Gère la soumission du formulaire.
   */
  const handleFormSubmit = async (data) => {
    try {
      // Appeler le callback onSubmit avec les données validées
      await onSubmit(data);
      
      // Si la soumission réussit, réinitialiser le formulaire
      reset();
    } catch (error) {
      // Gérer les erreurs de validation serveur
      if (error?.data?.detail) {
        // Si l'erreur contient des détails de validation (format FastAPI)
        const detail = error.data.detail;
        
        if (Array.isArray(detail)) {
          // Erreurs de validation Pydantic (liste d'erreurs)
          detail.forEach((err) => {
            if (err.loc && err.loc.length > 1) {
              const fieldName = err.loc[err.loc.length - 1];
              setError(fieldName, {
                type: 'server',
                message: err.msg,
              });
            }
          });
        } else if (typeof detail === 'string') {
          // Erreur générale
          setError('root', {
            type: 'server',
            message: detail,
          });
        }
      } else if (error?.message) {
        // Erreur avec message
        setError('root', {
          type: 'server',
          message: error.message,
        });
      }
    }
  };

  /**
   * Gère la fermeture de la modal.
   */
  const handleClose = () => {
    if (!loading) {
      reset();
      clearErrors();
      onClose();
    }
  };

  /**
   * Rend un champ de formulaire selon sa configuration.
   */
  const renderField = (field) => {
    const {
      name,
      label,
      type = 'text',
      placeholder,
      required = false,
      multiline = false,
      rows = 1,
      disabled = false,
      fullWidth = true,
      options = [], // Pour les Select
      render, // Fonction de rendu personnalisée
      ...fieldProps
    } = field;

    // Si une fonction de rendu personnalisée est fournie, l'utiliser
    if (render && typeof render === 'function') {
      return (
        <Controller
          key={name}
          name={name}
          control={control}
          render={({ field: { onChange, value, onBlur }, fieldState: { error } }) =>
            render({ onChange, value, onBlur, error, disabled: disabled || loading })
          }
        />
      );
    }

    return (
      <Controller
        key={name}
        name={name}
        control={control}
        render={({ field: { onChange, value, onBlur } }) => {
          // Gestion des différents types de champs
          switch (type) {
            case 'select':
              return (
                <FormControl
                  fullWidth={fullWidth}
                  margin="normal"
                  error={!!errors[name]}
                  disabled={disabled || loading}
                >
                  <InputLabel required={required}>{label}</InputLabel>
                  <Select
                    {...fieldProps}
                    value={value || ''}
                    onChange={onChange}
                    onBlur={onBlur}
                    label={label}
                  >
                    {options.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors[name] && (
                    <FormHelperText>{errors[name]?.message}</FormHelperText>
                  )}
                </FormControl>
              );

            case 'switch':
              return (
                <FormControlLabel
                  control={
                    <Switch
                      {...fieldProps}
                      checked={!!value}
                      onChange={(e) => onChange(e.target.checked)}
                      onBlur={onBlur}
                      disabled={disabled || loading}
                    />
                  }
                  label={label}
                  sx={{ mt: 2, mb: 1 }}
                />
              );

            case 'checkbox':
              return (
                <FormControlLabel
                  control={
                    <Checkbox
                      {...fieldProps}
                      checked={!!value}
                      onChange={(e) => onChange(e.target.checked)}
                      onBlur={onBlur}
                      disabled={disabled || loading}
                    />
                  }
                  label={label}
                  sx={{ mt: 2, mb: 1 }}
                />
              );

            case 'date':
              return (
                <TextField
                  {...fieldProps}
                  fullWidth={fullWidth}
                  label={label}
                  type="date"
                  value={value || ''}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={!!errors[name]}
                  helperText={errors[name]?.message || ''}
                  required={required}
                  disabled={disabled || loading}
                  margin="normal"
                  variant="outlined"
                  InputLabelProps={{
                    shrink: true,
                  }}
                />
              );

            case 'number':
              return (
                <TextField
                  {...fieldProps}
                  fullWidth={fullWidth}
                  label={label}
                  type="number"
                  placeholder={placeholder}
                  value={value ?? ''}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={!!errors[name]}
                  helperText={errors[name]?.message || ''}
                  required={required}
                  disabled={disabled || loading}
                  margin="normal"
                  variant="outlined"
                />
              );

            default:
              // TextField par défaut (text, email, password, etc.)
              return (
                <TextField
                  {...fieldProps}
                  fullWidth={fullWidth}
                  label={label}
                  type={type}
                  placeholder={placeholder}
                  value={value || ''}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={!!errors[name]}
                  helperText={errors[name]?.message || ''}
                  required={required}
                  multiline={multiline}
                  rows={rows}
                  disabled={disabled || loading}
                  margin="normal"
                  variant="outlined"
                />
              );
          }
        }}
      />
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '300px',
        },
      }}
    >
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <DialogTitle>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="h6" component="div">
              {title}
            </Typography>
            <Button
              onClick={handleClose}
              disabled={loading}
              sx={{ minWidth: 'auto', p: 1 }}
            >
              <CloseIcon />
            </Button>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {/* Afficher l'erreur serveur générale si présente */}
          {(errorMessage || errors.root) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage || errors.root?.message}
            </Alert>
          )}

          {/* Rendre tous les champs du formulaire */}
          <Box sx={{ mt: 1 }}>
            {fields.length > 0 ? (
              fields.map((field) => renderField(field))
            ) : (
              <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
                Aucun champ défini pour ce formulaire.
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={handleClose}
            disabled={loading}
            color="inherit"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !isDirty}
            startIcon={loading ? <CircularProgress size={16} /> : null}
          >
            {loading ? 'Enregistrement...' : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default ModalForm;

