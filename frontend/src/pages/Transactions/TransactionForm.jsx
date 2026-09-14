/**
 * Composant TransactionForm.
 * 
 * Formulaire pour crÃ©er et Ã©diter des transactions avec :
 * - Date transaction
 * - SÃ©lection Client OU Fournisseur (radio buttons)
 * - Liste de lignes dynamique (produit + quantitÃ© + prix unitaire)
 * - Calcul automatique du montant total
 * - Validation complÃ¨te
 * 
 * En mode crÃ©ation : crÃ©e N transactions indÃ©pendantes (une par ligne) via /batch
 * En mode Ã©dition : Ã©dite UNE transaction existante
 * 
 * @param {boolean} open - ContrÃ´le l'ouverture/fermeture de la modal
 * @param {Function} onClose - Callback appelÃ© lors de la fermeture de la modal
 * @param {Function} onSubmit - Callback appelÃ© lors de la soumission du formulaire (reÃ§oit les donnÃ©es validÃ©es)
 * @param {object} initialValues - Valeurs initiales pour le formulaire (pour l'Ã©dition)
 * @param {boolean} loading - Indique si la soumission est en cours
 * @param {string} errorMessage - Message d'erreur serveur Ã  afficher
 */

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
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
  Checkbox,
  Divider,
  Collapse,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from '@mui/material';
