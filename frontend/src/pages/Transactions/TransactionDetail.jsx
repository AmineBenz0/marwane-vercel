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
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { get } from '../../services/api';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { formatMontant as formatMontantUtil } from '../../utils/formatNumber';

/**
 * Composant TransactionDetail.
 */
function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // États pour les données
  const [transaction, setTransaction] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // États pour les données de référence
  const [produits, setProduits] = useState([]);
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);

  // État pour la modal d'audit complet
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [fullAuditHistory, setFullAuditHistory] = useState([]);
  const [loadingFullAudit, setLoadingFullAudit] = useState(false);

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
   * Charge l'historique d'audit récent (5 derniers).
   */
  const fetchAuditHistory = async () => {
    try {
      const data = await get(`/transactions/${id}/audit`);
      // Limiter à 5 derniers pour l'affichage initial
      setAuditHistory(data.slice(0, 5) || []);
    } catch (err) {
      console.error('Erreur lors du chargement de l\'historique d\'audit:', err);
    }
  };

  /**
   * Charge l'historique d'audit complet.
   */
  const fetchFullAuditHistory = async () => {
    setLoadingFullAudit(true);
    try {
      const data = await get(`/transactions/${id}/audit`);
      setFullAuditHistory(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement de l\'audit complet:', err);
    } finally {
      setLoadingFullAudit(false);
    }
  };

  /**
   * Charge toutes les données au montage.
   */
  useEffect(() => {
    if (id) {
      fetchReferenceData();
      fetchTransaction();
      fetchAuditHistory();
    }
  }, [id]);

  /**
   * Charge l'audit complet lorsque la modal s'ouvre.
   */
  useEffect(() => {
    if (auditDialogOpen) {
      fetchFullAuditHistory();
    }
  }, [auditDialogOpen]);

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
   * Gère l'ouverture de la modal d'audit complet.
   */
  const handleOpenAuditDialog = () => {
    setAuditDialogOpen(true);
  };

  /**
   * Gère la fermeture de la modal d'audit complet.
   */
  const handleCloseAuditDialog = () => {
    setAuditDialogOpen(false);
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
    <Box sx={{ p: 3 }}>
      {/* En-tête avec bouton retour */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/transactions')}
          variant="outlined"
        >
          Retour
        </Button>
        <Typography variant="h4" component="h1">
          Détails de la Transaction #{transaction.id_transaction}
        </Typography>
      </Box>

      {/* Informations principales */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Informations Générales
              </Typography>
              <Divider sx={{ mb: 2 }} />
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

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Informations de Traçabilité
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Date de création
                  </Typography>
                  <Typography variant="body2">
                    {formatDateTime(transaction.date_creation)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Dernière modification
                  </Typography>
                  <Typography variant="body2">
                    {formatDateTime(transaction.date_modification)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Créée par
                  </Typography>
                  <Typography variant="body2">
                    {transaction.id_utilisateur_creation
                      ? `Utilisateur #${transaction.id_utilisateur_creation}`
                      : '-'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Modifiée par
                  </Typography>
                  <Typography variant="body2">
                    {transaction.id_utilisateur_modification
                      ? `Utilisateur #${transaction.id_utilisateur_modification}`
                      : '-'}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Détails de la transaction */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Détails de la Transaction
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2}>
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

      {/* Historique d'audit */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Historique d'Audit (5 derniers)
            </Typography>
            <Button
              variant="outlined"
              startIcon={<HistoryIcon />}
              onClick={handleOpenAuditDialog}
            >
              Voir l'audit complet
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          {auditHistory.length > 0 ? (
            <Stack spacing={2}>
              {auditHistory.map((audit) => (
                <Paper key={audit.id_audit} variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        {audit.champ_modifie || 'Champ modifié'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Par: {audit.nom_utilisateur || audit.email_utilisateur || `Utilisateur #${audit.id_utilisateur}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Le: {formatDateTime(audit.date_changement)}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', gap: 2 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Ancienne valeur:
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {audit.ancienne_valeur || '-'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Nouvelle valeur:
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {audit.nouvelle_valeur || '-'}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Aucun historique d'audit disponible
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Modal d'audit complet */}
      <Dialog
        open={auditDialogOpen}
        onClose={handleCloseAuditDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon />
            <Typography variant="h6">Audit Complet de la Transaction #{transaction.id_transaction}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingFullAudit ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : fullAuditHistory.length > 0 ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {fullAuditHistory.map((audit) => (
                <Paper key={audit.id_audit} variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        {audit.champ_modifie || 'Champ modifié'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Par: {audit.nom_utilisateur || audit.email_utilisateur || `Utilisateur #${audit.id_utilisateur}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Le: {formatDateTime(audit.date_changement)}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', gap: 2 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Ancienne valeur:
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {audit.ancienne_valeur || '-'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Nouvelle valeur:
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {audit.nouvelle_valeur || '-'}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
              Aucun historique d'audit disponible
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAuditDialog}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TransactionDetail;
