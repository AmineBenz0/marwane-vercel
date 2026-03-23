import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Divider,
  Button,
  Stack,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  SwapHoriz as SwapIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import lettreCreditService from '../../services/lettreCreditService';
import { formatMontant } from '../../utils/formatNumber';
import LCStatusBadge from '../../components/LCStatusBadge';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import useNotification from '../../hooks/useNotification';

/**
 * Page Détails d'une Lettre de Crédit.
 */
function LettreCreditDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notification = useNotification();
  
  const [lc, setLc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cessions, setCessions] = useState([]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const data = await lettreCreditService.getById(id);
      setLc(data);
      // Pour l'instant on filtre les cessions localement ou on ajoute un endpoint
      const allCessions = await lettreCreditService.getCessions();
      setCessions(allCessions.filter(c => c.id_lc === parseInt(id)));
    } catch (err) {
      console.error('Erreur détails LC:', err);
      notification.error('Erreur lors du chargement des détails');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: fr });
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
  if (!lc) return <Alert severity="error">Lettre de Crédit introuvable</Alert>;

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/lettres-credit')}>
          Retour
        </Button>
        <Typography variant="h4" component="h1">
          LC: {lc.numero_reference}
        </Typography>
        <LCStatusBadge statut={lc.statut} estDisponible={lc.est_disponible} />
      </Stack>

      <Grid container spacing={3}>
        {/* Infos principales */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Informations Générales</Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Banque Émettrice</Typography>
                  <Typography variant="body1">{lc.banque_emettrice}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Montant</Typography>
                  <Typography variant="h6" color="primary">{formatMontant(lc.montant)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Date Émission</Typography>
                  <Typography variant="body2">{formatDate(lc.date_emission)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Disponibilité</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{formatDate(lc.date_disponibilite)}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Détenteur actuel */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Détenteur Actuel</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  {lc.detenteur_nom}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Client
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Button 
                    variant="outlined" 
                    size="small" 
                    startIcon={<SwapIcon />}
                    disabled={lc.statut !== 'active'}
                    onClick={() => navigate(`/lettres-credit/${lc.id_lc}/ceder`)}
                  >
                    Céder cette LC
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Historique des cessions */}
        <Grid item xs={12}>
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Historique des Transferts</Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Cédant (Ancien)</TableCell>
                  <TableCell>Cessionnaire (Nouveau)</TableCell>
                  <TableCell>Motif</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">Aucun transfert enregistré</TableCell>
                  </TableRow>
                ) : (
                  cessions.map((c) => (
                    <TableRow key={c.id_cession}>
                      <TableCell>{formatDate(c.date_cession)}</TableCell>
                      <TableCell>{c.nom_cedant}</TableCell>
                      <TableCell>{c.nom_cessionnaire}</TableCell>
                      <TableCell>{c.motif || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        {/* Notes */}
        {lc.notes && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Notes</Typography>
                <Typography variant="body2">{lc.notes}</Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

export default LettreCreditDetail;
