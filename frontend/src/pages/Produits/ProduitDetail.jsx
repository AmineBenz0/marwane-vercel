import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  History as HistoryIcon,
  Inventory as InventoryIcon,
  Restore as RestoreIcon,
  ShoppingCart as ShoppingCartIcon,
} from '@mui/icons-material';
import { del, get, patch, put } from '../../services/api';
import useNotification from '../../hooks/useNotification';
import ProduitForm from './ProduitForm';

const formatCurrency = (value, maximumFractionDigits = 2) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits,
  }).format(amount);
};

const formatDate = (value) => {
  if (!value) return 'Aucun achat';
  return new Intl.DateTimeFormat('fr-FR').format(new Date(value));
};

const formatQuantity = (value) => Number(value || 0).toLocaleString('fr-FR');

const productTypeLabels = {
  matiere_premiere: 'Matière première',
  produit_fini: 'Produit fini',
  service: 'Service',
};

function ProduitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notification = useNotification();
  const [produit, setProduit] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fournisseursMap = useMemo(() => {
    const map = new Map();
    fournisseurs.forEach((fournisseur) => {
      map.set(fournisseur.id_fournisseur, fournisseur.nom_fournisseur);
    });
    return map;
  }, [fournisseurs]);

  const loadProduit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [produitData, transactionsData, fournisseursData] = await Promise.all([
        get(`/produits/${id}`),
        get('/transactions', {
          params: {
            id_produit: Number(id),
            est_actif: true,
            limit: 1000,
          },
        }),
        get('/fournisseurs', {
          params: {
            est_actif: true,
            limit: 1000,
          },
        }),
      ]);

      setProduit(produitData);
      setTransactions(transactionsData || []);
      setFournisseurs(fournisseursData || []);
    } catch (err) {
      setError(err?.message || 'Impossible de charger ce produit');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProduit();
  }, [loadProduit]);

  const insights = useMemo(() => {
    const achats = transactions.filter((transaction) => transaction.id_fournisseur !== null);
    const totalAchats = achats.reduce((sum, transaction) => sum + Number(transaction.montant_total || 0), 0);
    const quantiteAchetee = achats.reduce((sum, transaction) => sum + Number(transaction.quantite || 0), 0);
    const lastPurchase = [...achats].sort(
      (a, b) => new Date(b.date_transaction) - new Date(a.date_transaction)
    )[0];

    return {
      achats,
      totalAchats,
      quantiteAchetee,
      lastPurchase,
    };
  }, [transactions]);

  const fournisseurRows = useMemo(() => {
    const rows = new Map();

    insights.achats.forEach((transaction) => {
      const current = rows.get(transaction.id_fournisseur) || {
        id_fournisseur: transaction.id_fournisseur,
        nom_fournisseur: fournisseursMap.get(transaction.id_fournisseur) || `Fournisseur #${transaction.id_fournisseur}`,
        achats: 0,
        quantite: 0,
        total: 0,
        dernierPrix: 0,
        dernierAchat: null,
      };

      current.achats += 1;
      current.quantite += Number(transaction.quantite || 0);
      current.total += Number(transaction.montant_total || 0);

      if (
        !current.dernierAchat ||
        new Date(transaction.date_transaction) > new Date(current.dernierAchat)
      ) {
        current.dernierAchat = transaction.date_transaction;
        current.dernierPrix = Number(transaction.prix_unitaire || 0);
      }

      rows.set(transaction.id_fournisseur, current);
    });

    return [...rows.values()].sort((a, b) => new Date(b.dernierAchat) - new Date(a.dernierAchat));
  }, [insights.achats, fournisseursMap]);

  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);
    try {
      await put(`/produits/${id}`, data);
      setModalOpen(false);
      notification.success('Produit mis à jour');
      await loadProduit();
    } catch (err) {
      setFormError(err?.message || "Une erreur est survenue lors de l'enregistrement");
      throw err;
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setDeleteLoading(true);
    try {
      await del(`/produits/${id}`);
      setDeleteDialogOpen(false);
      notification.success('Produit désactivé');
      await loadProduit();
    } catch (err) {
      notification.error(err?.message || 'Erreur lors de la désactivation');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleReactivate = async () => {
    try {
      await patch(`/produits/${id}/reactivate`, {});
      notification.success('Produit réactivé');
      await loadProduit();
    } catch (err) {
      notification.error(err?.message || 'Erreur lors de la réactivation');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !produit) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/produits')} sx={{ mb: 2 }}>
          Retour aux produits
        </Button>
        <Alert severity="error">{error || 'Produit introuvable'}</Alert>
      </Box>
    );
  }

  // Egg production products are a legacy bridge identified by their
  // generated name. `pour_clients` is a transaction capability flag and is
  // true for ordinary finished products as well, so it must not control the
  // product detail workflow.
  const isEggProduct = produit.nom_produit?.trim().toLowerCase().startsWith('oeufs -');
  const lastSupplier = insights.lastPurchase
    ? fournisseursMap.get(insights.lastPurchase.id_fournisseur) || `Fournisseur #${insights.lastPurchase.id_fournisseur}`
    : 'Aucun achat';

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/produits')} variant="outlined" sx={{ mb: 2 }}>
            Retour aux produits achetés
          </Button>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Typography variant="h4" fontWeight={900}>
              {produit.nom_produit}
            </Typography>
            <Chip
              label={produit.est_actif ? 'Actif' : 'Inactif'}
              color={produit.est_actif ? 'success' : 'default'}
            />
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            {productTypeLabels[produit.type_produit] || 'Produit'} · référentiel unique et historique auditable.
          </Typography>
        </Box>

        {!isEggProduct && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignSelf: { sm: 'flex-end' } }}>
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setModalOpen(true)}>
              Modifier
            </Button>
            {produit.est_actif ? (
              <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => setDeleteDialogOpen(true)}>
                Désactiver
              </Button>
            ) : (
              <Button color="success" variant="contained" startIcon={<RestoreIcon />} onClick={handleReactivate}>
                Réactiver
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      {isEggProduct && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Les œufs sont suivis dans la section Production. Cette fiche reste accessible pour l&apos;historique, mais elle n&apos;est plus gérée dans le catalogue des produits achetés.
        </Alert>
      )}

      {!isEggProduct && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
            <InsightCard
              icon={<ShoppingCartIcon />}
              label="Total acheté"
              value={formatCurrency(insights.totalAchats, 0)}
              detail={`${insights.achats.length} achat${insights.achats.length > 1 ? 's' : ''}`}
              tone="warning"
            />
            <InsightCard
              icon={<InventoryIcon />}
              label="Quantité achetée"
              value={formatQuantity(insights.quantiteAchetee)}
              detail="Total enregistré"
              tone="primary"
            />
            <InsightCard
              icon={<HistoryIcon />}
              label="Dernier achat"
              value={formatDate(insights.lastPurchase?.date_transaction)}
              detail={lastSupplier}
              tone="info"
            />
            <InsightCard
              icon={<ShoppingCartIcon />}
              label="Fournisseurs"
              value={fournisseurRows.length}
              detail="Ont vendu ce produit"
              tone="success"
            />
          </Box>

          <Card variant="outlined" sx={{ borderRadius: 4, mb: 3 }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Typography variant="h6" fontWeight={900} sx={{ mb: 0.5 }}>
                Fournisseurs de ce produit
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Voir rapidement chez qui le produit a été acheté, avec le dernier prix et le total enregistré.
              </Typography>

              {fournisseurRows.length === 0 ? (
                <Alert severity="info">
                  Aucun achat fournisseur enregistré pour ce produit.
                </Alert>
              ) : (
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Fournisseur</TableCell>
                        <TableCell align="right">Dernier prix</TableCell>
                        <TableCell>Dernier achat</TableCell>
                        <TableCell align="right">Quantité totale</TableCell>
                        <TableCell align="right">Montant total</TableCell>
                        <TableCell align="right">Achats</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {fournisseurRows.map((row) => (
                        <TableRow key={row.id_fournisseur} hover>
                          <TableCell sx={{ fontWeight: 900 }}>{row.nom_fournisseur}</TableCell>
                          <TableCell align="right">{formatCurrency(row.dernierPrix, 2)}</TableCell>
                          <TableCell>{formatDate(row.dernierAchat)}</TableCell>
                          <TableCell align="right">{formatQuantity(row.quantite)}</TableCell>
                          <TableCell align="right">{formatCurrency(row.total, 0)}</TableCell>
                          <TableCell align="right">{row.achats}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 4 }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Typography variant="h6" fontWeight={900} sx={{ mb: 0.5 }}>
                Ce qu&apos;il faut retenir
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Cette fiche sert à comparer les achats d&apos;un même produit sans créer de doublons.
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1.5}>
                <BusinessLine label="Type" value={productTypeLabels[produit.type_produit] || 'Produit'} />
                <BusinessLine label="Statut" value={produit.est_actif ? 'Actif' : 'Inactif'} />
                <BusinessLine label="Dernier fournisseur" value={lastSupplier} />
              </Stack>
            </CardContent>
          </Card>
        </>
      )}

      <ProduitForm
        open={modalOpen}
        onClose={() => {
          if (!formLoading) {
            setModalOpen(false);
            setFormError(null);
          }
        }}
        onSubmit={handleSubmit}
        initialValues={produit}
        loading={formLoading}
        errorMessage={formError}
      />

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Désactiver ce produit ?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Le produit <strong>{produit.nom_produit}</strong> restera dans l&apos;historique, mais ne sera plus proposé dans les nouveaux achats.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>Annuler</Button>
          <Button onClick={handleDeactivate} color="error" variant="contained" disabled={deleteLoading}>
            Désactiver
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function InsightCard({ icon, label, value, detail, tone = 'primary' }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
      <CardContent>
        <Stack spacing={1}>
          <Box sx={{ color: `${tone}.main`, display: 'flex' }}>{icon}</Box>
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
            <Typography fontWeight={900} fontSize="1.25rem">{value}</Typography>
            <Typography variant="body2" color="text.secondary">{detail}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

InsightCard.propTypes = {
  icon: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  detail: PropTypes.string.isRequired,
  tone: PropTypes.string,
};

function BusinessLine({ label, value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography fontWeight={900} textAlign="right">{value || '-'}</Typography>
    </Box>
  );
}

BusinessLine.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
};

export default ProduitDetail;
