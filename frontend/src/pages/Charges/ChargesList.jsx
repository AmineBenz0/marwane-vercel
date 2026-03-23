import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
  Chip,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FilterList as FilterListIcon,
} from '@mui/icons-material';
import chargeService from '../../services/chargeService';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { formatMontant } from '../../utils/formatNumber';
import useNotification from '../../hooks/useNotification';

const CATEGORIES = [
  'Fixe (Loyer, Salaire...)',
  'Variable (Électricité, Eau...)',
  'Maintenance / Réparation',
  'Administration',
  'Taxes',
  'Divers',
];

function ChargesList() {
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);
  const [formData, setFormData] = useState({
    libelle: '',
    montant: '',
    date_charge: format(new Date(), 'yyyy-MM-dd'),
    categorie: 'Divers',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const notification = useNotification();

  const fetchCharges = async () => {
    setLoading(true);
    try {
      const data = await chargeService.getAll();
      setCharges(data || []);
    } catch (err) {
      console.error('Erreur chargement charges:', err);
      notification.error('Erreur lors du chargement des dépenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCharges();
  }, []);

  const handleOpenDialog = (charge = null) => {
    if (charge) {
      setEditingCharge(charge);
      setFormData({
        libelle: charge.libelle,
        montant: charge.montant,
        date_charge: charge.date_charge,
        categorie: charge.categorie,
        notes: charge.notes || '',
      });
    } else {
      setEditingCharge(null);
      setFormData({
        libelle: '',
        montant: '',
        date_charge: format(new Date(), 'yyyy-MM-dd'),
        categorie: 'Divers',
        notes: '',
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingCharge) {
        await chargeService.update(editingCharge.id_charge, formData);
        notification.success('Dépense mise à jour avec succès');
      } else {
        await chargeService.create(formData);
        notification.success('Dépense enregistrée avec succès');
      }
      handleCloseDialog();
      fetchCharges();
    } catch (err) {
      console.error('Erreur soumission charge:', err);
      notification.error('Erreur lors de l\'enregistrement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette dépense ? Cela supprimera aussi le mouvement de caisse associé.')) return;
    try {
      await chargeService.delete(id);
      notification.success('Dépense supprimée');
      fetchCharges();
    } catch (err) {
      console.error('Erreur suppression charge:', err);
      notification.error('Erreur lors de la suppression');
    }
  };

  const getCategoryColor = (cat) => {
    if (cat.startsWith('Fixe')) return 'primary';
    if (cat.startsWith('Variable')) return 'secondary';
    if (cat.startsWith('Maintenance')) return 'warning';
    return 'default';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Dépenses Standalone
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Nouvelle Dépense
        </Button>
      </Box>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : charges.length === 0 ? (
            <Alert severity="info">Aucune dépense enregistrée</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead sx={{ bgcolor: 'grey.50' }}>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Libellé</TableCell>
                    <TableCell>Catégorie</TableCell>
                    <TableCell align="right">Montant</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {charges.map((charge) => (
                    <TableRow key={charge.id_charge} hover>
                      <TableCell>
                        {format(new Date(charge.date_charge), 'dd MMM yyyy', { locale: fr })}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{charge.libelle}</TableCell>
                      <TableCell>
                        <Chip 
                          label={charge.categorie} 
                          size="small" 
                          color={getCategoryColor(charge.categorie)}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {formatMontant(charge.montant)}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                        {charge.notes || '-'}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => handleOpenDialog(charge)} color="primary">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDelete(charge.id_charge)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle>
            {editingCharge ? 'Modifier la dépense' : 'Enregistrer une nouvelle dépense'}
          </DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Libellé / Description"
                  required
                  value={formData.libelle}
                  onChange={(e) => setFormData({ ...formData, libelle: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Montant"
                  type="number"
                  required
                  inputProps={{ step: '0.01', min: '0.01' }}
                  value={formData.montant}
                  onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Date"
                  type="date"
                  required
                  InputLabelProps={{ shrink: true }}
                  value={formData.date_charge}
                  onChange={(e) => setFormData({ ...formData, date_charge: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="Catégorie"
                  required
                  value={formData.categorie}
                  onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                >
                  {CATEGORIES.map((cat) => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes additionnelles"
                  multiline
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </Grid>
            </Grid>
            <Alert severity="warning" sx={{ mt: 2 }}>
              Cette opération générera automatiquement un mouvement de SORTIE dans la caisse.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Annuler</Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={submitting}
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}

export default ChargesList;
