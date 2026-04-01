/**
 * ModalForm — Formulaire modal redesigné.
 *
 * Design: dialogue épuré avec titre clair, champs bien espacés,
 * labels au-dessus des champs (plus lisible pour non-techniques),
 * boutons distincts, messages d'erreur proches des champs.
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
  FormControlLabel,
  Switch,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  FormHelperText,
  IconButton,
  Divider,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

// ─── Field label component ───────────────────────────────────────────────────
function FieldLabel({ children, required }) {
  return (
    <Typography
      component="label"
      variant="body2"
      sx={{
        display: 'block',
        fontWeight: 500,
        color: 'text.primary',
        mb: 0.625,
        fontSize: '0.875rem',
      }}
    >
      {children}
      {required && (
        <Box component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Box>
      )}
    </Typography>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
    mode: 'onChange',
  });

  useEffect(() => {
    if (open) { reset(initialValues); clearErrors(); }
  }, [open, initialValues, reset, clearErrors]);

  useEffect(() => {
    if (!open) { reset(); clearErrors(); }
  }, [open, reset, clearErrors]);

  const handleFormSubmit = async (data) => {
    try {
      await onSubmit(data);
      reset();
    } catch (error) {
      if (error?.data?.detail) {
        const detail = error.data.detail;
        if (Array.isArray(detail)) {
          detail.forEach((err) => {
            if (err.loc?.length > 1) {
              setError(err.loc[err.loc.length - 1], { type: 'server', message: err.msg });
            }
          });
        } else if (typeof detail === 'string') {
          setError('root', { type: 'server', message: detail });
        }
      } else if (error?.message) {
        setError('root', { type: 'server', message: error.message });
      }
    }
  };

  const handleClose = () => {
    if (!loading) { reset(); clearErrors(); onClose(); }
  };

  // ── Field renderer ───────────────────────────────────────────────────────
  const renderField = (field) => {
    const {
      name,
      label,
      type = 'text',
      placeholder,
      required = false,
      multiline = false,
      rows = 3,
      disabled = false,
      fullWidth = true,
      options = [],
      render,
      helperText: fieldHelperText,
      ...rest
    } = field;

    // Custom render function
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
          switch (type) {
            // ── Select ───────────────────────────────────────────────────
            case 'select':
              return (
                <Box sx={{ mb: 2 }}>
                  <FieldLabel required={required}>{label}</FieldLabel>
                  <FormControl fullWidth error={!!errors[name]} disabled={disabled || loading}>
                    <Select
                      value={value ?? ''}
                      onChange={onChange}
                      onBlur={onBlur}
                      displayEmpty
                      size="small"
                      sx={{ borderRadius: 2 }}
                      renderValue={(v) => {
                        if (!v && !options.find(o => o.value === v)) {
                          return <Typography color="text.disabled" fontSize="0.875rem">Choisir…</Typography>;
                        }
                        return options.find(o => o.value === v)?.label || v;
                      }}
                    >
                      {options.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                    {errors[name] && (
                      <FormHelperText sx={{ mx: 0, mt: 0.5, fontSize: '0.75rem' }}>
                        {errors[name]?.message}
                      </FormHelperText>
                    )}
                    {!errors[name] && fieldHelperText && (
                      <FormHelperText sx={{ mx: 0, mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                        {fieldHelperText}
                      </FormHelperText>
                    )}
                  </FormControl>
                </Box>
              );

            // ── Switch ───────────────────────────────────────────────────
            case 'switch':
              return (
                <Box sx={{ mb: 2 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      backgroundColor: value ? alpha(theme.palette.primary.main, 0.03) : 'transparent',
                    }}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight={500} color="text.primary">
                        {label}
                        {required && <Box component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Box>}
                      </Typography>
                      {fieldHelperText && (
                        <Typography variant="caption" color="text.secondary">
                          {fieldHelperText}
                        </Typography>
                      )}
                    </Box>
                    <Switch
                      checked={!!value}
                      onChange={(e) => onChange(e.target.checked)}
                      onBlur={onBlur}
                      disabled={disabled || loading}
                      size="small"
                    />
                  </Box>
                  {errors[name] && (
                    <FormHelperText error sx={{ mx: 0, mt: 0.5, fontSize: '0.75rem' }}>
                      {errors[name]?.message}
                    </FormHelperText>
                  )}
                </Box>
              );

            // ── Checkbox ─────────────────────────────────────────────────
            case 'checkbox':
              return (
                <Box sx={{ mb: 2 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={!!value}
                        onChange={(e) => onChange(e.target.checked)}
                        onBlur={onBlur}
                        disabled={disabled || loading}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2" fontWeight={500} color="text.primary">
                        {label}
                        {required && <Box component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Box>}
                      </Typography>
                    }
                    sx={{ ml: 0 }}
                  />
                  {fieldHelperText && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 3.5 }}>
                      {fieldHelperText}
                    </Typography>
                  )}
                  {errors[name] && (
                    <FormHelperText error sx={{ mx: 0, fontSize: '0.75rem' }}>
                      {errors[name]?.message}
                    </FormHelperText>
                  )}
                </Box>
              );

            // ── Date ─────────────────────────────────────────────────────
            case 'date':
              return (
                <Box sx={{ mb: 2 }}>
                  <FieldLabel required={required}>{label}</FieldLabel>
                  <TextField
                    {...rest}
                    fullWidth
                    type="date"
                    size="small"
                    value={value || ''}
                    onChange={onChange}
                    onBlur={onBlur}
                    error={!!errors[name]}
                    helperText={errors[name]?.message || fieldHelperText || ''}
                    disabled={disabled || loading}
                    InputLabelProps={{ shrink: true }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Box>
              );

            // ── Number ───────────────────────────────────────────────────
            case 'number':
              return (
                <Box sx={{ mb: 2 }}>
                  <FieldLabel required={required}>{label}</FieldLabel>
                  <TextField
                    {...rest}
                    fullWidth
                    type="number"
                    size="small"
                    placeholder={placeholder}
                    value={value ?? ''}
                    onChange={onChange}
                    onBlur={onBlur}
                    error={!!errors[name]}
                    helperText={errors[name]?.message || fieldHelperText || ''}
                    disabled={disabled || loading}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Box>
              );

            // ── Default (text, email, password, etc.) ─────────────────────
            default:
              return (
                <Box sx={{ mb: 2 }}>
                  <FieldLabel required={required}>{label}</FieldLabel>
                  <TextField
                    {...rest}
                    fullWidth
                    type={type}
                    size="small"
                    placeholder={placeholder}
                    value={value || ''}
                    onChange={onChange}
                    onBlur={onBlur}
                    error={!!errors[name]}
                    helperText={errors[name]?.message || fieldHelperText || ''}
                    multiline={multiline}
                    rows={multiline ? rows : undefined}
                    disabled={disabled || loading}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Box>
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
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          m: isMobile ? 0 : 2,
          maxHeight: isMobile ? '100%' : 'calc(100% - 32px)',
        },
      }}
    >
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        {/* Title bar */}
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
            {title}
          </Typography>
          <IconButton
            size="small"
            onClick={handleClose}
            disabled={loading}
            sx={{
              color: 'text.secondary',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': { backgroundColor: 'grey.100' },
            }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>

        {/* Body */}
        <DialogContent sx={{ pt: 2 }}>
          {/* Server / global error */}
          {(errorMessage || errors.root) && (
            <Alert severity="error" sx={{ mb: 2.5 }}>
              {errorMessage || errors.root?.message}
            </Alert>
          )}

          {fields.length > 0 ? (
            fields.map((field) => renderField(field))
          ) : (
            <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
              Aucun champ défini pour ce formulaire.
            </Typography>
          )}
        </DialogContent>

        {/* Footer actions */}
        <DialogActions
          sx={{
            flexDirection: isMobile ? 'column-reverse' : 'row',
            gap: 1,
          }}
        >
          <Button
            onClick={handleClose}
            disabled={loading}
            variant="outlined"
            fullWidth={isMobile}
            sx={{ borderRadius: 2 }}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !isDirty}
            fullWidth={isMobile}
            startIcon={loading ? <CircularProgress size={15} color="inherit" /> : null}
            sx={{
              borderRadius: 2,
              minWidth: 120,
              background: 'linear-gradient(135deg, #14B8A6, #0D9488)',
              '&:hover': { background: 'linear-gradient(135deg, #0D9488, #0F766E)' },
              '&:disabled': { background: 'grey.200', color: 'text.disabled' },
            }}
          >
            {loading ? 'Enregistrement…' : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default ModalForm;
