import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardContent,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon,
  SwapHoriz as SwapIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import lettreCreditService from '../../services/lettreCreditService';
import LCStatusBadge from '../../components/LCStatusBadge';
import { formatMontant } from '../../utils/formatNumber';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import useNotification from '../../hooks/useNotification';

/**
 * Page Liste des Lettres de Crédit.
 */
function LettresCreditList() {
  const navigate = useNavigate();
  const notification = useNotification();
  
  const [lcs, setLcs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const fetchLcs = async () => {
    setLoading(true);
    try {
      const data = await lettreCreditService.getAll();
      setLcs(data || []);
    } catch (err) {
      console.error('Erreur chargement LC:', err);
      notification.error('Erreur lors du chargement des Lettres de Crédit');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLcs();
  }, []);

  const filteredLcs = lcs.filter(lc => 
    lc.numero_reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lc.banque_emettrice.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lc.detenteur_nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: fr });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Lettres de Crédit
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/lettres-credit/nouvelle')}
        >
          Nouvelle LC
        </Button>
      </Box>

      {/* Résumé / Filtres */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            placeholder="Rechercher par référence, banque ou détenteur..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
            <Box textAlign="center">
              <Typography variant="caption" color="text.secondary">Total</Typography>
              <Typography variant="h6">{lcs.length}</Typography>
            </Box>
            <Box textAlign="center">
              <Typography variant="caption" color="text.secondary">Actives</Typography>
              <Typography variant="h6" color="success.main">
                {lcs.filter(l => l.statut === 'active').length}
              </Typography>
            </Box>
            <Box textAlign="center">
              <Typography variant="caption" color="text.secondary">Utilisées</Typography>
              <Typography variant="h6" color="text.secondary">
                {lcs.filter(l => l.statut === 'utilisee').length}
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Référence</TableCell>
              <TableCell>Banque</TableCell>
              <TableCell>Détenteur</TableCell>
              <TableCell align="right">Montant</TableCell>
              <TableCell>Disponibilité</TableCell>
              <TableCell>Expiration</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                  Chargement...
                </TableCell>
              </TableRow>
            ) : filteredLcs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                  Aucune Lettre de Crédit trouvée
                </TableCell>
              </TableRow>
            ) : (
              filteredLcs.map((lc) => (
                <TableRow key={lc.id_lc} hover>
                  <TableCell sx={{ fontWeight: 'bold' }}>{lc.numero_reference}</TableCell>
                  <TableCell>{lc.banque_emettrice}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{lc.detenteur_nom}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                      ({lc.type_detenteur})
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    {formatMontant(lc.montant)}
                  </TableCell>
                  <TableCell>{formatDate(lc.date_disponibilite)}</TableCell>
                  <TableCell>{formatDate(lc.date_expiration)}</TableCell>
                  <TableCell>
                    <LCStatusBadge statut={lc.statut} estDisponible={lc.est_disponible} />
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={1} justifyContent="center">
                      <Tooltip title="Voir les détails">
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => navigate(`/lettres-credit/${lc.id_lc}`)}
                        >
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                      {lc.statut === 'active' && (
                        <Tooltip title="Céder (Transférer)">
                          <IconButton 
                            size="small" 
                            color="warning"
                            onClick={() => navigate(`/lettres-credit/${lc.id_lc}/ceder`)}
                          >
                            <SwapIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default LettresCreditList;
