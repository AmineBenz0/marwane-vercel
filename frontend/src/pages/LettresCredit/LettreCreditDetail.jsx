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
import { formatShortDate } from '../../utils/dateFormatting';
import LCStatusBadge from '../../components/LCStatusBadge';
import useNotification from '../../hooks/useNotification';
import lettreCreditService from '../../services/lettreCreditService';
import { displayValue } from '../../components/Corrections/correctionValues';
import { get } from '../../services/api';
import LCCorrectionDialog from '../../components/Corrections/LCCorrectionDialog';
import useCorrectionRefresh from '../../components/Corrections/useCorrectionRefresh';
import { formatMontant } from '../../utils/formatNumber';

function LettreCreditDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notification = useNotification();

  const [lc, setLc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cessions, setCessions] = useState([]);
  const [correction, setCorrection] = useState(null);
  const [history, setHistory] = useState([]);
  const [usage, setUsage] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [reload, setReload] = useState(0);
  useCorrectionRefresh(() => setReload(v => v + 1));

  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      if (!lc) setLoading(true);
      try {
        const [data, allCessions, context] = await Promise.all([lettreCreditService.getById(id), lettreCreditService.getCessions(),
          get(`/lettres-credit/${id}/correction-context`).catch(err => ({ error: err.message }))]);
        if (!active) return;
        setLc(data);
        setHistory(context.history || []); setUsage(context.plan || null); setHistoryError(context.error || '');
        setCessions(allCessions.filter((cession) => cession.id_lc === parseInt(id, 10)));
      } catch (err) {
        if (!active) return;
        console.error('Erreur détails LC:', err);
        notification.error('Erreur lors du chargement des détails');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchDetails();
    return () => { active = false; };
    // lc is only consulted to retain the current page while refreshing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, notification, reload]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return formatShortDate(dateStr);
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
        <LCStatusBadge statut={lc.statut} statutCycle={lc.statut_cycle} estDisponible={lc.est_disponible} />
        <Button variant="outlined" onClick={() => setCorrection('correct')}>Corriger la LC</Button>
        {['transferee', 'deposee'].includes(lc.statut_cycle) && <Button color="error" onClick={() => setCorrection('cancel_usage')}>Annuler l’utilisation</Button>}
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
                  <Typography variant="caption" color="text.secondary">Date de réception</Typography>
                  <Typography>{formatDate(lc.date_reception)}</Typography>
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
                <Typography variant="caption" color="text.secondary">Client d'origine</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                  {lc.client_origine_nom || lc.detenteur_nom || '-'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Réception et utilisation</Typography>
          {(lc.receptions || []).map((receipt) => (
            <Alert key={`receipt-${receipt.id_paiement}`} severity={receipt.statut === 'annule' ? 'warning' : 'success'} sx={{ mb: 1 }}>
              Reçue du client d'origine · {formatDate(receipt.date_paiement)} · Paiement n° {receipt.id_paiement} · {receipt.statut}
            </Alert>
          ))}
          {(lc.utilisations || []).map((use) => (
            <Alert key={`use-${use.id_utilisation}`} severity={use.statut === 'annulee' ? 'warning' : 'info'} sx={{ mb: 1 }}>
              {use.type_utilisation === 'banque' ? `Déposée sur ${use.compte_banque_nom || `compte n° ${use.id_compte}`}` : `Transférée à ${use.fournisseur_nom || `fournisseur n° ${use.id_fournisseur}`}`}
              {' · '}{formatDate(use.date_utilisation)} · {formatMontant(lc.montant)} · {use.statut === 'annulee' ? 'Annulée' : 'Active'}
            </Alert>
          ))}
          {!lc.receptions?.length && <Alert severity="warning" sx={{ mb: 1 }}>Aucun paiement client par LC n'est lié à cette réception.</Alert>}
          {!lc.utilisations?.length && <Alert severity="info" sx={{ mb: 1 }}>Aucune utilisation sortante enregistrée.</Alert>}
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Depuis</TableCell>
                  <TableCell>Vers</TableCell>
                  <TableCell>État</TableCell>
                  <TableCell>Motif</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">Aucune cession enregistrée</TableCell>
                  </TableRow>
                ) : (
                  cessions.map((cession) => (
                    <TableRow key={cession.id_cession}>
                      <TableCell>{formatDate(cession.date_cession)}</TableCell>
                      <TableCell>{cession.nom_cedant}</TableCell>
                      <TableCell>{cession.nom_cessionnaire}</TableCell>
                      <TableCell>
                        {cession.id_cession_origine ? 'Contrepassation' : cessions.some(c => c.id_cession_origine === cession.id_cession) ? 'Annulée' : 'Active'}
                      </TableCell>
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
      <Box sx={{ mt: 3 }}>
        <Typography component="h2" variant="h6">Historique des corrections</Typography>
        {historyError && <Alert severity="error" action={<Button onClick={() => setReload(v => v + 1)}>Réessayer</Button>}>{historyError}</Alert>}
        {history.map(row => <Paper variant="outlined" key={row.operation_id} sx={{ p: 2, mt: 1 }}>
          <Typography>{formatDate(row.recorded_at)} · Utilisateur n° {row.actor_id}</Typography>
          <Typography sx={{ overflowWrap: 'anywhere' }}>{row.reason}</Typography>
          {Object.entries({ numero_reference: 'Référence LC', numero_serie: 'Numéro de série', banque_emettrice: 'Banque émettrice', montant: 'Montant', date_emission: 'Émission', date_disponibilite: 'Disponibilité', id_client: 'Client', id_fournisseur: 'Fournisseur', statut: 'État', notes: 'Notes' })
            .filter(([k]) => k === 'montant' ? Number(row.before[k]) !== Number(row.after[k]) : row.before[k] !== row.after[k])
            .map(([k, label]) => <Typography key={k} sx={{ overflowWrap: 'anywhere' }}>{label} : {k === 'statut' ? (row.before[k] === 'utilisee' ? 'Utilisée' : 'Disponible') : displayValue(k, row.before[k])} → {k === 'statut' ? (row.after[k] === 'utilisee' ? 'Utilisée' : 'Disponible') : displayValue(k, row.after[k])}</Typography>)}
          {row.impact?.usage_before?.date_effet !== row.impact?.date_effet && <Typography>Date d’utilisation : {formatDate(row.impact?.usage_before?.date_effet)} → {formatDate(row.impact?.date_effet)}</Typography>}
          {row.impact?.usage_before?.id_compte !== row.impact?.id_compte && <Typography>Compte : {row.impact?.usage_before?.id_compte || '—'} → {row.impact?.id_compte || '—'}</Typography>}
        </Paper>)}
        {!historyError && !history.length && <Typography color="text.secondary">Aucune correction enregistrée.</Typography>}
      </Box>
      {correction && <LCCorrectionDialog lc={lc} cancelUsage={correction === 'cancel_usage'} onClose={() => setCorrection(null)} onSaved={() => setCorrection(null)} />}
    </Box>
  );
}

export default LettreCreditDetail;

