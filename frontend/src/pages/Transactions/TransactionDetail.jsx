/**
 * Page Détail Transaction.
 * 
 * Affiche les détails complets d'une transaction :
 * - Informations transaction (date, montant, client/fournisseur, produit, quantité, prix unitaire, statut)
 * - Historique d'audit (qui a modifié quoi et quand)
 * - Bouton pour voir l'audit complet
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
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
  TextField,
  Divider,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
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
  IconButton,
  Tooltip,
} from '@mui/material';
import { get, post, put, patch, del } from '../../services/api';
import { format } from 'date-fns';
import { formatShortDate } from '../../utils/dateFormatting';
import { formatMontant as formatMontantUtil } from '../../utils/formatNumber';
import PaymentStatusBadge from '../../components/PaymentStatusBadge';
import PaymentTypeBadge from '../../components/PaymentTypeBadge';
import PaiementForm from '../../components/PaiementForm';
import useNotification from '../../hooks/useNotification';
import { useForm, useFieldArray } from 'react-hook-form';
import MultiPaiementForm from '../../components/PaiementForm/MultiPaiementForm';
import DeferredSaleHistory from './DeferredSaleHistory';
import DeferredSaleStockSummary from './DeferredSaleStockSummary';
import { HistoryOutlined, LayersOutlined, ReceiptLongOutlined } from '@mui/icons-material';
import ExpandableDetails from '../../components/ExpandableDetails';

/**
 * Composant TransactionDetail.
 */
