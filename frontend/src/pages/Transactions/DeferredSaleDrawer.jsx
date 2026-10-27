import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import { get } from '../../services/api';
import { formatShortDate } from '../../utils/dateFormatting';
import { formatMontant } from '../../utils/formatNumber';
import DeferredSaleStatusBadge from './DeferredSaleStatusBadge';
import DeferredSaleHistory from './DeferredSaleHistory';
import ExpandableDetails from '../../components/ExpandableDetails';

const number = value => Number(value || 0).toLocaleString('fr-FR');
const money = value => formatMontant(value, { useCompactNotation: false });
const Row = ({ label, value }) => <Stack direction="row" justifyContent="space-between" spacing={2}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700} sx={{ textAlign: 'right' }}>{value}</Typography></Stack>;

export default function DeferredSaleDrawer({ transactionId, summary, onClose }) {
  const navigate = useNavigate();
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!transactionId) return undefined;
    let cancelled = false;
    setLoading(true); setError('');
    get(`/transactions/${transactionId}`).then(data => { if (!cancelled) setSale(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'Impossible de charger cette vente.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId, revision]);
  useEffect(() => {
    if (!transactionId) return undefined;
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [transactionId]);
  return <Drawer anchor="right" open={!!transactionId} onClose={onClose} PaperProps={{ role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'delivery-sale-title', sx: { width: { xs: '100%', sm: 480 }, maxWidth: '100%', bgcolor: 'background.paper', color: 'text.primary' } }}>
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography component="h2" variant="h5" fontWeight={800} id="delivery-sale-title">Vente #{transactionId}</Typography>
        <IconButton aria-label="Fermer le détail" onClick={onClose}><Close /></IconButton>
      </Stack>
      {loading ? <CircularProgress aria-label="Chargement du détail de la vente" /> : error ? <Alert severity="warning" action={<Button onClick={() => setRevision(value => value + 1)}>Réessayer</Button>}>{error}</Alert> : sale && <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{summary?.nom_client || `Client #${sale.id_client}`}</Typography>
          <Typography variant="body2" color="text.secondary">{summary?.nom_produit || `Produit #${sale.id_produit}`}{summary?.nom_batiment || sale.nom_batiment_source ? ` · ${summary?.nom_batiment || sale.nom_batiment_source}` : ''}</Typography>
          <Box sx={{ mt: 1.5 }}><DeferredSaleStatusBadge sale={sale} /></Box>
        </Box>
        <Stack spacing={1} divider={<Divider />}>
          <Row label="Œufs vendus" value={number(sale.quantite)} />
          <Row label="Réservés" value={number(sale.quantite_couverte)} />
          <Row label="À produire" value={number(sale.quantite_en_attente)} />
        </Stack>
        <Box component="section" aria-label="Production utilisée">
          <Typography component="h3" variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Production utilisée</Typography>
          {sale.repartition_stock?.length ? <Stack spacing={1}>{[...sale.repartition_stock].sort((a, b) => a.date_production.localeCompare(b.date_production)).map(source => <Row key={source.id_production} label={formatShortDate(source.date_production)} value={`${number(source.quantite)} œufs`} />)}</Stack> : <Typography variant="body2" color="text.secondary">{Number(sale.quantite_couverte) === 0 ? 'Aucun stock réservé pour le moment.' : 'Répartition par date indisponible.'}</Typography>}
        </Box>
        <Stack spacing={1}>
          <Row label="Date de vente" value={formatShortDate(sale.date_transaction)} />
          <Row label="Livraison prévue" value={formatShortDate(sale.date_livraison_prevue)} />
        </Stack>
        <Box component="section" aria-label="Paiement de la vente">
          <Typography component="h3" variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Paiement</Typography>
          <Stack spacing={1}><Row label="Total" value={money(sale.montant_total)} /><Row label="Payé" value={money(sale.montant_paye)} /><Row label="Reste à encaisser" value={money(sale.montant_restant)} /></Stack>
          <Button variant="outlined" onClick={() => navigate(`/transactions/${transactionId}?from=deliveries`)} sx={{ mt: 2 }}>Ouvrir la vente et ses paiements</Button>
        </Box>
        <ExpandableDetails label="Historique des réservations"><DeferredSaleHistory transactionId={transactionId} refreshKey={revision} /></ExpandableDetails>
      </Stack>}
    </Box>
  </Drawer>;
}
