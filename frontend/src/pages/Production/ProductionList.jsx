import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Factory as FactoryIcon,
  Egg as EggIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';
import { productionService, batimentService } from '../../services/productionService';
import useNotification from '../../hooks/useNotification';
import ProductionForm from './ProductionForm';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

function ProductionList() {
  const [productions, setProductions] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editingProduction, setEditingProduction] = useState(null);
  const notification = useNotification();

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodData, batData] = await Promise.all([
        productionService.getProductions({ limit: 50 }),
        batimentService.getBatiments(),
      ]);
      setProductions(prodData);
      setBatiments(batData);
    } catch (err) {
      notification.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdd = () => {
    setEditingProduction(null);
    setOpenForm(true);
  };

  const handleEdit = (prod) => {
    setEditingProduction(prod);
    setOpenForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Voulez-vous supprimer cet enregistrement ?")) {
      try {
        await productionService.deleteProduction(id);
        notification.success("Enregistrement supprimé");
        loadData();
      } catch (err) {
        notification.error("Erreur lors de la suppression");
      }
    }
  };

  // Calculs rapides pour le dashboard
  const stats = useMemo(() => {
    if (productions.length === 0) return { today: 0, cartons: 0 };
    const todayStr = new Date().toISOString().split('T')[0];
    const todayProds = productions.filter(p => p.date_production.startsWith(todayStr));
    return {
      total_oeufs: todayProds.reduce((sum, p) => sum + p.nombre_oeufs, 0),
      total_cartons: todayProds.reduce((sum, p) => sum + p.nombre_cartons, 0),
    };
  }, [productions]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>🐣 Suivi de Production</Typography>
          <Typography variant="body2" color="text.secondary">Gérez la collecte quotidienne par bâtiment</Typography>
        </Box>
        <Button 
          variant="contained" 
          size="large"
          startIcon={<AddIcon />} 
          onClick={handleAdd}
          sx={{ borderRadius: 2, px: 3 }}
        >
          Saisie Quotidienne
        </Button>
      </Box>

      {/* Résumé Rapide */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={0} sx={{ bgcolor: 'primary.50', borderRadius: 3 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ p: 1.5, bgcolor: 'primary.main', borderRadius: 2, color: 'white' }}>
                <InventoryIcon />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight="bold">{stats.total_oeufs}</Typography>
                <Typography variant="caption" color="text.secondary">Œufs aujourd'hui</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={0} sx={{ bgcolor: 'secondary.50', borderRadius: 3 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ p: 1.5, bgcolor: 'secondary.main', borderRadius: 2, color: 'white' }}>
                <FactoryIcon />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight="bold">{stats.total_cartons}</Typography>
                <Typography variant="caption" color="text.secondary">Cartons aujourd'hui</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Bâtiment</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Calibre</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Nombre</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Grammage</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Cartons</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {productions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    Aucun enregistrement trouvé
                  </TableCell>
                </TableRow>
              ) : (
                productions.map((p) => (
                  <TableRow key={p.id_production} hover>
                    <TableCell>{format(new Date(p.date_production), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FactoryIcon fontSize="inherit" color="action" />
                        {p.nom_batiment}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={p.type_oeuf} 
                        size="small" 
                        variant="outlined"
                        color={p.type_oeuf === 'normal' ? 'success' : 'warning'} 
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{p.calibre}</TableCell>
                    <TableCell align="right">{p.nombre_oeufs.toLocaleString()}</TableCell>
                    <TableCell align="right">{p.grammage}g</TableCell>
                    <TableCell align="right">
                      <Chip label={p.nombre_cartons} size="small" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }} />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => handleEdit(p)} color="primary">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDelete(p.id_production)} color="error">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {openForm && (
        <ProductionForm 
          open={openForm}
          onClose={() => setOpenForm(false)}
          onSuccess={() => {
            setOpenForm(false);
            loadData();
          }}
          initialData={editingProduction}
          batiments={batiments}
        />
      )}
    </Box>
  );
}


export default ProductionList;
