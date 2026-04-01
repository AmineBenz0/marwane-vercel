/**
 * Page de connexion — redesignée.
 *
 * Design: carte centrée sur fond ardoise clair,
 * logo avec dégradé teal, champs épurés, bouton moderne.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import {
  EmailOutlined as EmailIcon,
  LockOutlined as LockIcon,
  Visibility,
  VisibilityOff,
  AccountBalance as LogoIcon,
} from '@mui/icons-material';
import useAuthStore from '../store/authStore';

const loginSchema = yup.object().shape({
  email: yup
    .string()
    .email('Adresse email invalide')
    .required('L\'email est requis'),
  password: yup
    .string()
    .required('Le mot de passe est requis'),
});

function Login() {
  const navigate = useNavigate();
  const { login, isInitialized } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: yupResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onChange',
  });

  const onSubmit = async (data) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await login(data.email, data.password);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      let message = 'Une erreur est survenue. Veuillez réessayer.';
      if (error?.status === 401) message = 'Email ou mot de passe incorrect.';
      else if (error?.status === 403) message = 'Votre compte est désactivé.';
      else if (error?.message) message = error.message;
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  // Loading screen during store initialization
  if (!isInitialized) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#F8FAFC',
        }}
      >
        <CircularProgress sx={{ color: '#0D9488' }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        backgroundColor: '#F8FAFC',
        // Subtle grid pattern background
        backgroundImage: `
          radial-gradient(circle at 20% 50%, rgba(20,184,166,0.04) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(13,148,136,0.05) 0%, transparent 40%)
        `,
      }}
    >
      {/* ── Left panel — branding (desktop only) ────────────────────────── */}
      <Box
        sx={{
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          width: '42%',
          background: 'linear-gradient(160deg, #0F172A 0%, #1E293B 50%, #0F766E 100%)',
          p: 6,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <Box sx={{
          position: 'absolute', top: -80, right: -80,
          width: 300, height: 300, borderRadius: '50%',
          background: 'rgba(20,184,166,0.08)',
        }} />
        <Box sx={{
          position: 'absolute', bottom: -60, left: -60,
          width: 250, height: 250, borderRadius: '50%',
          background: 'rgba(20,184,166,0.06)',
        }} />

        <Box sx={{ position: 'relative', textAlign: 'center', maxWidth: 340 }}>
          {/* Logo */}
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #14B8A6, #0D9488)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
              boxShadow: '0 20px 40px rgba(13,148,136,0.3)',
            }}
          >
            <LogoIcon sx={{ fontSize: 36, color: '#fff' }} />
          </Box>
          <Typography
            sx={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: '#FFFFFF',
              lineHeight: 1.2,
              mb: 1.5,
            }}
          >
            Gestion financière simplifiée
          </Typography>
          <Typography
            sx={{
              fontSize: '1rem',
              color: 'rgba(255,255,255,0.5)',
              lineHeight: 1.6,
            }}
          >
            Suivez vos transactions, productions et finances en un seul endroit.
          </Typography>

          {/* Feature bullets */}
          <Box sx={{ mt: 4, textAlign: 'left' }}>
            {[
              'Tableau de bord en temps réel',
              'Gestion des clients et fournisseurs',
              'Suivi des productions et stocks',
              'Rapports financiers complets',
            ].map((feature) => (
              <Box
                key={feature}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  mb: 1.5,
                }}
              >
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#14B8A6',
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.65)' }}>
                  {feature}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── Right panel — login form ─────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2, sm: 4 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          {/* Mobile logo */}
          <Box
            sx={{
              display: { xs: 'flex', lg: 'none' },
              alignItems: 'center',
              gap: 1.5,
              mb: 4,
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #14B8A6, #0D9488)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LogoIcon sx={{ fontSize: 24, color: '#fff' }} />
            </Box>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>
              Comptabilité
            </Typography>
          </Box>

          {/* Form card */}
          <Paper
            sx={{
              p: { xs: 3, sm: 4 },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 3,
              boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
            }}
          >
            <Box sx={{ mb: 3 }}>
              <Typography variant="h5" fontWeight={700} color="text.primary" gutterBottom>
                Connexion
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Entrez vos identifiants pour accéder à votre espace.
              </Typography>
            </Box>

            {errorMessage && (
              <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setErrorMessage(null)}>
                {errorMessage}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit(onSubmit)}>
              {/* Email */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight={500} color="text.primary" sx={{ mb: 0.75 }}>
                  Adresse email
                </Typography>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      placeholder="votre@email.com"
                      error={!!errors.email}
                      helperText={errors.email?.message}
                      autoComplete="email"
                      autoFocus
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <EmailIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />
              </Box>

              {/* Password */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight={500} color="text.primary" sx={{ mb: 0.75 }}>
                  Mot de passe
                </Typography>
                <Controller
                  name="password"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      error={!!errors.password}
                      helperText={errors.password?.message}
                      autoComplete="current-password"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              onClick={() => setShowPassword(!showPassword)}
                              edge="end"
                              sx={{ color: 'text.secondary' }}
                            >
                              {showPassword
                                ? <VisibilityOff sx={{ fontSize: 18 }} />
                                : <Visibility sx={{ fontSize: 18 }} />
                              }
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />
              </Box>

              {/* Submit */}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{
                  py: 1.25,
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                  boxShadow: '0 4px 14px rgba(13,148,136,0.3)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                    boxShadow: '0 6px 20px rgba(13,148,136,0.4)',
                  },
                  '&:disabled': { opacity: 0.7 },
                }}
              >
                {loading
                  ? <CircularProgress size={22} sx={{ color: '#fff' }} />
                  : 'Se connecter'
                }
              </Button>
            </Box>
          </Paper>

          <Typography
            variant="caption"
            align="center"
            display="block"
            sx={{ mt: 3, color: 'text.secondary' }}
          >
            Accès réservé au personnel autorisé.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default Login;
