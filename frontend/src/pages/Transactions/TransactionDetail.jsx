/**
 * Page Détail Transaction.
 * 
 * Affiche les détails complets d'une transaction :
 * - Informations transaction (date, montant, client/fournisseur, produit, quantité, prix unitaire, statut)
 * - Historique d'audit (qui a modifié quoi et quand)
 * - Bouton pour voir l'audit complet
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  AttachMoney as AttachMoneyIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalance as AccountBalanceIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import { get, post, put, del } from '../../services/api';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { formatMontant as formatMontantUtil } from '../../utils/formatNumber';
import PaymentStatusBadge from '../../components/PaymentStatusBadge';
import PaymentTypeBadge from '../../components/PaymentTypeBadge';
import PaiementForm from '../../components/PaiementForm';
import useNotification from '../../hooks/useNotification';
import { useForm, useFieldArray } from 'react-hook-form';
import MultiPaiementForm from '../../components/PaiementForm/MultiPaiementForm';

/**
 * Composant TransactionDetail.
 */
function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const notification = useNotification();
  
  // États pour les données
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // États pour les paiements
  const [paiements, setPaiements] = useState([]);
  const [statutPaiement, setStatutPaiement] = useState(null);
  const [loadingPaiements, setLoadingPaiements] = useState(false);

  // États pour les données de référence
  const [produits, setProduits] = useState([]);
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);

  // État pour la modal d'ajout/édition de paiement
  const [paiementDialogOpen, setPaiementDialogOpen] = useState(false);
  const [editingPaiement, setEditingPaiement] = useState(null);
  
  // État pour la confirmation de suppression de paiement
  const [deletePaiementDialogOpen, setDeletePaiementDialogOpen] = useState(false);
  const [paiementToDelete, setPaiementToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /**
   * Crée des maps de lookup pour produits, clients et fournisseurs.
   */
  const produitsMap = useMemo(() => {
    const map = new Map();
    produits.forEach((produit) => {
      map.set(produit.id_produit, produit.nom_produit);
    });
    return map;
  }, [produits]);

  const clientsMap = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      map.set(client.id_client, client.nom_client);
    });
    return map;
  }, [clients]);

  const fournisseursMap = useMemo(() => {
    const map = new Map();
    fournisseurs.forEach((fournisseur) => {
      map.set(fournisseur.id_fournisseur, fournisseur.nom_fournisseur);
    });
    return map;
  }, [fournisseurs]);

  /**
   * Charge les données de référence (produits, clients, fournisseurs).
   */
  const fetchReferenceData = async () => {
    try {
      const [produitsData, clientsData, fournisseursData] = await Promise.all([
        get('/produits', { params: { limit: 1000, est_actif: true } }),
        get('/clients', { params: { limit: 1000, est_actif: true } }),
        get('/fournisseurs', { params: { limit: 1000, est_actif: true } }),
      ]);
      setProduits(produitsData || []);
      setClients(clientsData || []);
      setFournisseurs(fournisseursData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des données de référence:', err);
    }
  };

  /**
   * Charge les détails de la transaction.
   */
  const fetchTransaction = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await get(`/transactions/${id}`);
      setTransaction(data);
    } catch (err) {
      console.error('Erreur lors du chargement de la transaction:', err);
      setError(err?.message || 'Une erreur est survenue lors du chargement de la transaction');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Charge les paiements de la transaction.
   */
  const fetchPaiements = async () => {
    setLoadingPaiements(true);
    try {
      const data = await get(`/paiements`, {
        params: { id_transaction: id },
      });
      setPaiements(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des paiements:', err);
    } finally {
      setLoadingPaiements(false);
    }
  };

  /**
   * Charge le statut de paiement de la transaction.
   */
  const fetchStatutPaiement = async () => {
    try {
      const data = await get(`/paiements/transaction/${id}/statut`);
      setStatutPaiement(data);
    } catch (err) {
      console.error('Erreur lors du chargement du statut de paiement:', err);
    }
  };

  /**
   * Rafraîchit les données de paiement.
   */
  const refreshPaiements = async () => {
    await Promise.all([
      fetchPaiements(),
      fetchStatutPaiement(),
    ]);
  };





  useEffect(() => {
    if (id) {
      fetchReferenceData();
      fetchTransaction();
      fetchPaiements();
      fetchStatutPaiement();
    }
  }, [id]);



  /**
   * Formate le montant pour l'affichage (wrapper de l'utilitaire).
   */
  const formatMontant = (montant, options = {}) => {
    return formatMontantUtil(montant, { useCompactNotation: false, ...options });
  };

  /**
   * Formate une date pour l'affichage.
   */
  const formatDate = (dateValue) => {
    if (!dateValue) return '-';
    try {
      return format(new Date(dateValue), 'dd/MM/yyyy', { locale: fr });
    } catch {
      return dateValue;
    }
  };

  /**
   * Formate une date/heure pour l'affichage.
   */
  const formatDateTime = (dateValue) => {
    if (!dateValue) return '-';
    try {
      return format(new Date(dateValue), 'dd/MM/yyyy HH:mm:ss', { locale: fr });
    } catch {
      return dateValue;
    }
  };

  /**
   * Obtient le nom du client ou fournisseur pour la transaction.
   */
  const getClientOuFournisseur = () => {
    if (!transaction) return '-';
    if (transaction.id_client) {
      return clientsMap.get(transaction.id_client) || `Client #${transaction.id_client}`;
    } else if (transaction.id_fournisseur) {
      return fournisseursMap.get(transaction.id_fournisseur) || `Fournisseur #${transaction.id_fournisseur}`;
    }
    return '-';
  };

  /**
   * Obtient le nom du produit pour la transaction.
   */
  const getProduitName = () => {
    if (!transaction || !transaction.id_produit) return '-';
    return produitsMap.get(transaction.id_produit) || `Produit #${transaction.id_produit}`;
  };



  /**
   * Configuration du formulaire de paiement avec react-hook-form.
   */
  const {
    register: registerPaiement,
    handleSubmit: handleSubmitPaiement,
    control: controlPaiement,
    formState: { errors: paiementErrors, isSubmitting: isPaiementSubmitting },
    watch: watchPaiement,
    reset: resetPaiement,
    setValue: setValuePaiement,
  } = useForm({
    defaultValues: {
      date_paiement: format(new Date(), 'yyyy-MM-dd'),
      montant: 0,
      type_paiement: 'cash',
      statut_cheque: 'a_encaisser',
      paiements: [], // Pour le mode multi-lignes
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: controlPaiement,
    name: "paiements",
  });

  // États pour les LC (nécessaires pour le multi-mode)
  const [availableLcs, setAvailableLcs] = useState([]);
  const [loadingLcs, setLoadingLcs] = useState(false);

  useEffect(() => {
    const fetchLcs = async () => {
      if (!paiementDialogOpen) return;
      setLoadingLcs(true);
      try {
        const params = {};
        if (transaction?.id_client) params.id_client = transaction.id_client;
        if (transaction?.id_fournisseur) params.id_fournisseur = transaction.id_fournisseur;
        const data = await get('/lettres-credit/disponibles', { params });
        setAvailableLcs(data || []);
      } catch (err) {
        console.error('Erreur chargement LC:', err);
      } finally {
        setLoadingLcs(false);
      }
    };
    fetchLcs();
  }, [paiementDialogOpen, editingPaiement, transaction]);

  /**
   * Ouvre le dialog pour éditer un paiement existant.
   */
  const handleEditPaiement = (paiement) => {
    setEditingPaiement(paiement);
    resetPaiement({
      date_paiement: format(new Date(paiement.date_paiement), 'yyyy-MM-dd'),
      montant: parseFloat(paiement.montant),
      type_paiement: paiement.type_paiement,
      numero_cheque: paiement.numero_cheque || '',
      banque: paiement.banque || '',
      date_encaissement_prevue: paiement.date_encaissement_prevue 
        ? format(new Date(paiement.date_encaissement_prevue), 'yyyy-MM-dd')
        : '',
      statut_cheque: paiement.statut_cheque || 'a_encaisser',
      reference_virement: paiement.reference_virement || '',
      notes: paiement.notes || '',
    });
    setPaiementDialogOpen(true);
  };

  /**
   * Ouvre le dialog de confirmation de suppression.
   */
  const handleDeletePaiementClick = (paiement) => {
    setPaiementToDelete(paiement);
    setDeletePaiementDialogOpen(true);
  };

  /**
   * Supprime un paiement.
   */
  const handleConfirmDeletePaiement = async () => {
    if (!paiementToDelete) return;

    setDeleteLoading(true);
    try {
      await del(`/paiements/${paiementToDelete.id_paiement}`);
      
      // Rafraîchir les données
      await refreshPaiements();
      
      // Fermer le dialog
      setDeletePaiementDialogOpen(false);
      setPaiementToDelete(null);
      
      notification.success('Paiement supprimé avec succès');
    } catch (err) {
      console.error('Erreur lors de la suppression du paiement:', err);
      notification.error(err?.message || 'Une erreur est survenue lors de la suppression du paiement');
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * Gère la soumission du formulaire de paiement (création ou modification).
   */
  const onSubmitPaiement = async (data) => {
    try {
      // Préparer les données
      const paiementData = {
        date_paiement: data.date_paiement,
        montant: parseFloat(data.montant),
        type_paiement: data.type_paiement,
        notes: data.notes || null,
      };

      // Ajouter les champs spécifiques selon le type
      if (data.type_paiement === 'cheque') {
        paiementData.numero_cheque = data.numero_cheque || null;
        paiementData.banque = data.banque || null;
        paiementData.date_encaissement_prevue = data.date_encaissement_prevue || null;
        paiementData.statut_cheque = data.statut_cheque || 'a_encaisser';
      } else if (data.type_paiement === 'virement') {
        paiementData.reference_virement = data.reference_virement || null;
      } else if (data.type_paiement === 'lc') {
        paiementData.id_lc = data.id_lc || null;
      }

      // Mode édition ou création
      if (editingPaiement) {
        // Modification (toujours individuel)
        await put(`/paiements/${editingPaiement.id_paiement}`, paiementData);
        notification.success('Paiement modifié avec succès');
      } else {
        // Création (Multi-lignes)
        if (data.paiements && data.paiements.length > 0) {
          const batchData = {
            paiements: data.paiements.map(p => ({
              ...p,
              id_transaction: parseInt(id),
              montant: parseFloat(p.montant),
              // Nettoyer les champs optionnels
              numero_cheque: p.type_paiement === 'cheque' ? p.numero_cheque || null : null,
              banque: p.type_paiement === 'cheque' ? p.banque || null : null,
              date_encaissement_prevue: p.type_paiement === 'cheque' ? p.date_encaissement_prevue || null : null,
              statut_cheque: p.type_paiement === 'cheque' ? p.statut_cheque || 'a_encaisser' : null,
              reference_virement: p.type_paiement === 'virement' ? p.reference_virement || null : null,
              id_lc: p.type_paiement === 'lc' ? p.id_lc || null : null,
            }))
          };
          await post('/paiements/batch', batchData);
          notification.success(`${data.paiements.length} paiement(s) ajouté(s) avec succès`);
        } else {
          // Fallback au mode simple si jamais
          paiementData.id_transaction = parseInt(id);
          await post('/paiements', paiementData);
          notification.success('Paiement ajouté avec succès');
        }
      }

      // Rafraîchir les données
      await refreshPaiements();

      // Fermer la modal et réinitialiser le formulaire
      setPaiementDialogOpen(false);
      setEditingPaiement(null);
      resetPaiement();
    } catch (err) {
      console.error('Erreur lors de la soumission du paiement:', err);
      notification.error(err?.message || 'Une erreur est survenue lors de l\'enregistrement du paiement');
    }
  };

  /**
   * Gère la fermeture de la modal de paiement.
   */
  const handleClosePaiementDialog = () => {
    setPaiementDialogOpen(false);
    setEditingPaiement(null);
    resetPaiement();
  };

  /**
   * Gère l'ouverture de la modal d'ajout de paiement (nouveau).
   */
  const handleAddPaiement = () => {
    setEditingPaiement(null);
    resetPaiement({
      date_paiement: format(new Date(), 'yyyy-MM-dd'),
      montant: statutPaiement?.montant_restant || 0,
      type_paiement: 'cash',
      statut_cheque: 'a_encaisser',
      numero_cheque: '',
      banque: '',
      date_encaissement_prevue: '',
      reference_virement: '',
      notes: '',
    });
    setPaiementDialogOpen(true);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/transactions')}>
          Retour à la liste
        </Button>
      </Box>
    );
  }

  if (!transaction) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Transaction introuvable
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/transactions')}>
          Retour à la liste
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* En-tête avec bouton retour */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' }, 
        mb: { xs: 2, sm: 2.5, md: 3 }, 
        gap: { xs: 1.5, sm: 2 } 
      }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/transactions')}
          variant="outlined"
          size={isMobile ? 'small' : 'medium'}
        >
          Retour
        </Button>
        <Typography 
          variant="h4" 
          component="h1"
          sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' } }}
        >
          Transaction #{transaction.id_transaction}
        </Typography>
      </Box>

      {/* Informations principales */}
      <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
              <Typography 
                variant="h6" 
                gutterBottom
                sx={{ fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' } }}
              >
                Informations Générales
              </Typography>
              <Divider sx={{ mb: { xs: 1.5, sm: 2 } }} />
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Date de transaction
                  </Typography>
                  <Typography variant="body1">{formatDate(transaction.date_transaction)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Client / Fournisseur
                  </Typography>
                  <Typography variant="body1">{getClientOuFournisseur()}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Statut
                  </Typography>
                  <Chip
                    label={transaction.est_actif ? 'Actif' : 'Inactif'}
                    color={transaction.est_actif ? 'success' : 'default'}
                    size="small"
                    sx={{ mt: 0.5 }}
                  />
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

      </Grid>

      {/* Détails de la transaction */}
      <Card sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
          <Typography 
            variant="h6" 
            gutterBottom
            sx={{ fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' } }}
          >
            Détails de la Transaction
          </Typography>
          <Divider sx={{ mb: { xs: 1.5, sm: 2 } }} />
          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            <Grid item xs={12} sm={6}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Produit
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {getProduitName()}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Quantité
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {transaction.quantite || '-'}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Prix unitaire
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {transaction.prix_unitaire ? formatMontant(transaction.prix_unitaire) : '-'}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Montant total
                </Typography>
                <Typography variant="h6" color="primary" fontWeight="bold">
                  {formatMontant(transaction.montant_total)}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* État du paiement */}
      {statutPaiement && (
        <Card sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
            <Typography 
              variant="h6" 
              gutterBottom
              sx={{ fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' }, mb: { xs: 2, sm: 2.5 } }}
            >
              💰 État du Paiement
            </Typography>

            {/* Barre de progression */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Progression du paiement
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  {statutPaiement.pourcentage_paye.toFixed(1)}%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={Math.min(statutPaiement.pourcentage_paye, 100)}
                sx={{ 
                  height: 10, 
                  borderRadius: 5,
                  backgroundColor: 'grey.200',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 5,
                    backgroundColor: 
                      statutPaiement.pourcentage_paye >= 100 ? 'success.main' :
                      statutPaiement.pourcentage_paye >= 50 ? 'warning.main' : 'error.main'
                  }
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {formatMontant(statutPaiement.montant_paye)} payé
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatMontant(statutPaiement.montant_total)} total
                </Typography>
              </Box>
            </Box>

            {/* KPIs Paiement */}
            <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={4}>
                <Box sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  bgcolor: 'grey.50', 
                  borderRadius: 1,
                  textAlign: 'center'
                }}>
                  <Typography variant="caption" color="text.secondary">
                    Montant dû
                  </Typography>
                  <Typography variant="h6" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {formatMontant(statutPaiement.montant_total)}
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={4}>
                <Box sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  bgcolor: 'success.50', 
                  borderRadius: 1,
                  textAlign: 'center'
                }}>
                  <Typography variant="caption" color="success.dark">
                    Montant payé
                  </Typography>
                  <Typography variant="h6" color="success.main" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {formatMontant(statutPaiement.montant_paye)}
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={4}>
                <Box sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  bgcolor: statutPaiement.montant_restant > 0 ? 'error.50' : 'success.50',
                  borderRadius: 1,
                  textAlign: 'center'
                }}>
                  <Typography variant="caption" color={statutPaiement.montant_restant > 0 ? 'error.dark' : 'success.dark'}>
                    Montant restant
                  </Typography>
                  <Typography 
                    variant="h6" 
                    color={statutPaiement.montant_restant > 0 ? 'error.main' : 'success.main'}
                    sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}
                  >
                    {formatMontant(statutPaiement.montant_restant)}
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* Badges de statut */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <PaymentStatusBadge statut={statutPaiement.statut_paiement} size="medium" />
              {transaction.date_echeance && (
                <Chip 
                  label={`Échéance: ${formatDate(transaction.date_echeance)}`}
                  size="small"
                  color={statutPaiement.est_en_retard ? 'error' : 'default'}
                  variant={statutPaiement.est_en_retard ? 'filled' : 'outlined'}
                />
              )}
              {statutPaiement.nombre_paiements > 0 && (
                <Chip 
                  label={`${statutPaiement.nombre_paiements} paiement${statutPaiement.nombre_paiements > 1 ? 's' : ''}`}
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Historique des paiements */}
      {statutPaiement && (
        <Card sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
            <Box sx={{ 
              display: 'flex', 
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between', 
              alignItems: { xs: 'stretch', sm: 'center' }, 
              mb: { xs: 1.5, sm: 2 },
              gap: { xs: 1.5, sm: 0 }
            }}>
              <Typography 
                variant="h6"
                sx={{ fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' } }}
              >
                📋 Historique des Paiements
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddPaiement}
                disabled={statutPaiement.montant_restant <= 0}
                size={isMobile ? 'small' : 'medium'}
                fullWidth={isMobile}
              >
                Ajouter un paiement
              </Button>
            </Box>
            <Divider sx={{ mb: { xs: 1.5, sm: 2 } }} />
            
            {loadingPaiements ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress size={30} />
              </Box>
            ) : paiements && paiements.length > 0 ? (
              <TableContainer>
                  <Table size={isMobile ? 'small' : 'medium'}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Montant</TableCell>
                      {!isMobile && <TableCell>Type</TableCell>}
                      {!isMobile && <TableCell>Référence</TableCell>}
                      <TableCell>Statut</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paiements.map((paiement) => (
                      <TableRow key={paiement.id_paiement}>
                        <TableCell>{formatDate(paiement.date_paiement)}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="medium" color="success.main">
                            {formatMontant(paiement.montant)}
                          </Typography>
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            <PaymentTypeBadge type={paiement.type_paiement} />
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                              {paiement.numero_cheque || paiement.reference_virement || '-'}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell>
                          {paiement.type_paiement === 'cheque' && paiement.statut_cheque ? (
                            <Chip 
                              label={paiement.statut_cheque}
                              size="small"
                              color={paiement.statut_cheque === 'encaisse' ? 'success' : 'default'}
                            />
                          ) : (
                            <Chip 
                              label={paiement.statut}
                              size="small"
                              color={paiement.statut === 'valide' ? 'success' : 'default'}
                            />
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <Tooltip title="Modifier">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleEditPaiement(paiement)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Supprimer">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeletePaiementClick(paiement)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Aucun paiement enregistré pour cette transaction
                </Typography>
                {statutPaiement.montant_restant > 0 && (
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddPaiement}
                    sx={{ mt: 2 }}
                    size="small"
                  >
                    Ajouter le premier paiement
                  </Button>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      )}





      {/* Modal d'ajout/édition de paiement */}
      <Dialog
        open={paiementDialogOpen}
        onClose={handleClosePaiementDialog}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <form onSubmit={handleSubmitPaiement(onSubmitPaiement)}>
          <DialogTitle>
            <Typography variant="h6" component="span">
              {editingPaiement ? '✏️ Modifier le Paiement' : '➕ Ajouter un Paiement'}
            </Typography>
            {statutPaiement && !editingPaiement && (
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                Transaction #{id} - Montant restant: {formatMontant(statutPaiement.montant_restant)}
              </Typography>
            )}
            {editingPaiement && (
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                Paiement #{editingPaiement.id_paiement}
              </Typography>
            )}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              {editingPaiement ? (
                <PaiementForm
                  defaultValues={{}}
                  transaction={statutPaiement}
                  register={registerPaiement}
                  errors={paiementErrors}
                  watch={watchPaiement}
                  setValue={setValuePaiement}
                  availableLcs={availableLcs}
                  loadingLcs={loadingLcs}
                />
              ) : (
                <MultiPaiementForm
                  transaction={statutPaiement}
                  fields={fields}
                  append={append}
                  remove={remove}
                  register={registerPaiement}
                  errors={paiementErrors}
                  watch={watchPaiement}
                  setValue={setValuePaiement}
                  availableLcs={availableLcs}
                  loadingLcs={loadingLcs}
                />
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2, gap: 1 }}>
            <Button 
              onClick={handleClosePaiementDialog}
              disabled={isPaiementSubmitting}
            >
              Annuler
            </Button>
            <Button 
              type="submit"
              variant="contained"
              disabled={isPaiementSubmitting}
            >
              {isPaiementSubmitting ? 'Enregistrement...' : (editingPaiement ? 'Modifier' : 'Enregistrer')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Dialog de confirmation de suppression de paiement */}
      <Dialog
        open={deletePaiementDialogOpen}
        onClose={() => !deleteLoading && setDeletePaiementDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirmer la suppression</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer ce paiement ?
          </Typography>
          {paiementToDelete && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>Montant :</strong> {formatMontant(paiementToDelete.montant)}
              </Typography>
              <Typography variant="body2">
                <strong>Date :</strong> {formatDate(paiementToDelete.date_paiement)}
              </Typography>
              <Typography variant="body2">
                <strong>Type :</strong> {paiementToDelete.type_paiement}
              </Typography>
            </Box>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            Cette action est irréversible. Le montant restant sera recalculé automatiquement.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setDeletePaiementDialogOpen(false)}
            disabled={deleteLoading}
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirmDeletePaiement}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Suppression...' : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TransactionDetail;
