import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { get } from '../../services/api';
import { formatShortDate } from '../../utils/dateFormatting';

export default function DeferredSaleHistory({ transactionId, refreshKey }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    get(`/transactions/${transactionId}/completion-history`).then(data => { if (!cancelled) setEvents(data || []); })
      .catch(err => { if (!cancelled) setError(err.message || 'Historique indisponible.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId, refreshKey, revision]);
  return <Box component="section" aria-label="Historique des compléments" sx={{ my: 3 }}>
    <Typography variant="h6" component="h2" fontWeight={800} gutterBottom>Historique des compléments</Typography>
    {loading ? <CircularProgress size={22} /> : error ? <Alert severity="warning" action={<Button onClick={() => setRevision(value => value + 1)}>Réessayer</Button>}>{error}</Alert> : !events.length ? <Typography color="text.secondary">Aucun complément enregistré.</Typography> : <Stack spacing={2}>
      {events.map(event => <Box key={event.id} sx={{ borderLeft: '3px solid', borderColor: 'primary.main', pl: 2 }}>
        <Typography fontWeight={700}>{formatShortDate(event.date)} · {event.quantite.toLocaleString('fr-FR')} œufs ajoutés</Typography>
        <Typography variant="body2" color="text.secondary">{event.quantite_couverte.toLocaleString('fr-FR')} œufs couverts après ce complément · {event.operateur || `Opérateur #${event.id_utilisateur}`}</Typography>
        {event.repartition_stock.length ? event.repartition_stock.map(source => <Typography variant="body2" key={source.id_production}>Production du {formatShortDate(source.date_production)} : {source.quantite.toLocaleString('fr-FR')} œufs</Typography>) : <Typography variant="caption">Répartition détaillée non enregistrée pour cet ancien complément.</Typography>}
      </Box>)}
    </Stack>}
  </Box>;
}
