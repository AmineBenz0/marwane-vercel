import DateField from '../../utils/DateField';
/**
 * Composant TransactionForm.
 * 
 * Formulaire pour créer et éditer des transactions avec :
 * - Date transaction
 * - Sélection Client OU Fournisseur (radio buttons)
 * - Liste de lignes dynamique (produit + quantité + prix unitaire)
 * - Calcul automatique du montant total
 * - Validation complète
 * 
 * En mode création : crée N transactions indépendantes (une par ligne) via /batch
 * En mode édition : édite UNE transaction existante
 * 
 * @param {boolean} open - Contrôle l'ouverture/fermeture de la modal
 * @param {Function} onClose - Callback appelé lors de la fermeture de la modal
 * @param {Function} onSubmit - Callback appelé lors de la soumission du formulaire (reçoit les données validées)
 * @param {object} initialValues - Valeurs initiales pour le formulaire (pour l'édition)
 * @param {boolean} loading - Indique si la soumission est en cours
 * @param {string} errorMessage - Message d'erreur serveur à afficher
 */

import React, { useState, useEffect } from 'react';
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
  RadioGroup,
  FormControlLabel,
  Radio,
  FormHelperText,
  IconButton,
  Paper,
  Select,
  MenuItem,
  InputLabel,
  Divider,
  Collapse,
  Grid,
} from '@mui/material';
import { 
  Close as CloseIcon, 
  Add as AddIcon, 
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { get, getProduitsParType } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import { getDefaultDueDate } from '../../utils/dueDates';
import { transactionValidationSchema } from './transactionValidation';

const today = () => new Date().toISOString().split('T')[0];

const createPaymentDefaults = (date = today()) => ({
  date,
  montant: '',
  type: 'cash',
  numero_cheque: '',
  banque: '',
  reference: '',
  id_lc: '',
  notes: '',
});

const createLineDefaults = (prefillBatimentId = '', date = today()) => ({
  id_produit: '',
  id_batiment: prefillBatimentId || '',
  quantite: undefined,
  prix_unitaire: undefined,
  ajouter_paiement: false,
  paiements: [createPaymentDefaults(date)],
});

/**
 * Composant interne pour la sélection d'une Lettre de Crédit dans une ligne de transaction.
 * Encapsule la logique de chargement des LC disponibles pour éviter les mises à jour d'état
 * pendant le rendu du composant parent.
 */
const LcPaymentSelector = ({ index, paymentIndex, control, watch, setValue, loading, formatMontant }) => {
  const [lcs, setLcs] = React.useState([]);
  const [fetching, setFetching] = React.useState(false);
  
  const typeEntite = watch('type_entite');
  const clientId = watch('id_client');
  const fournisseurId = watch('id_fournisseur');

  React.useEffect(() => {
    const fetchLcs = async () => {
      setFetching(true);
      try {
        const params = {};
        if (typeEntite === 'client') {
          if (clientId) params.id_client = clientId;
          else {
            setLcs([]);
            setFetching(false);
            return;
          }
        } else {
          if (fournisseurId) params.id_fournisseur = fournisseurId;
          else {
            setLcs([]);
            setFetching(false);
            return;
          }
        }
        const data = await get('/lettres-credit/disponibles', { params });
        setLcs(data || []);
      } catch (err) {
        console.error('Erreur chargement LC:', err);
        setLcs([]);
      } finally {
        setFetching(false);
      }
    };

    fetchLcs();
  }, [typeEntite, clientId, fournisseurId]);

  return (
    <Controller
      name={`lignes.${index}.paiements.${paymentIndex}.id_lc`}
      control={control}
      rules={{ required: 'Veuillez sélectionner une LC' }}
      render={({ field, fieldState: { error } }) => (
        <TextField
          {...field}
          select
          fullWidth
          label="Choisir une Lettre de Crédit"
          error={!!error}
          helperText={error?.message || (lcs.length === 0 && !fetching ? 'Aucune LC disponible pour ce partenaire' : '')}
          disabled={loading || fetching}
          size="small"
          value={field.value || ''}
          onChange={(e) => {
            field.onChange(e.target.value);
            // Auto-remplissage du montant avec le montant de la LC
            const selectedLc = lcs.find(l => l.id_lc === e.target.value);
            if (selectedLc) {
              setValue(`lignes.${index}.paiements.${paymentIndex}.montant`, parseFloat(selectedLc.montant));
            }
          }}
        >
          {lcs.map((l) => (
            <MenuItem key={l.id_lc} value={l.id_lc}>
              {l.numero_reference} ({formatMontant(l.montant)})
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
};

const isEggProduct = (produit) => (
  produit?.nom_produit?.trim().toLowerCase().startsWith('oeufs -')
);

/**
 * Composant TransactionForm.
 */
function TransactionForm({
  open = false,
  onClose,
  onSubmit,
  initialValues = {},
  loading = false,
  errorMessage = null,
  prefillClientId = null,
  prefillFournisseurId = null,
  prefillBatimentId = null,
}) {
  // État pour les données de référence
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [produits, setProduits] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  
  // État pour gérer les paiements par ligne (tableau de booleans)
  // État pour stocker les paiements existants (en mode édition)
  const [, setPaiementsExistants] = useState([]);

  // Initialiser react-hook-form avec le resolver Yup
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setError,
    setFocus,
    clearErrors,
    watch,
    setValue,
  } = useForm({
    resolver: yupResolver(transactionValidationSchema),
    defaultValues: {
      date_transaction: today(),
      date_echeance: getDefaultDueDate(today()),
      type_entite: 'client',
      id_client: '',
      id_fournisseur: '',
      lignes: [createLineDefaults(prefillBatimentId)],
    },
    mode: 'onChange',
  });

  // Observer les valeurs du formulaire pour calculer le total
  const watchedLignes = watch('lignes');
  const watchedTypeEntite = watch('type_entite');


  /**
   * Charge les données de référence (clients, fournisseurs, produits).
   */
  const fetchReferenceData = async (typeEntite = 'client') => {
    setLoadingData(true);
    try {
      const [clientsData, fournisseursData, produitsData, batimentsData] = await Promise.all([
        get('/clients', { params: { est_actif: true, limit: 1000 } }),
        get('/fournisseurs', { params: { est_actif: true, limit: 1000 } }),
        getProduitsParType(typeEntite, { est_actif: true, limit: 1000 }),
        get('/batiments'),
      ]);

      setClients(clientsData || []);
      setFournisseurs(fournisseursData || []);
      setProduits(produitsData || []);
      setBatiments(batimentsData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des données de référence:', err);
    } finally {
      setLoadingData(false);
    }
  };

  /**
   * Charge les paiements existants pour une transaction (en mode édition).
   */
  const fetchPaiementsExistants = async (idTransaction) => {
    try {
      const paiements = await get('/paiements', {
        params: { id_transaction: idTransaction },
      });
      setPaiementsExistants(paiements || []);
      return paiements || [];
    } catch (err) {
      console.error('Erreur lors du chargement des paiements:', err);
      return [];
    }
  };

  // Charger les données de référence au montage et à l'ouverture de la modal
  useEffect(() => {
    if (open) {
      fetchReferenceData(watchedTypeEntite || 'client');
    }
  }, [open, watchedTypeEntite]);

  // Réinitialiser le formulaire lorsque initialValues change (pour l'édition)
  useEffect(() => {
    const loadFormData = async () => {
      if (open) {
        const isEditing = initialValues && initialValues.id_transaction;
        
        if (isEditing) {
          // Mode édition : pré-remplir avec UNE ligne (la transaction à éditer)
          const typeEntite = initialValues.id_client ? 'client' : 'fournisseur';
          
          // Charger les paiements existants
          const paiements = await fetchPaiementsExistants(initialValues.id_transaction);
          
          // Vérifier s'il y a au moins un paiement
          reset({
            date_transaction: initialValues.date_transaction
              ? new Date(initialValues.date_transaction).toISOString().split('T')[0]
              : today(),
            date_echeance: initialValues.date_echeance
              ? new Date(initialValues.date_echeance).toISOString().split('T')[0]
              : getDefaultDueDate(initialValues.date_transaction
                ? new Date(initialValues.date_transaction).toISOString().split('T')[0]
                : today()),
            type_entite: typeEntite,
            id_client: initialValues.id_client || '',
            id_fournisseur: initialValues.id_fournisseur || '',
            lignes: [{
              ...createLineDefaults(initialValues.id_batiment || ''),
              id_produit: initialValues.id_produit || '',
              id_batiment: initialValues.id_batiment || '',
              quantite: initialValues.quantite || undefined,
              prix_unitaire: initialValues.prix_unitaire || undefined,
              ajouter_paiement: paiements.length > 0,
              paiements: paiements.length > 0 ? paiements.map(p => ({
                date: new Date(p.date_paiement).toISOString().split('T')[0],
                montant: parseFloat(p.montant),
                type: p.type_paiement,
                numero_cheque: p.numero_cheque || '',
                banque: p.banque || '',
                reference: p.reference_virement || '',
                id_lc: p.id_lc || '',
                notes: p.notes || '',
                id_paiement: p.id_paiement,
              })) : [createPaymentDefaults()],
            }],
          });
        } else {
          // Mode création : valeurs par défaut ou pré-remplies
          const hasPrefillClient = prefillClientId !== null && prefillClientId !== undefined;
          const hasPrefillFournisseur = prefillFournisseurId !== null && prefillFournisseurId !== undefined;
          
          reset({
            date_transaction: today(),
            date_echeance: getDefaultDueDate(today()),
            type_entite: hasPrefillClient ? 'client' : hasPrefillFournisseur ? 'fournisseur' : 'client',
            id_client: hasPrefillClient ? prefillClientId : '',
            id_fournisseur: hasPrefillFournisseur ? prefillFournisseurId : '',
            lignes: [createLineDefaults(prefillBatimentId)],
          });
        }
        clearErrors();
      }
    };
    
    loadFormData();
  }, [open, initialValues, reset, clearErrors, prefillClientId, prefillFournisseurId, prefillBatimentId]);

  // Nettoyer les erreurs serveur lorsque la modal se ferme
  useEffect(() => {
    if (!open) {
      reset();
      clearErrors();
    }
  }, [open, reset, clearErrors]);

  /**
   * Calcule le montant total à partir des lignes.
   */
  const calculateTotal = () => {
    if (!watchedLignes || watchedLignes.length === 0) return 0;
    
    return watchedLignes.reduce((total, ligne) => {
      const quantite = parseFloat(ligne.quantite) || 0;
      const prix = parseFloat(ligne.prix_unitaire) || 0;
      return total + quantite * prix;
    }, 0);
  };


  /**
   * Gère la soumission du formulaire.
   */
  const handleFormSubmit = async (data) => {
    clearErrors('root');
    try {
      const isEditing = initialValues && initialValues.id_transaction;
      
      if (isEditing) {
        // Mode édition : on édite UNE seule transaction
        const transactionData = {
          date_transaction: data.date_transaction,
          date_echeance: data.date_echeance || null,
          id_client: data.type_entite === 'client' ? data.id_client : null,
          id_fournisseur: data.type_entite === 'fournisseur' ? data.id_fournisseur : null,
          id_produit: parseInt(data.lignes[0].id_produit),
          id_batiment: data.type_entite === 'client' && data.lignes[0].id_batiment ? parseInt(data.lignes[0].id_batiment) : null,
          quantite: parseInt(data.lignes[0].quantite),
          prix_unitaire: parseFloat(data.lignes[0].prix_unitaire),
          est_actif: initialValues.est_actif !== undefined ? initialValues.est_actif : true,
        };
        
        // Passer aussi les données de paiement pour que le parent les gère
        const paiementsData = data.lignes[0].ajouter_paiement ? data.lignes[0].paiements.map(p => ({
          id_paiement: p.id_paiement || null,
          date_paiement: p.date,
          montant: parseFloat(p.montant),
          type_paiement: p.type,
          numero_cheque: p.numero_cheque || null,
          banque: p.banque || null,
          reference_virement: p.reference || null,
          id_lc: p.id_lc || null,
          notes: p.notes || null,
        })) : [];
        
        await onSubmit({ ...transactionData, paiements: paiementsData });
      } else {
        // Mode création : on crée N transactions via l'endpoint batch
        const transactionsData = data.lignes.map((ligne) => ({
          date_transaction: data.date_transaction,
          date_echeance: data.date_echeance || null,
          id_client: data.type_entite === 'client' ? data.id_client : null,
          id_fournisseur: data.type_entite === 'fournisseur' ? data.id_fournisseur : null,
          id_produit: parseInt(ligne.id_produit),
          id_batiment: data.type_entite === 'client' && ligne.id_batiment ? parseInt(ligne.id_batiment) : null,
          quantite: parseInt(ligne.quantite),
          prix_unitaire: parseFloat(ligne.prix_unitaire),
          est_actif: true,
        }));
        
        // Appeler le callback onSubmit avec le tableau de transactions et les données des lignes (pour les paiements)
        await onSubmit({ batch: true, transactions: transactionsData, lignesData: data.lignes });
      }
      
      // Si la soumission réussit, réinitialiser le formulaire
      reset();
    } catch (error) {
      // Gérer les erreurs de validation serveur
      if (error?.data?.detail) {
        const detail = error.data.detail;
        
        if (Array.isArray(detail)) {
          detail.forEach((err) => {
            if (err.loc && err.loc.length > 1) {
              const fieldPath = err.loc.slice(1);
              
              // Gérer les erreurs dans les lignes
              if (fieldPath[0] === 'lignes' && fieldPath.length === 3) {
                const ligneIndex = parseInt(fieldPath[1]);
                const fieldName = fieldPath[2];
                
                setError(`lignes.${ligneIndex}.${fieldName}`, {
                  type: 'server',
                  message: err.msg,
                });
              } else {
                const fieldName = fieldPath[fieldPath.length - 1];
                setError(fieldName, {
                  type: 'server',
                  message: err.msg,
                });
              }
            }
          });
        } else if (typeof detail === 'string') {
          setError('root', {
            type: 'server',
            message: detail,
          });
        }
      } else if (error?.message) {
        setError('root', {
          type: 'server',
          message: error.message,
        });
      }
      
      // Re-throw pour que le composant parent puisse aussi gérer l'erreur
      throw error;
    }
  };

  // RHF skips handleFormSubmit when schema validation fails. Without an
  // invalid-submit callback, errors on conditionally hidden fields look like
  // a dead submit button to the user.
  const findFirstErrorPath = (node, prefix = '') => {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.message === 'string') return prefix;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'ref' || key === 'type' || key === 'types') continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const result = findFirstErrorPath(value, path);
      if (result) return result;
    }
    return null;
  };

  const handleInvalidSubmit = (formErrors) => {
    const firstErrorPath = findFirstErrorPath(formErrors);
    setError('root', {
      type: 'validation',
      message: 'Certains champs sont invalides. Vérifiez les champs signalés en rouge.',
    });
    if (firstErrorPath) setTimeout(() => setFocus(firstErrorPath), 0);
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
   * Ajoute une nouvelle ligne au formulaire.
   */
  const handleAddLine = () => {
    const currentLignes = watch('lignes') || [];
    setValue('lignes', [...currentLignes, createLineDefaults(
      prefillBatimentId,
      watch('date_transaction') || today()
    )], {
      shouldDirty: true,
    });
  };

  /**
   * Supprime une ligne du formulaire.
   */
  const handleRemoveLine = (index) => {
    const currentLignes = watch('lignes') || [];
    if (currentLignes.length > 1) {
      const newLignes = currentLignes.filter((_, i) => i !== index);
      setValue('lignes', newLignes, { shouldDirty: true });
      
    }
  };

  /**
   * Gère le changement du type d'entité (client/fournisseur).
   */
  const handleTypeEntiteChange = async (newType) => {
    setValue('type_entite', newType, { shouldDirty: true });
    setValue('id_client', '', { shouldDirty: true });
    setValue('id_fournisseur', '', { shouldDirty: true });
    if (newType !== 'client') {
      const currentLignes = watch('lignes') || [];
      setValue(
        'lignes',
        currentLignes.map((ligne) => ({ ...ligne, id_batiment: '' })),
        { shouldDirty: true }
      );
    }

    // Recharger les produits pour le type sélectionné
    setLoadingData(true);
    try {
      const produitsData = await getProduitsParType(newType, {
        est_actif: true,
        limit: 1000,
      });
      setProduits(produitsData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des produits:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const montantTotal = calculateTotal();
  const montantPaye = (watchedLignes || []).reduce(
    (sum, ligne) => ligne.ajouter_paiement
      ? sum + (ligne.paiements || []).reduce((ligneSum, paiement) => ligneSum + (parseFloat(paiement.montant) || 0), 0)
      : sum,
    0
  );
  const montantRestant = Math.max(0, montantTotal - montantPaye);
  const isEditing = initialValues && initialValues.id_transaction;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit(handleFormSubmit, handleInvalidSubmit),
        sx: {
          minHeight: '640px',
          maxHeight: '90vh',
          borderRadius: 4,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
        <DialogTitle
          sx={{
            px: { xs: 2, md: 3 },
            py: 2,
            background: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 2,
            }}
          >
            <Box>
              <Typography
                component="div"
                sx={{
                  fontSize: { xs: '1.25rem', md: '1.5rem' },
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                }}
              >
                {isEditing ? 'Modifier la transaction' : 'Nouvelle transaction'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Choisissez le type, ajoutez les produits, puis validez.
              </Typography>
            </Box>
            <IconButton onClick={handleClose} disabled={loading} aria-label="Fermer" sx={{ mt: -0.5, mr: -0.5, borderRadius: 2 }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ backgroundColor: 'background.default', px: { xs: 1.5, sm: 2, md: 3 }, py: { xs: 1.5, sm: 2 } }}>
          {/* Afficher l'erreur serveur générale si présente */}
          {(errorMessage || errors.root) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage || errors.root?.message}
            </Alert>
          )}

          {loadingData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Controller
                name="type_entite"
                control={control}
                render={({ field }) => (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 1.5,
                      mb: 2,
                    }}
                  >
                    {[
                      {
                        value: 'client',
                        title: 'Vente client',
                        subtitle: "Produits vendus, argent qui entre",
                        disabled: prefillFournisseurId !== null && prefillFournisseurId !== undefined,
                        activeColor: 'primary.main',
                        activeBg: 'rgba(13, 148, 136, 0.05)',
                      },
                      {
                        value: 'fournisseur',
                        title: 'Achat fournisseur',
                        subtitle: "Produits achetés, argent qui sort",
                        disabled: prefillClientId !== null && prefillClientId !== undefined,
                        activeColor: 'primary.main',
                        activeBg: 'rgba(13, 148, 136, 0.05)',
                      },
                    ].map((option) => {
                      const isSelected = field.value === option.value;
                      return (
                        <Box
                          key={option.value}
                          role="button"
                          tabIndex={option.disabled || loading ? -1 : 0}
                          onClick={() => {
                            if (!option.disabled && !loading) {
                              handleTypeEntiteChange(option.value);
                            }
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && !option.disabled && !loading) {
                              event.preventDefault();
                              handleTypeEntiteChange(option.value);
                            }
                          }}
                          sx={{
                            p: { xs: 1.25, sm: 1.5 },
                            minHeight: 68,
                            borderRadius: 3,
                            border: '2px solid',
                            borderColor: isSelected ? option.activeColor : 'divider',
                            backgroundColor: isSelected ? option.activeBg : 'background.paper',
                            opacity: option.disabled || loading ? 0.55 : 1,
                            cursor: option.disabled || loading ? 'not-allowed' : 'pointer',
                            transition: 'all 160ms ease',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            '&:hover': {
                              borderColor: option.disabled || loading ? 'divider' : option.activeColor,
                              transform: option.disabled || loading ? 'none' : 'translateY(-1px)',
                            },
                          }}
                        >
                          <Typography sx={{ fontSize: 16, fontWeight: 800 }}>
                            {option.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {option.subtitle}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              />
              {errors.type_entite && (
                <FormHelperText error>{errors.type_entite.message}</FormHelperText>
              )}

              <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, borderRadius: 2.5, bgcolor: 'background.paper' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
                  <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>1</Box>
                  <Typography variant="subtitle1" fontWeight={800}>Informations de la transaction</Typography>
                </Box>
                <Grid container spacing={1.25}>
                  <Grid item xs={12} md={4}>
              {/* Date de transaction */}
              <Controller
                name="date_transaction"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <DateField
                    {...field}
                    onChange={(event) => {
                      const previousDate = field.value;
                      const nextDate = event.target.value;
                      field.onChange(event);
                      const dueDate = watch('date_echeance');
                      if (!dueDate || dueDate === getDefaultDueDate(previousDate || today())) {
                        setValue('date_echeance', getDefaultDueDate(nextDate || today()));
                      }
                    }}
                    fullWidth
                    label="Date de transaction"
                    size="small"
                    error={!!error}
                    helperText={error?.message || ''}
                    required
                    disabled={loading}
                    margin="dense"
                    variant="outlined"
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                )}
              />
                  </Grid>
                  <Grid item xs={12} md={4}>
              {/* Date d'échéance (optionnel) */}
              <Controller
                name="date_echeance"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <DateField
                    {...field}
                    fullWidth
                    label="Date d'échéance du paiement (optionnel)"
                    size="small"
                    error={!!error}
                    helperText={error?.message || 'Date limite pour le paiement'}
                    disabled={loading}
                    margin="dense"
                    variant="outlined"
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                )}
              />
                  </Grid>
                  <Grid item xs={12} md={4}>
              {/* Sélection Client OU Fournisseur */}
              <FormControl component="fieldset" margin="dense" fullWidth error={!!errors.type_entite} sx={{ display: 'none' }}>
                <FormLabel component="legend">Type d'entité</FormLabel>
                <Controller
                  name="type_entite"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      {...field}
                      row
                      onChange={(e) => handleTypeEntiteChange(e.target.value)}
                    >
                      <FormControlLabel
                        value="client"
                        control={<Radio />}
                        label="Client"
                        disabled={loading || (prefillFournisseurId !== null && prefillFournisseurId !== undefined)}
                      />
                      <FormControlLabel
                        value="fournisseur"
                        control={<Radio />}
                        label="Fournisseur"
                        disabled={loading || (prefillClientId !== null && prefillClientId !== undefined)}
                      />
                    </RadioGroup>
                  )}
                />
                {errors.type_entite && (
                  <FormHelperText>{errors.type_entite.message}</FormHelperText>
                )}
              </FormControl>

              {/* Sélection Client */}
              {watchedTypeEntite === 'client' && (
                <Controller
                  name="id_client"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      select
                      fullWidth
                      required
                      label="Client"
                      margin="dense"
                      size="small"
                      error={!!error}
                      helperText={error?.message}
                      disabled={loading || (prefillClientId !== null && prefillClientId !== undefined)}
                      value={field.value || ''}
                    >
                      <MenuItem value="">
                        <em>Sélectionner un client</em>
                      </MenuItem>
                      {clients.map((client) => (
                        <MenuItem key={client.id_client} value={client.id_client}>
                          {client.nom_client}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              )}

              {/* Sélection Fournisseur */}
              {watchedTypeEntite === 'fournisseur' && (
                <Controller
                  name="id_fournisseur"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      select
                      fullWidth
                      required
                      label="Fournisseur"
                      margin="dense"
                      size="small"
                      error={!!error}
                      helperText={error?.message}
                      disabled={loading || (prefillFournisseurId !== null && prefillFournisseurId !== undefined)}
                      value={field.value || ''}
                    >
                      <MenuItem value="">
                        <em>Sélectionner un fournisseur</em>
                      </MenuItem>
                      {fournisseurs.map((fournisseur) => (
                        <MenuItem
                          key={fournisseur.id_fournisseur}
                          value={fournisseur.id_fournisseur}
                        >
                          {fournisseur.nom_fournisseur}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              )}

                  </Grid>
                </Grid>
              </Paper>

              {/* Produits et paiements */}
              <Paper variant="outlined" sx={{ mb: 2, p: { xs: 1.25, sm: 2 }, borderRadius: 2.5, backgroundColor: 'background.paper' }}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'stretch', sm: 'center' },
                    gap: 1,
                    mb: 1.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>2</Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={800}>Produits</Typography>
                      <Typography variant="caption" color="text.secondary">Ajoutez les produits et leurs quantités.</Typography>
                    </Box>
                  </Box>
                  {!isEditing && (
                    <Button
                      variant="outlined"
                      size="small"
                      fullWidth={false}
                      sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}
                      startIcon={<AddIcon />}
                      onClick={handleAddLine}
                      disabled={loading}
                    >
                      Ajouter un produit
                    </Button>
                  )}
                </Box>

                {errors.lignes && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errors.lignes.message}
                  </Alert>
                )}

                {/* Produits de la transaction */}
                <Box sx={{ display: 'grid', gap: 1.5 }}>
                  {watchedLignes?.map((ligne, index) => {
                        const ligneTotal =
                          (parseFloat(ligne.quantite) || 0) *
                          (parseFloat(ligne.prix_unitaire) || 0);
                  const selectedProduit = produits.find(p => Number(p.id_produit) === Number(ligne.id_produit));
                  const shouldShowBatimentSource = watchedTypeEntite === 'client' && isEggProduct(selectedProduit);
                  
                        return (
                    <Paper
                      key={index}
                      variant="outlined"
                      sx={{ p: { xs: 1.25, sm: 1.75 }, borderRadius: 2.5, bgcolor: 'background.paper' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25, gap: 1 }}>
                        <Typography variant="subtitle2" fontWeight={800}>Produit {index + 1}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Box sx={{ px: 1.25, py: 0.5, bgcolor: 'rgba(13, 148, 136, 0.08)', color: 'primary.main', borderRadius: 1.5 }}>
                            <Typography variant="caption" fontWeight={800} sx={{ whiteSpace: 'nowrap' }}>Total de la ligne : {ligneTotal.toFixed(2)} MAD</Typography>
                          </Box>
                          {!isEditing && watchedLignes.length > 1 && (
                            <IconButton size="small" color="error" onClick={() => handleRemoveLine(index)} disabled={loading} aria-label={`Supprimer le produit ${index + 1}`}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      </Box>
                      <Grid container spacing={1.25}>
                        {/* Produit */}
                        <Grid item xs={12} md={4}>
                              <Controller
                                name={`lignes.${index}.id_produit`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                <FormControl fullWidth error={!!error} disabled={loading}>
                                  <InputLabel>{watchedTypeEntite === 'client' ? 'Produit vendu *' : 'Produit acheté *'}</InputLabel>
                                    <Select
                                      {...field}
                                      size="small"
                                      value={field.value || ''}
                                    label={watchedTypeEntite === 'client' ? 'Oeufs vendus *' : 'Produit acheté *'}
                                      disabled={loading}
                                      onChange={(event) => {
                                        field.onChange(event);
                                        const selected = produits.find(p => Number(p.id_produit) === Number(event.target.value));
                                        if (!isEggProduct(selected)) {
                                          setValue(`lignes.${index}.id_batiment`, '');
                                        }
                                      }}
                                    >
                                      <MenuItem value="">
                                      <em>{watchedTypeEntite === 'client' ? 'Sélectionner le produit vendu' : 'Sélectionner le produit acheté'}</em>
                                      </MenuItem>
                                      {produits.map((produit) => (
                                        <MenuItem
                                          key={produit.id_produit}
                                          value={produit.id_produit}
                                        >
                                          {produit.nom_produit}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                    {error && (
                                      <FormHelperText error>
                                        {error.message}
                                      </FormHelperText>
                                    )}
                                  </FormControl>
                                )}
                              />
                          </Grid>

                          {/* Quantité */}
                          <Grid item xs={12} sm={6} md={4}>
                              <Controller
                                name={`lignes.${index}.quantite`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                  <TextField
                                    {...field}
                                    fullWidth
                                    label={shouldShowBatimentSource ? "Quantite vendue (oeufs) *" : "Quantite *"}
                                    type="number"
                                    inputProps={{ min: 1, step: 1 }}
                                    value={field.value ?? ''}
                                    error={!!error}
                                    helperText={error?.message || (shouldShowBatimentSource ? "Pour garder le stock juste, entrez le nombre d'oeufs." : '')}
                                    size="small"
                                    disabled={loading}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value === '' ? undefined : value);
                                      // Mettre à jour le montant du paiement si paiement activé
                                      if (ligne.ajouter_paiement) {
                                        const newTotal = (parseFloat(value) || 0) * (parseFloat(ligne.prix_unitaire) || 0);
                                        setValue(`lignes.${index}.paiements.0.montant`, newTotal);
                                      }
                                    }}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                          </Grid>

                          {/* Prix unitaire */}
                          <Grid item xs={12} sm={6} md={4}>
                              <Controller
                                name={`lignes.${index}.prix_unitaire`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                  <TextField
                                    {...field}
                                    fullWidth
                                    label="Prix unitaire (MAD) *"
                                    type="number"
                                    inputProps={{ min: 0, step: 0.01 }}
                                    value={field.value ?? ''}
                                    error={!!error}
                                    helperText={error?.message || ''}
                                    size="small"
                                    disabled={loading}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value === '' ? undefined : value);
                                      // Mettre à jour le montant du paiement si paiement activé
                                      if (ligne.ajouter_paiement) {
                                        const newTotal = (parseFloat(ligne.quantite) || 0) * (parseFloat(value) || 0);
                                        setValue(`lignes.${index}.paiements.0.montant`, newTotal);
                                      }
                                    }}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                          </Grid>

                          {shouldShowBatimentSource && (
                            <Grid item xs={12}>
                              <Controller
                                name={`lignes.${index}.id_batiment`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                  <TextField
                                    {...field}
                                    select
                                    fullWidth
                                    label="Batiment source pour le stock"
                                    size="small"
                                    value={field.value || ''}
                                    error={!!error}
                                    helperText={error?.message || "Ce choix permet de retirer les oeufs vendus du bon batiment."}
                                    disabled={loading}
                                  >
                                    <MenuItem value="">
                                      <em>Choisir le batiment</em>
                                    </MenuItem>
                                    {batiments.map((batiment) => (
                                      <MenuItem key={batiment.id_batiment} value={batiment.id_batiment}>
                                        {batiment.nom}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                )}
                              />
                            </Grid>
                          )}

                          <Grid item xs={12}>
                            <Divider />
                          </Grid>

                          {/* Paiement */}
                          <Grid item xs={12}>
                            <Controller
                              name={`lignes.${index}.ajouter_paiement`}
                              control={control}
                              render={({ field }) => (
                                <RadioGroup
                                  row
                                  value={field.value ? 'now' : 'later'}
                                  onChange={(event) => {
                                    const shouldPayNow = event.target.value === 'now';
                                    field.onChange(shouldPayNow);
                                    if (shouldPayNow && ligneTotal > 0) {
                                      const existingPaiements = watch(`lignes.${index}.paiements`);
                                      if (!existingPaiements || existingPaiements.length === 0) {
                                        setValue(`lignes.${index}.paiements`, [
                                          createPaymentDefaults(watch('date_transaction') || today()),
                                        ]);
                                        setValue(`lignes.${index}.paiements.0.montant`, ligneTotal);
                                      } else {
                                        setValue(`lignes.${index}.paiements.0.montant`, ligneTotal);
                                        setValue(
                                          `lignes.${index}.paiements.0.date`,
                                          watch('date_transaction') || today()
                                        );
                                      }
                                    }
                                  }}
                                  aria-label="Enregistrer un paiement maintenant"
                                >
                                  <FormControlLabel
                                    value="now"
                                    control={<Radio size="small" />}
                                    label="Enregistrer un paiement maintenant"
                                    disabled={loading}
                                  />
                                  <FormControlLabel
                                    value="later"
                                    control={<Radio size="small" />}
                                    label="À régler plus tard"
                                    disabled={loading}
                                  />
                                </RadioGroup>
                              )}
                            />
                          </Grid>

                          {/* Champs de paiement conditionnels */}
                            <Collapse in={ligne.ajouter_paiement}>
                              <Box sx={{ mt: 1, p: { xs: 1, sm: 1.5 }, bgcolor: 'grey.50', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                  <Typography variant="subtitle2" color="text.primary">
                                    Paiement pour ce produit
                                  </Typography>
                                  <Button 
                                    size="small" 
                                    startIcon={<AddIcon />} 
                                    onClick={() => {
                                      const currentPaiements = watch(`lignes.${index}.paiements`) || [];
                                      setValue(`lignes.${index}.paiements`, [...currentPaiements, {
                                        date: watch('date_transaction') || new Date().toISOString().split('T')[0],
                                        montant: '',
                                        type: 'cash',
                                        numero_cheque: '',
                                        banque: '',
                                        reference: '',
                                        id_lc: '',
                                        notes: '',
                                      }]);
                                    }}
                                  >
                                    Ajouter
                                  </Button>
                                </Box>
                                
                                {ligne.paiements?.map((paiement, pIndex) => (
                                  <Box key={pIndex} sx={{ mb: 2, pb: 2, borderBottom: pIndex < ligne.paiements.length - 1 ? '1px dashed #ccc' : 'none' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                      <Typography variant="caption" fontWeight="bold">Paiement #{pIndex + 1}</Typography>
                                      {ligne.paiements.length > 1 && (
                                        <IconButton size="small" color="error" onClick={() => {
                                          const newPaiements = ligne.paiements.filter((_, i) => i !== pIndex);
                                          setValue(`lignes.${index}.paiements`, newPaiements);
                                        }}>
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      )}
                                    </Box>
                                    <Grid container spacing={2}>
                                      {/* Date du paiement */}
                                      <Grid item xs={12} sm={6} md={4}>
                                        <Controller
                                          name={`lignes.${index}.paiements.${pIndex}.date`}
                                          control={control}
                                          render={({ field, fieldState: { error } }) => (
                                            <DateField
                                              {...field}
                                              fullWidth
                                              label="Date du paiement"

                                              error={!!error}
                                              helperText={error?.message}
                                              disabled={loading}
                                              InputLabelProps={{ shrink: true }}
                                              size="small"
                                            />
                                          )}
                                        />
                                      </Grid>

                                      {/* Montant */}
                                      <Grid item xs={12} sm={6} md={4}>
                                        <Controller
                                          name={`lignes.${index}.paiements.${pIndex}.montant`}
                                          control={control}
                                          render={({ field, fieldState: { error } }) => (
                                            <TextField
                                              {...field}
                                              fullWidth
                                              label="Montant (MAD)"
                                              type="number"
                                              error={!!error}
                                              helperText={error?.message}
                                              disabled={loading}
                                              inputProps={{ step: '0.01', min: '0.01' }}
                                              InputLabelProps={{ shrink: true }}
                                              size="small"
                                            />
                                          )}
                                        />
                                      </Grid>

                                      {/* Type de paiement */}
                                      <Grid item xs={12} sm={6} md={4}>
                                        <Controller
                                          name={`lignes.${index}.paiements.${pIndex}.type`}
                                          control={control}
                                          render={({ field, fieldState: { error } }) => (
                                            <TextField
                                              {...field}
                                              select
                                              fullWidth
                                              label="Mode de paiement"
                                              error={!!error}
                                              helperText={error?.message}
                                              disabled={loading}
                                              size="small"
                                            >
                                              <MenuItem value="cash">💵 Espèces</MenuItem>
                                              <MenuItem value="cheque">💳 Chèque</MenuItem>
                                              <MenuItem value="virement">🏦 Virement</MenuItem>
                                              <MenuItem value="carte">💳 Carte bancaire</MenuItem>
                                              <MenuItem value="compensation">↔️ Compensation</MenuItem>
                                              <MenuItem value="lc">📜 Lettre de Crédit</MenuItem>
                                              <MenuItem value="autre">📄 Autre</MenuItem>
                                            </TextField>
                                          )}
                                        />
                                      </Grid>

                                      {/* Champs conditionnels */}
                                      {paiement.type === 'cheque' && (
                                        <>
                                          <Grid item xs={12} sm={6}>
                                            <Controller
                                              name={`lignes.${index}.paiements.${pIndex}.numero_cheque`}
                                              control={control}
                                              render={({ field }) => (
                                                <TextField {...field} fullWidth label="N° Chèque" disabled={loading} size="small" />
                                              )}
                                            />
                                          </Grid>
                                          <Grid item xs={12} sm={6}>
                                            <Controller
                                              name={`lignes.${index}.paiements.${pIndex}.banque`}
                                              control={control}
                                              render={({ field }) => (
                                                <TextField {...field} fullWidth label="Banque" disabled={loading} size="small" />
                                              )}
                                            />
                                          </Grid>
                                        </>
                                      )}

                                      {paiement.type === 'virement' && (
                                        <Grid item xs={12}>
                                          <Controller
                                            name={`lignes.${index}.paiements.${pIndex}.reference`}
                                            control={control}
                                            render={({ field }) => (
                                              <TextField {...field} fullWidth label="Référence" disabled={loading} size="small" />
                                            )}
                                          />
                                        </Grid>
                                      )}

                                      {paiement.type === 'lc' && (
                                        <Grid item xs={12}>
                                          <LcPaymentSelector
                                            index={index}
                                            paymentIndex={pIndex}
                                            control={control}
                                            watch={watch}
                                            setValue={setValue}
                                            loading={loading}
                                            formatMontant={formatMontant}
                                          />
                                        </Grid>
                                      )}
                                    </Grid>
                                  </Box>
                                ))}
                                
                                {ligne.ajouter_paiement && (
                                  <Box sx={{ mt: 1, p: 1, borderTop: '1px solid #ddd' }}>
                                    <Typography variant="caption">
                                      Reste à régler : <strong>{Math.max(0, ligneTotal - ligne.paiements.reduce((acc, p) => acc + (parseFloat(p.montant) || 0), 0)).toFixed(2)} MAD</strong>
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            </Collapse>
                          </Grid>
                    </Paper>
                        );
                  })}
                </Box>
              </Paper>
            </Box>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            px: { xs: 1.5, sm: 3 },
            py: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: { xs: 1, sm: 3 },
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">Total</Typography>
              <Typography variant="subtitle1" fontWeight={800}>{montantTotal.toFixed(2)} MAD</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Déjà payé</Typography>
              <Typography variant="subtitle1" fontWeight={700}>{montantPaye.toFixed(2)} MAD</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Reste à payer</Typography>
              <Typography variant="subtitle1" fontWeight={800} color="primary.main">{montantRestant.toFixed(2)} MAD</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
            <Button
              onClick={handleClose}
              disabled={loading}
              color="inherit"
              sx={{ flex: { xs: 1, sm: 'initial' } }}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={loading || !isDirty}
              startIcon={loading ? <CircularProgress size={16} /> : null}
              sx={{ flex: { xs: 1, sm: 'initial' } }}
            >
              {loading
                ? 'Enregistrement...'
                : isEditing
                  ? 'Enregistrer les modifications'
                  : watchedTypeEntite === 'client'
                    ? 'Enregistrer la vente'
                    : "Enregistrer l’achat"}
            </Button>
          </Box>
        </DialogActions>
    </Dialog>
  );
}

export default TransactionForm;
