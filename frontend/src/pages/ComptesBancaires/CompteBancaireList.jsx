import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
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
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  AccountBalance as BankIcon,
  History as HistoryIcon,
  CompareArrows as TransferIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import compteBancaireService from '../../services/compteBancaireService';
import useNotification from '../../hooks/useNotification';

function CompteBancaireList() {
  const [comptes, setComptes] = useState([]);
  const [selectedCompte, setSelectedCompte] = useState(null);
  const [mouvements, setMouvements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMouv, setLoadingMouv] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const notification = useNotification();

  const [newCompte, setNewCompte] = useState({
    nom_banque: '',
    numero_compte: '',
    solde_initial: 0
  });

  const loadComptes = async () => {
    setLoading(true);
    try {
      const data = await compteBancaireService.getComptes();
      setComptes(data);
    } catch (err) {
      notification.error("Erreur lors du chargement des comptes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComptes();
  }, []);

  const handleOpenHistory = async (compte) => {
    setSelectedCompte(compte);
    setOpenHistory(true);
    setLoadingMouv(true);
    try {
      const data = await compteBancaireService.getMouvements(compte.id_compte);
      setMouvements(data);
    } catch (err) {
      notification.error("Erreur lors du chargement de l'historique");
    } finally {
      setLoadingMouv(false);
    }
  };

  const handleAddCompte = async () => {
    try {
      await compteBancaireService.createCompte(newCompte);
      notification.success("Compte bancaire ajouté");
      setOpenAdd(false);
      setNewCompte({ nom_banque: '', numero_compte: '', solde_initial: 0 });
      loadComptes();
    } catch (err) {
      notification.error("Erreur lors de la création du compte");
    }
  };

  const totalSolde = useMemo(() => {
    return comptes.reduce((sum, c) => sum + parseFloat(c.solde_actuel), 0);
  }, [comptes]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>🏦 Comptes Bancaires</Typography>
          <Typography variant="body2" color="text.secondary">Suivi de vos avoirs et mouvements bancaires</Typography>
        </Box>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          onClick={() => setOpenAdd(true)}
          sx={{ borderRadius: 2, px: 3 }}
        >
          Nouveau Compte
        </Button>
      </Box>

      {/* Résumé */}
      <Card sx={{ mb: 4, borderRadius: 3, bgcolor: 'primary.dark', color: 'white' }}>
        <CardContent sx={{ py: 3 }}>
          <Grid container alignItems="center" spacing={2}>
            <Grid item>
              <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 2 }}>
                <BankIcon fontSize="large" />
              </Box>
            </Grid>
            <Grid item xs>
              <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Solde Total Bancaire</Typography>
              <Typography variant="h3" fontWeight="bold">
                {totalSolde.toLocaleString()} <Typography component="span" variant="h5">MAD</Typography>
              </Typography>
            </Grid>
            <Grid item>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>{comptes.length} Comptes enregistrés</Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {comptes.map((compte) => (
            <Grid item xs={12} md={6} key={compte.id_compte}>
              <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" fontWeight="bold">{compte.nom_banque}</Typography>
                      <Typography variant="caption" color="text.secondary">{compte.numero_compte}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="h6" color="primary.main" fontWeight="bold">
                        {parseFloat(compte.solde_actuel).toLocaleString()} MAD
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Dernière opération : {format(new Date(compte.date_modification), 'dd MMM yyyy', { locale: fr })}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                    <Button 
                      fullWidth 
                      variant="outlined" 
                      startIcon={<HistoryIcon />} 
                      onClick={() => handleOpenHistory(compte)}
                      size="small"
                      sx={{ borderRadius: 1.5 }}
                    >
                      Historique
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Dialog Ajout Compte */}
      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 'bold' }}>Nouveau Compte Bancaire</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField 
                label="Nom de la Banque" 
                fullWidth 
                value={newCompte.nom_banque}
                onChange={(e) => setNewCompte({...newCompte, nom_banque: e.target.value})}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField 
                label="Numéro de Compte / RIB" 
                fullWidth 
                value={newCompte.numero_compte}
                onChange={(e) => setNewCompte({...newCompte, numero_compte: e.target.value})}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField 
                label="Solde Initial (MAD)" 
                type="number" 
                fullWidth 
                value={newCompte.solde_initial}
                onChange={(e) => setNewCompte({...newCompte, solde_initial: parseFloat(e.target.value)})}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenAdd(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleAddCompte} disabled={!newCompte.nom_banque}>Ajouter</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Historique Mouvements */}
      <Dialog open={openHistory} onClose={() => setOpenHistory(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Mouvements - {selectedCompte?.nom_banque}
          <Typography variant="h6" color="primary.main">{parseFloat(selectedCompte?.solde_actuel || 0).toLocaleString()} MAD</Typography>
        </DialogTitle>
        <DialogContent dividers>
          {loadingMouv ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Source</TableCell>
                    <TableCell>Référence</TableCell>
                    <TableCell align="right">Montant</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mouvements.length === 0 ? (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}>Aucun mouvement enregistré</TableCell></TableRow>
                  ) : (
                    mouvements.map((m) => (
                      <TableRow key={m.id_mouvement} hover>
                        <TableCell>{format(new Date(m.date_mouvement), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {m.type_mouvement === 'ENTREE' ? 
                              <TrendingUpIcon color="success" fontSize="small" /> : 
                              <TrendingDownIcon color="error" fontSize="small" />
                            }
                            <Typography variant="body2">{m.type_mouvement}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{m.source}</TableCell>
                        <TableCell>{m.reference || '-'}</TableCell>
                        <TableCell align="right" sx={{ 
                          fontWeight: 'bold', 
                          color: m.type_mouvement === 'ENTREE' ? 'success.main' : 'error.main' 
                        }}>
                          {m.type_mouvement === 'ENTREE' ? '+' : '-'}{parseFloat(m.montant).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenHistory(false)} variant="contained" sx={{ borderRadius: 2 }}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CompteBancaireList;
