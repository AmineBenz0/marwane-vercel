/**
 * Page de connexion (publique).
 * 
 * Formulaire de connexion avec :
 * - Validation avec react-hook-form et yup
 * - Gestion des erreurs (affichage des messages)
 * - Appel API pour la connexion
 * - Redirection vers le dashboard après connexion réussie
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Email as EmailIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import useAuthStore from '../store/authStore';

/**
 * Schéma de validation Yup pour le formulaire de connexion.
 */
const loginSchema = yup.object().shape({
  email: yup
    .string()
    .email('Veuillez entrer un email valide')
    .required('L\'email est requis'),
  password: yup
    .string()
    .required('Le mot de passe est requis'),
});

/**
 * Composant Login.
 */
function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();
  
  // État pour le chargement et les erreurs
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Si l'utilisateur est déjà authentifié, rediriger vers le dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Initialiser react-hook-form avec le resolver Yup
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onChange', // Validation en temps réel
  });

  /**
   * Gère la soumission du formulaire.
   */
  const onSubmit = async (data) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // Appeler la fonction login du store
      await login(data.email, data.password);
      
      // Si la connexion réussit, rediriger vers le dashboard
      navigate('/dashboard', { replace: true });
    } catch (error) {
      // Gérer les erreurs de connexion
      let message = 'Une erreur est survenue lors de la connexion';
      
      if (error?.message) {
        message = error.message;
      } else if (error?.status === 401) {
        message = 'Email ou mot de passe incorrect';
      } else if (error?.status === 403) {
        message = 'Compte utilisateur désactivé';
      } else if (error?.status === null) {
        // Erreur réseau
        message = error.message || 'Impossible de contacter le serveur. Vérifiez votre connexion.';
      }
      
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Bascule l'affichage du mot de passe.
   */
  const handleTogglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: (theme) =>
          theme.palette.mode === 'light'
            ? theme.palette.grey[100]
            : theme.palette.grey[900],
        padding: 2,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Titre */}
          <Typography component="h1" variant="h4" gutterBottom>
            Connexion
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Entrez vos identifiants pour accéder à l'application
          </Typography>

          {/* Formulaire */}
          <Box
            component="form"
            onSubmit={handleSubmit(onSubmit)}
            sx={{ width: '100%', mt: 1 }}
          >
            {/* Message d'erreur */}
            {errorMessage && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errorMessage}
              </Alert>
            )}

            {/* Champ Email */}
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  margin="normal"
                  required
                  fullWidth
                  id="email"
                  label="Email"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />

            {/* Champ Mot de passe */}
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  margin="normal"
                  required
                  fullWidth
                  name="password"
                  label="Mot de passe"
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  autoComplete="current-password"
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockIcon color="action" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={handleTogglePasswordVisibility}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />

            {/* Bouton de soumission */}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Se connecter'
              )}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export default Login;

