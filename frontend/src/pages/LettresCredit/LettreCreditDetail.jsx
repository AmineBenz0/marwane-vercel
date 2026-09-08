import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import LCStatusBadge from '../../components/LCStatusBadge';
import useNotification from '../../hooks/useNotification';
import lettreCreditService from '../../services/lettreCreditService';
import { formatMontant } from '../../utils/formatNumber';

function LettreCreditDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notification = useNotification();

  const [lc, setLc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cessions, setCessions] = useState([]);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const data = await lettreCreditService.getById(id);
        const allCessions = await lettreCreditService.getCessions();
        setLc(data);
        setCessions(allCessions.filter((cession) => cession.id_lc === parseInt(id, 10)));
      } catch (err) {
        console.error('Erreur détails LC:', err);
        notification.error('Erreur lors du chargement des détails');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [id, notification]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: fr });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!lc) return <Alert severity="error">Lettre de crédit introuvable</Alert>;

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/lettres-credit')}>
          Retour
        </Button>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 900 }}>
          LC: {lc.numero_reference}
        </Typography>
        <LCStatusBadge statut={lc.statut} estDisponible={lc.est_disponible} />
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Informations générales</Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Banque</Typography>
                  <Typography>{lc.banque_emettrice || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Montant</Typography>
                  <Typography variant="h6" color="primary">{formatMontant(lc.montant)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Date d'émission</Typography>
                  <Typography>{formatDate(lc.date_emission)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Disponible le</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{formatDate(lc.date_disponibilite)}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Situation actuelle</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">Client / détenteur</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                  {lc.detenteur_nom || '-'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Cette LC reste disponible jusqu'à son versement en banque ou son utilisation pour payer un fournisseur.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Historique d'utilisation</Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Depuis</TableCell>
                  <TableCell>Vers</TableCell>
                  <TableCell>Motif</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">Aucune utilisation enregistrée</TableCell>
                  </TableRow>
                ) : (
                  cessions.map((cession) => (
                    <TableRow key={cession.id_cession}>
                      <TableCell>{formatDate(cession.date_cession)}</TableCell>
                      <TableCell>{cession.nom_cedant}</TableCell>
                      <TableCell>{cession.nom_cessionnaire}</TableCell>
                      <TableCell>{cession.motif || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

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