import { 
  Close as CloseIcon, 
  Add as AddIcon, 
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import { get, getProduitsParType } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';

/**
 * SchÃ©ma de validation Yup pour une ligne de transaction.
 */
const ligneValidationSchema = yup.object().shape({
  id_produit: yup
    .number()
    .required('Le produit est requis')
    .positive('Le produit est requis'),
  id_batiment: yup
    .number()
    .nullable()
    .transform((value, originalValue) => {
      if (originalValue === '' || originalValue === null || originalValue === undefined) {
        return null;
      }
      const num = Number(originalValue);
      return isNaN(num) ? null : num;
    }),
  quantite: yup
    .number()
    .typeError('La quantitÃ© doit Ãªtre un nombre')
    .required('La quantitÃ© est requise')
    .positive('La quantitÃ© doit Ãªtre supÃ©rieure Ã  0')
    .integer('La quantitÃ© doit Ãªtre un nombre entier')
    .transform((value, originalValue) => {
      if (originalValue === '' || originalValue === null || originalValue === undefined) {
        return undefined;
      }
      const num = Number(originalValue);
      return isNaN(num) ? undefined : num;
    }),
  prix_unitaire: yup
    .number()
    .typeError('Le prix unitaire doit Ãªtre un nombre')
    .required('Le prix unitaire est requis')
    .positive('Le prix unitaire doit Ãªtre supÃ©rieur Ã  0')
    .transform((value, originalValue) => {
      if (originalValue === '' || originalValue === null || originalValue === undefined) {
        return undefined;
      }
      const num = Number(originalValue);
      return isNaN(num) ? undefined : num;
    }),
  // Un paiement individuel
  paiements: yup.array().of(
    yup.object().shape({
      date: yup.string().required('La date est requise'),
      montant: yup.number().required('Le montant est requis').positive('Le montant doit Ãªtre positif'),
      type: yup.string().required('Le type est requis'),
      numero_cheque: yup.string().nullable(),
      banque: yup.string().nullable(),
      reference: yup.string().nullable(),
      id_lc: yup.number().nullable(),
      notes: yup.string().nullable(),
      id_paiement: yup.number().nullable(),
    })
  ).min(0),
  ajouter_paiement: yup.boolean(),
});

/**
 * Composant interne pour la sÃ©lection d'une Lettre de CrÃ©dit dans une ligne de transaction.
 * Encapsule la logique de chargement des LC disponibles pour Ã©viter les mises Ã  jour d'Ã©tat
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
      rules={{ required: 'Veuillez sÃ©lectionner une LC' }}
      render={({ field, fieldState: { error } }) => (
        <TextField
          {...field}
          select
          fullWidth
          label="Choisir une Lettre de CrÃ©dit"
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

/**
 * SchÃ©ma de validation Yup pour le formulaire transaction.
 */
const transactionValidationSchema = yup.object().shape({
  date_transaction: yup
    .string()
    .required('La date de transaction est requise')
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format YYYY-MM-DD'),
  date_echeance: yup
    .string()
    .nullable()
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format YYYY-MM-DD')
    .test('date-apres-transaction', 'La date d\'échéance doit être après la date de transaction', function(value) {
      if (!value) return true; // Optionnel
      const dateTransaction = this.parent.date_transaction;
      if (!dateTransaction) return true;
      return new Date(value) >= new Date(dateTransaction);
    }),
  type_entite: yup
    .string()
    .required('Vous devez sÃ©lectionner un client ou un fournisseur')
    .oneOf(['client', 'fournisseur'], 'Vous devez sÃ©lectionner un client ou un fournisseur'),
  id_client: yup
    .number()
    .nullable()
    .when('type_entite', {
      is: 'client',
      then: (schema) => schema.required('Le client est requis').positive('Le client est requis'),
      otherwise: (schema) => schema.nullable(),
    }),
  id_fournisseur: yup
    .number()
    .nullable()
    .when('type_entite', {
      is: 'fournisseur',
      then: (schema) => schema.required('Le fournisseur est requis').positive('Le fournisseur est requis'),
      otherwise: (schema) => schema.nullable(),
    }),
  lignes: yup
    .array()
    .of(ligneValidationSchema)
    .min(1, 'Au moins une ligne est requise')
    .required('Au moins une ligne est requise'),
});

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
  // Ã‰tat pour les donnÃ©es de rÃ©fÃ©rence
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [produits, setProduits] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  
  // Ã‰tat pour gÃ©rer les paiements par ligne (tableau de booleans)
  // Ã‰tat pour gÃ©rer l'expansion des accordions (premiÃ¨re ligne expanded par dÃ©faut)
  const [expandedAccordion, setExpandedAccordion] = useState(0);

  // Ã‰tat pour stocker les paiements existants (en mode Ã©dition)
  const [, setPaiementsExistants] = useState([]);

  // Initialiser react-hook-form avec le resolver Yup
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setError,
    clearErrors,
    watch,
    setValue,
  } = useForm({
    resolver: yupResolver(transactionValidationSchema),
    defaultValues: {
      date_transaction: new Date().toISOString().split('T')[0],
      date_echeance: '',
      type_entite: 'client',
      id_client: '',
      id_fournisseur: '',
      lignes: [{ 
        id_produit: '', 
        id_batiment: prefillBatimentId || '',
        quantite: undefined, 
        prix_unitaire: undefined,
        ajouter_paiement: false,
        paiements: [{
          date: new Date().toISOString().split('T')[0],
          montant: '',
          type: 'cash',
          numero_cheque: '',
          banque: '',
          reference: '',
          id_lc: '',
          notes: '',
        }],
      }],
    },
    mode: 'onChange',
  });

  // Observer les valeurs du formulaire pour calculer le total
  const watchedLignes = watch('lignes');
  const watchedTypeEntite = watch('type_entite');


  /**
   * Charge les donnÃ©es de rÃ©fÃ©rence (clients, fournisseurs, produits).
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
      console.error('Erreur lors du chargement des donnÃ©es de rÃ©fÃ©rence:', err);
    } finally {
      setLoadingData(false);
    }
  };

  /**
   * Charge les paiements existants pour une transaction (en mode Ã©dition).
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

  // Charger les donnÃ©es de rÃ©fÃ©rence au montage et Ã  l'ouverture de la modal
  useEffect(() => {
    if (open) {
      fetchReferenceData(watchedTypeEntite || 'client');
    }
  }, [open, watchedTypeEntite]);

  // RÃ©initialiser le formulaire lorsque initialValues change (pour l'Ã©dition)
  useEffect(() => {
    const loadFormData = async () => {
      if (open) {
        const isEditing = initialValues && initialValues.id_transaction;
        
        if (isEditing) {
          // Mode Ã©dition : prÃ©-remplir avec UNE ligne (la transaction Ã  Ã©diter)
          const typeEntite = initialValues.id_client ? 'client' : 'fournisseur';
          
          // Charger les paiements existants
          const paiements = await fetchPaiementsExistants(initialValues.id_transaction);
          
          // VÃ©rifier s'il y a au moins un paiement
          reset({
            date_transaction: initialValues.date_transaction
              ? new Date(initialValues.date_transaction).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
            date_echeance: initialValues.date_echeance
              ? new Date(initialValues.date_echeance).toISOString().split('T')[0]
              : '',
            type_entite: typeEntite,
            id_client: initialValues.id_client || '',
            id_fournisseur: initialValues.id_fournisseur || '',
            lignes: [{
              id_produit: initialValues.id_produit || '',
              id_batiment: initialValues.id_batiment || '',
              quantite: initialValues.quantite || undefined,
              prix_unitaire: initialValues.prix_unitaire || undefined,
              ajouter_paiement: paiements.length > 0,
              paiements: paiements.map(p => ({
                date: new Date(p.date_paiement).toISOString().split('T')[0],
                montant: parseFloat(p.montant),
                type: p.type_paiement,
                numero_cheque: p.numero_cheque || '',
                banque: p.banque || '',
                reference: p.reference_virement || '',
                id_lc: p.id_lc || '',
                notes: p.notes || '',
                id_paiement: p.id_paiement,
              })),
            }],
          });
        } else {
          // Mode crÃ©ation : valeurs par dÃ©faut ou prÃ©-remplies
          const hasPrefillClient = prefillClientId !== null && prefillClientId !== undefined;
          const hasPrefillFournisseur = prefillFournisseurId !== null && prefillFournisseurId !== undefined;
          
          reset({
            date_transaction: new Date().toISOString().split('T')[0],
            date_echeance: '',
            type_entite: hasPrefillClient ? 'client' : hasPrefillFournisseur ? 'fournisseur' : 'client',
            id_client: hasPrefillClient ? prefillClientId : '',
            id_fournisseur: hasPrefillFournisseur ? prefillFournisseurId : '',
            lignes: [{ 
              id_produit: '', 
              id_batiment: prefillBatimentId || '',
              quantite: undefined, 
              prix_unitaire: undefined,
              ajouter_paiement: false,
              paiement_date: new Date().toISOString().split('T')[0],
              paiement_montant: '',
              paiement_type: 'cash',
              paiement_numero_cheque: '',
              paiement_banque: '',
              paiement_reference: '',
              paiement_id_lc: '',
              paiement_notes: '',
            }],
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
   * Calcule le montant total Ã  partir des lignes.
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
   * GÃ¨re la soumission du formulaire.
   */
  const handleFormSubmit = async (data) => {
    try {
      const isEditing = initialValues && initialValues.id_transaction;
      
      if (isEditing) {
        // Mode Ã©dition : on Ã©dite UNE seule transaction
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
        
        // Passer aussi les donnÃ©es de paiement pour que le parent les gÃ¨re
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
        // Mode crÃ©ation : on crÃ©e N transactions via l'endpoint batch
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
        
        // Appeler le callback onSubmit avec le tableau de transactions et les donnÃ©es des lignes (pour les paiements)
        await onSubmit({ batch: true, transactions: transactionsData, lignesData: data.lignes });
      }
      
      // Si la soumission rÃ©ussit, rÃ©initialiser le formulaire
      reset();
    } catch (error) {
      // GÃ©rer les erreurs de validation serveur
      if (error?.data?.detail) {
        const detail = error.data.detail;
        
        if (Array.isArray(detail)) {
          detail.forEach((err) => {
            if (err.loc && err.loc.length > 1) {
              const fieldPath = err.loc.slice(1);
              
              // GÃ©rer les erreurs dans les lignes
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
      
      // Re-throw pour que le composant parent puisse aussi gÃ©rer l'erreur
      throw error;
    }
  };

  /**
   * GÃ¨re la fermeture de la modal.
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
    setValue('lignes', [...currentLignes, { 
      id_produit: '', 
      id_batiment: prefillBatimentId || '',
      quantite: undefined, 
      prix_unitaire: undefined,
      ajouter_paiement: false,
      paiement_date: watch('date_transaction') || new Date().toISOString().split('T')[0],
      paiement_montant: '',
      paiement_type: 'cash',
      paiement_numero_cheque: '',
      paiement_banque: '',
      paiement_reference: '',
      paiement_id_lc: '',
      paiement_notes: '',
    }], {
      shouldDirty: true,
    });
    // Expand le nouvel accordion
    setExpandedAccordion(currentLignes.length);
  };

  /**
   * Supprime une ligne du formulaire.
   */
  const handleRemoveLine = (index) => {
    const currentLignes = watch('lignes') || [];
    if (currentLignes.length > 1) {
      const newLignes = currentLignes.filter((_, i) => i !== index);
      setValue('lignes', newLignes, { shouldDirty: true });
      
      // Ajuster l'accordion expanded si nÃ©cessaire
      if (expandedAccordion === index) {
        setExpandedAccordion(0); // Expand la premiÃ¨re ligne
      } else if (expandedAccordion > index) {
        setExpandedAccordion(expandedAccordion - 1); // DÃ©caler l'index
      }
    }
  };

  /**
   * GÃ¨re le changement du type d'entitÃ© (client/fournisseur).
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

    // Recharger les produits pour le type sÃ©lectionnÃ©
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
  const isEditing = initialValues && initialValues.id_transaction;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit(handleFormSubmit),
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
            <Typography variant="h6" component="div" sx={{ display: 'none' }}>
              {isEditing ? 'Modifier la transaction' : 'CrÃ©er une nouvelle transaction'}
            </Typography>
            <Button
              onClick={handleClose}
              disabled={loading}
              sx={{ minWidth: 'auto', p: 1, borderRadius: 2 }}
            >
              <CloseIcon />
            </Button>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ backgroundColor: '#f7f3ea', px: { xs: 2, md: 3 }, py: 2.5 }}>
          {/* Afficher l'erreur serveur gÃ©nÃ©rale si prÃ©sente */}
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
              <Paper
                variant="outlined"
                sx={{
                  p: { xs: 2, md: 2.5 },
                  mb: 2.5,
                  borderRadius: 3,
                  backgroundColor: 'background.paper',
                }}
              >
                <Typography sx={{ fontWeight: 900, mb: 0.5 }}>
                  1. Choisir le type
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Vente ou achat: le choix détermine automatiquement les produits proposés.
                </Typography>
              </Paper>
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
                        subtitle: "Oeufs vendus, argent qui entre",
                        disabled: prefillFournisseurId !== null && prefillFournisseurId !== undefined,
                        activeColor: 'success.main',
                        activeBg: 'rgba(46, 125, 50, 0.08)',
                      },
                      {
                        value: 'fournisseur',
                        title: 'Achat fournisseur',
                        subtitle: "Produits achetés, argent qui sort",
                        disabled: prefillClientId !== null && prefillClientId !== undefined,
                        activeColor: 'warning.dark',
                        activeBg: 'rgba(237, 108, 2, 0.08)',
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
                            p: { xs: 2, md: 2.5 },
                            minHeight: 112,
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
                          <Typography sx={{ fontSize: { xs: 20, md: 23 }, fontWeight: 900 }}>
                            {option.title}
                          </Typography>
                          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
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

              {/* Date de transaction */}
              <Controller
                name="date_transaction"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Date de transaction"
                    type="date"
                    error={!!error}
                    helperText={error?.message || ''}
                    required
                    disabled={loading}
                    margin="normal"
                    variant="outlined"
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                )}
              />

              {/* Date d'échéance (optionnel) */}
              <Controller
                name="date_echeance"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Date d'échéance du paiement (optionnel)"
                    type="date"
                    error={!!error}
                    helperText={error?.message || 'Date limite pour le paiement'}
                    disabled={loading}
                    margin="normal"
                    variant="outlined"
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                )}
              />

              {/* SÃ©lection Client OU Fournisseur */}
              <FormControl component="fieldset" margin="normal" fullWidth error={!!errors.type_entite} sx={{ display: 'none' }}>
                <FormLabel component="legend">Type d'entitÃ©</FormLabel>
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

              {/* SÃ©lection Client */}
              {watchedTypeEntite === 'client' && (
                <Controller
                  name="id_client"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      fullWidth
                      margin="normal"
                      error={!!error}
                      disabled={loading || (prefillClientId !== null && prefillClientId !== undefined)}
                    >
                      <InputLabel required>Client</InputLabel>
                      <Select
                        {...field}
                        label="Client"
                        value={field.value || ''}
                      >
                        <MenuItem value="">
                          <em>SÃ©lectionner un client</em>
                        </MenuItem>
                        {clients.map((client) => (
                          <MenuItem key={client.id_client} value={client.id_client}>
                            {client.nom_client}
                          </MenuItem>
                        ))}
                      </Select>
                      {error && <FormHelperText>{error.message}</FormHelperText>}
                    </FormControl>
                  )}
                />
              )}

              {/* SÃ©lection Fournisseur */}
              {watchedTypeEntite === 'fournisseur' && (
                <Controller
                  name="id_fournisseur"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      fullWidth
                      margin="normal"
                      error={!!error}
                      disabled={loading || (prefillFournisseurId !== null && prefillFournisseurId !== undefined)}
                    >
                      <InputLabel required>Fournisseur</InputLabel>
                      <Select
                        {...field}
                        label="Fournisseur"
                        value={field.value || ''}
                      >
                        <MenuItem value="">
                          <em>SÃ©lectionner un fournisseur</em>
                        </MenuItem>
                        {fournisseurs.map((fournisseur) => (
                          <MenuItem
                            key={fournisseur.id_fournisseur}
                            value={fournisseur.id_fournisseur}
                          >
                            {fournisseur.nom_fournisseur}
                          </MenuItem>
                        ))}
                      </Select>
                      {error && <FormHelperText>{error.message}</FormHelperText>}
                    </FormControl>
                  )}
                />
              )}

              {/* Lignes de transaction avec Accordions */}
              <Paper
                variant="outlined"
                sx={{
                  mt: 3,
                  mb: 2,
                  p: { xs: 2, md: 2.5 },
                  borderRadius: 3,
                  backgroundColor: 'background.paper',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                  }}
                >
                  <Box>
                    <Typography variant="h6" fontWeight={900}>2. Produits et paiements</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Ajoutez les produits, puis cochez le paiement uniquement si l'argent est dÃ©jÃ  encaissÃ© ou payÃ©.
                    </Typography>
                  </Box>
                  {!isEditing && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddLine}
                      disabled={loading}
                    >
                      Ajouter une ligne
                    </Button>
                  )}
                </Box>

                {errors.lignes && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errors.lignes.message}
                  </Alert>
                )}

                {/* Accordions pour chaque ligne */}
                      {watchedLignes?.map((ligne, index) => {
                        const ligneTotal =
                          (parseFloat(ligne.quantite) || 0) *
                          (parseFloat(ligne.prix_unitaire) || 0);
                  const selectedProduit = produits.find(p => Number(p.id_produit) === Number(ligne.id_produit));
                  const produitNom = selectedProduit?.nom_produit || 'Produit non sÃ©lectionnÃ©';
                  const shouldShowBatimentSource = watchedTypeEntite === 'client' && isEggProduct(selectedProduit);
                  
                        return (
                    <Accordion 
                      key={index}
                      expanded={expandedAccordion === index}
                      onChange={() => setExpandedAccordion(expandedAccordion === index ? -1 : index)}
                      sx={{
                        mb: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2.5,
                        overflow: 'hidden',
                        '&:before': { display: 'none' },
                      }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pr: 2 }}>
                          <Chip 
                            label={`Ligne ${index + 1}`} 
                            size="small" 
                            color="primary" 
                            variant="outlined"
                          />
                          <Typography variant="body1" sx={{ flex: 1 }}>
                            {produitNom}
                          </Typography>
                          <Typography variant="body2" fontWeight="bold" color="primary">
                            {ligneTotal.toFixed(2)} MAD
                          </Typography>
                          {ligne.ajouter_paiement && (
                            <Chip 
                              icon={<PaymentIcon />}
                              label="Avec paiement" 
                              size="small" 
                              color="success"
                            />
                          )}
                        </Box>
                      </AccordionSummary>
                      
                      <AccordionDetails>
                        <Grid container spacing={2}>
                          {/* Produit */}
                          <Grid item xs={12}>
                              <Controller
                                name={`lignes.${index}.id_produit`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                <FormControl fullWidth error={!!error} disabled={loading}>
                                  <InputLabel>{watchedTypeEntite === 'client' ? 'Oeufs vendus *' : 'Produit acheté *'}</InputLabel>
                                    <Select
                                      {...field}
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
                                      <em>{watchedTypeEntite === 'client' ? 'Sélectionner les oeufs' : 'Sélectionner le produit acheté'}</em>
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

                          {/* QuantitÃ© */}
                          <Grid item xs={12} sm={6}>
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
                                    disabled={loading}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value === '' ? undefined : value);
                                      // Mettre Ã  jour le montant du paiement si paiement activÃ©
                                      if (ligne.ajouter_paiement) {
                                        const newTotal = (parseFloat(value) || 0) * (parseFloat(ligne.prix_unitaire) || 0);
                                        setValue(`lignes.${index}.paiement_montant`, newTotal);
                                      }
                                    }}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                          </Grid>

                          {/* Prix unitaire */}
                          <Grid item xs={12} sm={6}>
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
                                    disabled={loading}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value === '' ? undefined : value);
                                      // Mettre Ã  jour le montant du paiement si paiement activÃ©
                                      if (ligne.ajouter_paiement) {
                                        const newTotal = (parseFloat(ligne.quantite) || 0) * (parseFloat(value) || 0);
                                        setValue(`lignes.${index}.paiement_montant`, newTotal);
                                      }
                                    }}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                          </Grid>

                          {/* Total de cette ligne */}
                          <Grid item xs={12}>
                            <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 2, border: '1px solid', borderColor: 'primary.light' }}>
                              <Typography variant="body2" color="text.secondary">
                                Total de cette ligne
                              </Typography>
                              <Typography variant="h6" color="primary" fontWeight="bold">
                                {ligneTotal.toFixed(2)} MAD
                              </Typography>
                            </Box>
                          </Grid>

                          <Grid item xs={12}>
                            <Divider />
                          </Grid>

                          {/* Section Paiement */}
                          <Grid item xs={12}>
                            <Controller
                              name={`lignes.${index}.ajouter_paiement`}
                              control={control}
                              render={({ field }) => (
                                <>
                                <Box
                                  sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                                    gap: 1.5,
                                  }}
                                >
                                  {[
                                    { value: true, title: 'PayÃ© maintenant', subtitle: 'CrÃ©er le paiement' },
                                    { value: false, title: 'Ã€ payer plus tard', subtitle: 'Sans paiement' },
                                  ].map((option) => {
                                    const isSelected = Boolean(field.value) === option.value;
                                    return (
                                      <Box
                                        key={option.title}
                                        role="button"
                                        tabIndex={loading ? -1 : 0}
                                        onClick={() => {
                                          if (loading) return;
                                          field.onChange(option.value);
                                          if (option.value && ligneTotal > 0) {
                                            const existingPaiements = watch(`lignes.${index}.paiements`);
                                            if (!existingPaiements || existingPaiements.length === 0) {
                                              setValue(`lignes.${index}.paiements`, [{
                                                date: watch('date_transaction') || new Date().toISOString().split('T')[0],
                                                montant: ligneTotal,
                                                type: 'cash',
                                                numero_cheque: '',
                                                banque: '',
                                                reference: '',
                                                id_lc: '',
                                                notes: '',
                                              }]);
                                            } else {
                                              setValue(`lignes.${index}.paiements.0.montant`, ligneTotal);
                                              setValue(`lignes.${index}.paiements.0.date`, watch('date_transaction'));
                                            }
                                          }
                                        }}
                                        onKeyDown={(event) => {
                                          if ((event.key === 'Enter' || event.key === ' ') && !loading) {
                                            event.preventDefault();
                                            event.currentTarget.click();
                                          }
                                        }}
                                        sx={{
                                          p: 2,
                                          borderRadius: 2.5,
                                          border: '2px solid',
                                          borderColor: isSelected ? 'success.main' : 'divider',
                                          backgroundColor: isSelected ? 'rgba(46, 125, 50, 0.08)' : 'background.paper',
                                          cursor: loading ? 'not-allowed' : 'pointer',
                                          opacity: loading ? 0.6 : 1,
                                        }}
                                      >
                                        <Typography fontWeight={900}>{option.title}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                          {option.subtitle}
                                        </Typography>
                                      </Box>
                                    );
                                  })}
                                </Box>
                                <FormControlLabel
                                  sx={{ display: 'none' }}
                                  control={
                                    <Checkbox
                                      {...field}
                                      checked={field.value || false}
                                      disabled={loading}
                                      onChange={(e) => {
                                        field.onChange(e.target.checked);
                                        // PrÃ©-remplir le montant avec le total de la ligne
                                        if (e.target.checked && ligneTotal > 0) {
                                          setValue(`lignes.${index}.paiement_montant`, ligneTotal);
                                          setValue(`lignes.${index}.paiement_date`, watch('date_transaction'));
                                        }
                                      }}
                                    />
                                  }
                                  label={
                                    <Box>
                                      <Typography variant="subtitle2" fontWeight="medium">
                                        ðŸ’° Ajouter un paiement pour cette ligne
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        Le paiement sera crÃ©Ã© en mÃªme temps que la transaction
                                      </Typography>
                                    </Box>
                                  }
                                />
                                </>
                              )}
                            />

                            {/* Champs de paiement conditionnels */}
                            <Collapse in={ligne.ajouter_paiement}>
                              <Box sx={{ mt: 2, p: 2, bgcolor: 'success.50', borderRadius: 2, border: '1px solid', borderColor: 'success.light' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                  <Typography variant="subtitle2" color="success.dark">
                                    ðŸ“‹ Liste des paiements
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
                                      <Grid item xs={12} sm={6}>
                                        <Controller
                                          name={`lignes.${index}.paiements.${pIndex}.date`}
                                          control={control}
                                          render={({ field, fieldState: { error } }) => (
                                            <TextField
                                              {...field}
                                              fullWidth
                                              label="Date"
                                              type="date"
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
                                      <Grid item xs={12} sm={6}>
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
                                      <Grid item xs={12}>
                                        <Controller
                                          name={`lignes.${index}.paiements.${pIndex}.type`}
                                          control={control}
                                          render={({ field, fieldState: { error } }) => (
                                            <TextField
                                              {...field}
                                              select
                                              fullWidth
                                              label="Mode"
                                              error={!!error}
                                              helperText={error?.message}
                                              disabled={loading}
                                              size="small"
                                            >
                                              <MenuItem value="cash">ðŸ’µ EspÃ¨ces</MenuItem>
                                              <MenuItem value="cheque">ðŸ’³ ChÃ¨que</MenuItem>
                                              <MenuItem value="virement">ðŸ¦ Virement</MenuItem>
                                              <MenuItem value="carte">ðŸ’³ Carte bancaire</MenuItem>
                                              <MenuItem value="compensation">â†”ï¸ Compensation</MenuItem>
                                              <MenuItem value="lc">ðŸ“œ Lettre de CrÃ©dit</MenuItem>
                                              <MenuItem value="autre">ðŸ“„ Autre</MenuItem>
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
                                                <TextField {...field} fullWidth label="NÂ° ChÃ¨que" disabled={loading} size="small" />
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
                                              <TextField {...field} fullWidth label="RÃ©fÃ©rence" disabled={loading} size="small" />
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
                                      Total payÃ© pour cette ligne: <strong>{ligne.paiements.reduce((acc, p) => acc + (parseFloat(p.montant) || 0), 0).toFixed(2)} / {ligneTotal.toFixed(2)} MAD</strong>
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            </Collapse>
                          </Grid>

                          {/* Bouton supprimer la ligne */}
                          {!isEditing && watchedLignes.length > 1 && (
                            <Grid item xs={12}>
                              <Button
                                startIcon={<DeleteIcon />}
                                  onClick={() => handleRemoveLine(index)}
                                disabled={loading}
                                  color="error"
                                size="small"
                                fullWidth
                                variant="outlined"
                              >
                                Supprimer cette ligne
                              </Button>
                            </Grid>
                            )}
                        </Grid>
                      </AccordionDetails>
                    </Accordion>
                        );
                      })}

                {/* Montant total */}
                <Paper
                  variant="outlined"
                  sx={{
                    mt: 3,
                    p: 2,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, rgba(240,253,250,0.96), rgba(255,251,235,0.9))',
                  }}
                >
                  <Typography sx={{ fontWeight: 900, mb: 1 }}>
                    3. RÃ©sumÃ© avant validation
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    VÃ©rifiez le total et les paiements avant d'enregistrer.
                  </Typography>
                <Box
                  sx={{
                    mt: 1.5,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <Typography variant="h6" sx={{ mr: 2 }}>
                    Montant total :
                  </Typography>
                  <Typography variant="h6" color="primary" fontWeight="bold">
                    {montantTotal.toFixed(2)} MAD
                  </Typography>
                </Box>
                </Paper>
                
                {!isEditing && watchedLignes.length > 1 && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    {watchedLignes.length} transactions indÃ©pendantes seront crÃ©Ã©es (une par ligne).
                    Vous pouvez ajouter un paiement pour chacune dans son accordion.
                  </Alert>
                )}
              </Paper>
            </Box>
          )}
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
            {loading ? 'Enregistrement...' : isEditing ? 'Modifier' : 'CrÃ©er'}
          </Button>
        </DialogActions>
    </Dialog>
  );
}

export default TransactionForm;