function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromDeliveries = new URLSearchParams(location.search).get('from') === 'deliveries';
  const returnPath = fromDeliveries ? `/livraisons-a-suivre?vente=${id}` : '/transactions';
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
  const [promiseActionLoading, setPromiseActionLoading] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionPreview, setCompletionPreview] = useState(null);
  const [completionQuantity, setCompletionQuantity] = useState('');
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [newDeliveryDate, setNewDeliveryDate] = useState('');
  const [cancelRemainderDialogOpen, setCancelRemainderDialogOpen] = useState(false);
  const [cancelTransactionDialogOpen, setCancelTransactionDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Annulation demandée depuis le détail de la vente');

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
        get('/fournisseurs', { params: { limit: 1000 } }),
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

  const openCompletion = async () => {
    setPromiseActionLoading(true);
    try {
      const proposal = await get(`/transactions/${id}/completion`);
      setCompletionPreview(proposal);
      setCompletionQuantity(String(proposal.quantite_proposee || ''));
      setCompletionDialogOpen(true);
    } catch (err) {
      notification.error(err?.message || 'Le stock disponible ne peut pas être chargé.');
    } finally { setPromiseActionLoading(false); }
  };

  const submitCompletion = async () => {
    const quantity = Number(completionQuantity);
    if (!completionPreview || !Number.isInteger(quantity) || quantity < 1 || quantity > completionPreview.quantite_proposee) return;
    setPromiseActionLoading(true);
    try {
      await post(`/transactions/${id}/completion`, {
        quantite: quantity,
        quantite_couverte_attendue: completionPreview.quantite_couverte,
        empreinte_stock: completionPreview.empreinte_stock,
      });
      setCompletionDialogOpen(false);
      await fetchTransaction();
      notification.success('La quantité disponible a été ajoutée à la vente.');
    } catch (err) {
      notification.error(err?.message || 'La livraison n’a pas pu être complétée. Rechargez la proposition.');
    } finally { setPromiseActionLoading(false); }
  };

  const submitReschedule = async () => {
    setPromiseActionLoading(true);
    try {
      await patch(`/transactions/${id}/delivery-date`, { date_livraison_prevue: newDeliveryDate });
      setRescheduleDialogOpen(false);
      await fetchTransaction();
      notification.success('La date prévue a été mise à jour.');
    } catch (err) { notification.error(err?.message || 'La date n’a pas pu être modifiée.'); }
    finally { setPromiseActionLoading(false); }
  };

  const submitCancelRemainder = async () => {
    setPromiseActionLoading(true);
    try {
      await post(`/transactions/${id}/cancel-remainder`);
      setCancelRemainderDialogOpen(false);
      await fetchTransaction();
      notification.success('Le reste à fournir a été clôturé.');
    } catch (err) { notification.error(err?.message || 'Le reste n’a pas pu être clôturé.'); }
    finally { setPromiseActionLoading(false); }
  };

  const submitCancelTransaction = async () => {
    setPromiseActionLoading(true);
    try {
      await del(`/transactions/${id}?raison=${encodeURIComponent(cancelReason)}`);
      setCancelTransactionDialogOpen(false);
      await Promise.all([fetchTransaction(), refreshPaiements()]);
      notification.success('La vente et ses paiements ont été annulés et conservés dans l’historique.');
    } catch (err) { notification.error(err?.message || 'La vente n’a pas pu être annulée.'); }
    finally { setPromiseActionLoading(false); }
  };

  const reactivateTransaction = async () => {
    setPromiseActionLoading(true);
    try {
      await patch(`/transactions/${id}/reactivate`, {});
      await Promise.all([fetchTransaction(), refreshPaiements()]);
      notification.success('La vente est réactivée. Les paiements annulés ne sont pas réactivés automatiquement.');
    } catch (err) { notification.error(err?.message || 'La vente n’a pas pu être réactivée.'); }
    finally { setPromiseActionLoading(false); }
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
    return formatShortDate(dateValue);
    } catch {
      return dateValue;
    }
  };

  /**
   * Formate une date/heure pour l'affichage.
   */
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
      id_lc: paiement.id_lc || null,
      notes: paiement.notes || '',
      paiements: [],
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
      // Financial attributes are immutable; editing sends operational fields only.
      const paiementData = editingPaiement ? {
        notes: data.notes || null,
      } : {
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
      } else if (data.type_paiement === 'lc' && !editingPaiement) {
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
      paiements: [],
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
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(returnPath)}>
          {fromDeliveries ? 'Retour aux livraisons' : 'Retour à la liste'}
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
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(returnPath)}>
          {fromDeliveries ? 'Retour aux livraisons' : 'Retour à la liste'}
        </Button>
      </Box>
    );
  }

  const canceledSale = Boolean(transaction.id_client) && transaction.est_actif === false;

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
          onClick={() => navigate(returnPath)}
          variant="outlined"
          size={isMobile ? 'small' : 'medium'}
        >
          {fromDeliveries ? 'Retour aux livraisons' : 'Retour'}
        </Button>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' }, overflowWrap: 'anywhere' }}
          >
            {transaction.est_promesse ? `Vente #${transaction.id_transaction}` : `Transaction #${transaction.id_transaction}`}
          </Typography>
          {transaction.est_promesse && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
            {getClientOuFournisseur()} · Vendue le {formatShortDate(transaction.date_transaction)}
          </Typography>}
        </Box>
      </Box>

      {canceledSale && <Alert severity="error" sx={{ mb: 2 }}>
        <Typography fontWeight={700}>Vente annulée</Typography>
        Les montants et paiements restent consultables dans l’historique.
      </Alert>}

      {transaction.est_promesse && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        {transaction.est_actif && Number(transaction.quantite_en_attente) > 0 && <>
          <Button variant="contained" onClick={openCompletion} disabled={promiseActionLoading || Number(transaction.quantite_reservee || 0) < 1}>
            Compléter {Number(transaction.quantite_reservee || 0) > 0 ? `(${Number(transaction.quantite_reservee).toLocaleString('fr-FR')} disponibles)` : ''}
          </Button>
          <Button variant="outlined" onClick={() => { setNewDeliveryDate(transaction.date_livraison_prevue || ''); setRescheduleDialogOpen(true); }} disabled={promiseActionLoading}>Changer la date</Button>
          <Button color="inherit" onClick={() => setCancelRemainderDialogOpen(true)} disabled={promiseActionLoading}>Clôturer le reste</Button>
        </>}
        {transaction.est_actif && <Button color="error" onClick={() => setCancelTransactionDialogOpen(true)} disabled={promiseActionLoading}>Annuler la vente</Button>}
        {transaction.est_actif === false && <Button variant="outlined" onClick={reactivateTransaction} disabled={promiseActionLoading}>Réactiver la vente</Button>}
      </Stack>}

      {/* Informations principales */}
      {!transaction.est_promesse && <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
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
              </Stack>
            </CardContent>
          </Card>
        </Grid>

      </Grid>}

      {/* Détails de la transaction */}
      <Card sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
          <Typography 
            variant="h6" 
            gutterBottom
            sx={{ fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' } }}
          >
            {transaction.est_promesse ? 'Commande' : 'Détails de la Transaction'}
          </Typography>
          <Divider sx={{ mb: { xs: 1.5, sm: 2 } }} />
          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            {transaction.est_promesse && <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">
                Livraison {transaction.nom_batiment_source ? `depuis ${transaction.nom_batiment_source}` : 'différée'}{transaction.date_livraison_prevue ? ` · prévue le ${formatShortDate(transaction.date_livraison_prevue)}` : ''}
              </Typography>
            </Grid>}
            {!transaction.est_promesse && transaction.id_production ? <Grid item xs={12}>
              <Typography variant="body2">Origine : {transaction.nom_batiment_source}</Typography>
              <ExpandableDetails label="Origine du stock" icon={<LayersOutlined />} sx={{ mt: 1.5 }}>
                {transaction.repartition_stock?.length ? transaction.repartition_stock.map(source =>
                  <Stack direction="row" spacing={2} justifyContent="space-between" key={source.id_production} sx={{ py: 0.75 }}><Typography variant="body2" color="text.secondary">Production du {formatShortDate(source.date_production)}</Typography><Typography variant="body2" fontWeight={700} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{source.quantite.toLocaleString('fr-FR')} œufs</Typography></Stack> )
                  : <Typography variant="body2">Saisie du {formatShortDate(transaction.date_production)}</Typography>}
              </ExpandableDetails>
            </Grid> : null}
            <Grid item xs={12} sm={6}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {transaction.id_production ? 'Type d’œufs' : 'Produit'}
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
          {transaction.est_promesse && <>
            <Divider sx={{ my: 2 }} />
            <DeferredSaleStockSummary sale={transaction} showStatus={false} />
          </>}
        </CardContent>
      </Card>

      {statutPaiement && <Card sx={{ mb: 3 }}><CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
          <Typography component="h2" variant="h6" fontWeight={700}>Paiement</Typography>
          <PaymentStatusBadge statut={statutPaiement.est_en_retard ? 'en_retard' : statutPaiement.statut_paiement} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} justifyContent="space-between">
          <Box><Typography variant="body2" color="text.secondary">Réglé</Typography><Typography fontWeight={700}>{formatMontant(statutPaiement.montant_paye)}</Typography></Box>
          {Number(statutPaiement.montant_restant) > 0 && <Box><Typography variant="body2" color="text.secondary">{transaction.id_client ? 'Reste à encaisser' : 'Reste à payer'}</Typography><Typography fontWeight={700}>{formatMontant(statutPaiement.montant_restant)}</Typography></Box>}
        </Stack>
        {!canceledSale && Number(statutPaiement.montant_restant) > 0 && <Stack direction="row" spacing={2} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap', mt: 2 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddPaiement}>Ajouter un paiement</Button>
          {transaction.date_echeance && <Typography variant="body2" color={statutPaiement.est_en_retard ? 'error.main' : 'text.secondary'}>Échéance : {formatDate(transaction.date_echeance)}</Typography>}
        </Stack>}
      </CardContent></Card>}

      {statutPaiement && paiements?.length > 0 && <Box sx={{ mb: 3 }}>
        <ExpandableDetails label="Paiements enregistrés" icon={<ReceiptLongOutlined />} meta={`${paiements.length} paiement${paiements.length > 1 ? 's' : ''}`}>
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
                      {!canceledSale && <TableCell align="center">Actions</TableCell>}
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
                              {paiement.numero_cheque || paiement.reference_virement || paiement.numero_reference_lc || (paiement.id_lc ? `LC #${paiement.id_lc}` : '-')}
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
                        {!canceledSale && <TableCell align="center">
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
                        </TableCell>}
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

              </Box>
            )}
        </ExpandableDetails>
      </Box>}

      {transaction.est_promesse && <Box sx={{ mb: 3 }}>
        <ExpandableDetails label="Historique des réservations" icon={<HistoryOutlined />}>
          <DeferredSaleHistory transactionId={transaction.id_transaction} refreshKey={`${transaction.quantite_couverte}-${transaction.quantite_annulee}-${transaction.date_livraison_prevue}-${transaction.est_actif}`} embedded />
        </ExpandableDetails>
      </Box>}

      <Dialog open={completionDialogOpen} onClose={() => !promiseActionLoading && setCompletionDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Compléter la livraison</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">Stock réservé pour cette vente, par date de production :</Typography>
            {completionPreview?.repartition_stock?.map(source => <Stack key={source.id_production} direction="row" justifyContent="space-between"><Typography variant="body2">Production du {formatShortDate(source.date_production)}</Typography><Typography variant="body2" fontWeight={700}>{Number(source.quantite).toLocaleString('fr-FR')} œufs</Typography></Stack>)}
            <TextField label="Quantité à compléter" type="number" value={completionQuantity} onChange={event => setCompletionQuantity(event.target.value)} inputProps={{ min: 1, max: completionPreview?.quantite_proposee || 1, step: 1 }} helperText={`Maximum disponible : ${Number(completionPreview?.quantite_proposee || 0).toLocaleString('fr-FR')} œufs`} />
            <Alert severity="info">Cette action rattache le stock à la vente existante. Elle ne crée ni nouvelle vente ni nouveau paiement.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setCompletionDialogOpen(false)} disabled={promiseActionLoading}>Retour</Button><Button variant="contained" onClick={submitCompletion} disabled={promiseActionLoading || !Number(completionQuantity) || Number(completionQuantity) > Number(completionPreview?.quantite_proposee)}>Confirmer</Button></DialogActions>
      </Dialog>
      <Dialog open={rescheduleDialogOpen} onClose={() => setRescheduleDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Changer la date prévue</DialogTitle>
        <DialogContent><TextField fullWidth type="date" label="Nouvelle date" value={newDeliveryDate} onChange={event => setNewDeliveryDate(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ mt: 1 }} /></DialogContent>
        <DialogActions><Button onClick={() => setRescheduleDialogOpen(false)}>Annuler</Button><Button variant="contained" onClick={submitReschedule} disabled={promiseActionLoading || !newDeliveryDate}>Enregistrer</Button></DialogActions>
      </Dialog>
      <Dialog open={cancelRemainderDialogOpen} onClose={() => setCancelRemainderDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Clôturer le reste à fournir ?</DialogTitle>
        <DialogContent><Typography>Les {Number(transaction.quantite_en_attente || 0).toLocaleString('fr-FR')} œufs non complétés seront clôturés. Le stock réservé qui n’est plus nécessaire sera libéré pour les autres ventes. Le montant de la vente et ses paiements restent inchangés ; cette action ne crée pas de remboursement.</Typography></DialogContent>
        <DialogActions><Button onClick={() => setCancelRemainderDialogOpen(false)}>Retour</Button><Button color="warning" variant="contained" onClick={submitCancelRemainder} disabled={promiseActionLoading}>Clôturer</Button></DialogActions>
      </Dialog>
      <Dialog open={cancelTransactionDialogOpen} onClose={() => setCancelTransactionDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Annuler la vente entière ?</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="warning">La vente sera retirée du registre actif. Ses paiements seront annulés et conservés dans l’historique. Une réactivation ultérieure ne réactive pas les paiements.</Alert>
          <TextField label="Motif" value={cancelReason} onChange={event => setCancelReason(event.target.value)} required inputProps={{ maxLength: 1000 }} />
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setCancelTransactionDialogOpen(false)}>Retour</Button><Button color="error" variant="contained" onClick={submitCancelTransaction} disabled={promiseActionLoading || cancelReason.trim().length < 3}>Annuler la vente</Button></DialogActions>
      </Dialog>

      {/* Modal d'ajout/édition de paiement */}
      <Dialog
        open={paiementDialogOpen}
        onClose={handleClosePaiementDialog}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <form noValidate onSubmit={handleSubmitPaiement(onSubmitPaiement)}>
          <DialogTitle>
            <Typography variant="h6" component="span">
              {editingPaiement ? 'Modifier le paiement' : 'Ajouter un paiement'}
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
                  defaultValues={editingPaiement}
                  isEditing
                  transaction={{ ...transaction, ...statutPaiement }}
                  register={registerPaiement}
                  errors={paiementErrors}
                  watch={watchPaiement}
                  setValue={setValuePaiement}
                  availableLcs={availableLcs}
                  loadingLcs={loadingLcs}
                />
              ) : (
                <MultiPaiementForm
                  supplierSource={fournisseurs.find((item) => item.id_fournisseur === transaction?.id_fournisseur)?.mode_reglement_prefere || null}
                  transaction={{ ...transaction, ...statutPaiement }}
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
