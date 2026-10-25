import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { get } from '../../services/api';
import { formatShortDate } from '../../utils/dateFormatting';
import ExpandableDetails from '../../components/ExpandableDetails';

export default function DeferredSaleHistory({ transactionId, refreshKey }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    get(`/transactions/${transactionId}/completion-history`, { params: { include_initial: true } }).then(data => { if (!cancelled) setEvents(data || []); })
      .catch(err => { if (!cancelled) setError(err.message || 'Historique indisponible.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId, refreshKey, revision]);
  return <Box component="section" aria-label="Suivi du stock" sx={{ my: 3 }}>
    <Typography variant="h6" component="h2" fontWeight={800} gutterBottom>Suivi du stock</Typography>
    {loading ? <CircularProgress size={22} aria-label="Chargement du suivi du stock" /> : error ? <Alert severity="warning" action={<Button onClick={() => setRevision(value => value + 1)}>Réessayer</Button>}>{error}</Alert> : !events.length ? <Typography color="text.secondary">Aucun mouvement enregistré.</Typography> : <Stack spacing={2}>
      {events.map(event => <Box component="article" key={event.id} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
        <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
          <Box><Typography fontWeight={700}>{event.type === 'initial' ? 'Stock à la création' : 'Stock complété'}</Typography><Typography variant="caption" color="text.secondary">{formatShortDate(event.date)}</Typography></Box>
          <Typography fontWeight={700} sx={{ whiteSpace: 'nowrap' }}>{event.quantite.toLocaleString('fr-FR')} œufs</Typography>
        </Stack>
        <ExpandableDetails label="Origine du stock">
          {event.repartition_stock?.length ? event.repartition_stock.map(source => <Stack direction="row" spacing={2} justifyContent="space-between" key={source.id_production} sx={{ py: 0.5 }}>
            <Typography variant="body2">Production du {formatShortDate(source.date_production)}</Typography><Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{source.quantite.toLocaleString('fr-FR')} œufs</Typography>
          </Stack>) : event.quantite > 0 ? <Typography variant="body2" color="text.secondary">{event.type === 'initial' ? 'Répartition initiale non disponible.' : 'Répartition détaillée non enregistrée pour cet ancien complément.'}</Typography> : null}
          {(event.operateur || event.id_utilisateur) && <Typography variant="caption" color="text.secondary">{event.operateur || `Opérateur #${event.id_utilisateur}`}</Typography>}
        </ExpandableDetails>
      </Box>)}
    </Stack>}
  </Box>;
}
