import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { get } from '../../services/api';
import { formatShortDate } from '../../utils/dateFormatting';

const eggs = value => `${Number(value || 0).toLocaleString('fr-FR')} œufs`;

export default function DeferredSaleHistory({ transactionId, refreshKey, embedded = false }) {
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
  return <Box component="section" aria-label="Suivi du stock" sx={embedded ? { minWidth: 0 } : { my: 3, p: { xs: 2, sm: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
    {!embedded && <Typography variant="subtitle1" component="h2" fontWeight={700} sx={{ mb: 2 }}>Historique des réservations</Typography>}
    {loading ? <CircularProgress size={22} aria-label="Chargement du suivi du stock" /> : error ? <Alert severity="warning" action={<Button onClick={() => setRevision(value => value + 1)}>Réessayer</Button>}>{error}</Alert> : !events.length ? <Typography variant="body2" color="text.secondary">Aucun mouvement enregistré.</Typography> : <Stack spacing={2.5}>
      {events.map((event, index) => <Box component="article" key={event.id} sx={{ minWidth: 0, ...(index > 0 && { borderTop: '1px solid', borderColor: 'divider', pt: 2.5 }) }}>
        <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{event.type === 'initial' ? 'Complété à la création' : event.type === 'reservation' ? 'Stock réservé automatiquement' : event.type === 'completion' ? 'Livraison complétée' : event.type === 'reschedule' ? 'Date prévue modifiée' : event.type === 'cancel_remainder' ? 'Reste clôturé' : event.type === 'cancel_transaction' ? 'Vente annulée' : event.type === 'reactivate_transaction' ? 'Vente réactivée' : 'Mouvement de stock'}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{formatShortDate(event.date)}{event.type === 'reschedule' ? ` · ${event.date_avant ? formatShortDate(event.date_avant) : 'Sans date'} → ${formatShortDate(event.date_apres)}` : ''}{event.type === 'cancel_transaction' && event.raison ? ` · ${event.raison}` : ''}{event.type === 'cancel_transaction' && event.paiements_annules?.length ? ` · ${event.paiements_annules.length} paiement(s) annulé(s)` : ''}</Typography></Box>
          {Number(event.quantite) > 0 && <Typography variant="body2" fontWeight={700} color={event.type === 'cancel_remainder' ? 'text.secondary' : 'text.primary'} sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{event.type === 'cancel_remainder' ? `−${eggs(event.quantite)}` : eggs(event.quantite)}</Typography>}
        </Stack>
        {event.repartition_stock?.length ? <Stack spacing={1.25} sx={{ mt: 1.75, p: 1.5, bgcolor: 'grey.50', borderRadius: 1.5 }}>
          {event.repartition_stock.map(source => <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="baseline" key={source.id_production}>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>Production du {formatShortDate(source.date_production)}</Typography>
            <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{eggs(source.quantite)}</Typography>
          </Stack>)}
        </Stack> : Number(event.quantite) > 0 ? <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{event.type === 'initial' ? 'Répartition initiale non disponible.' : 'Répartition détaillée non enregistrée pour cet ancien ajout.'}</Typography> : null}
      </Box>)}
    </Stack>}
  </Box>;
}
