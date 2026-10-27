import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, Grid, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { ArrowBack, ArrowForward, Search } from '@mui/icons-material';
import { formatShortDate } from '../../utils/dateFormatting';
import useDeferredSales from './useDeferredSales';
import DeferredSaleDrawer from './DeferredSaleDrawer';

const number = value => Number(value || 0).toLocaleString('fr-FR');
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const todayInMorocco = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function DeferredSalesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const { sales, loading, error, reload } = useDeferredSales();
  const pending = useMemo(() => sales.filter(sale => sale.est_actif !== false && Number(sale.quantite_en_attente) > 0)
    .sort((a, b) => (a.date_livraison_prevue || '9999').localeCompare(b.date_livraison_prevue || '9999') || a.id_transaction - b.id_transaction), [sales]);
  const visible = pending.filter(sale => normalize(sale.nom_client).includes(normalize(search.trim())));
  const remaining = pending.reduce((total, sale) => total + Number(sale.quantite_en_attente), 0);
  const selectedId = /^\d+$/.test(params.get('vente') || '') ? Number(params.get('vente')) : null;
  const selected = sales.find(sale => sale.id_transaction === selectedId);
  const today = todayInMorocco();
  const openSale = id => { const next = new URLSearchParams(params); next.set('vente', id); setParams(next); };
  const closeSale = () => { const next = new URLSearchParams(params); next.delete('vente'); setParams(next, { replace: true }); };
  return <Box sx={{ minWidth: 0 }}>
    <Button startIcon={<ArrowBack />} variant="outlined" onClick={() => navigate('/dashboard')} sx={{ mb: 2 }}>Retour à l’accueil</Button>
    <Typography component="h1" variant="h4" fontWeight={800} sx={{ mb: 1 }}>Livraisons à suivre</Typography>
    {!error && (!loading || pending.length > 0) && <Typography color="text.secondary" sx={{ mb: 3 }}>
      {number(pending.length)} {pending.length === 1 ? 'vente' : 'ventes'} · {number(remaining)} {remaining === 1 ? 'œuf' : 'œufs'} à produire
    </Typography>}
    {error ? <Alert severity="warning" action={<Button onClick={reload}>Réessayer</Button>}>{error}</Alert> : <>
      <TextField value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher un client" inputProps={{ 'aria-label': 'Rechercher un client' }} size="small"
        InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ mb: 3, width: { xs: '100%', sm: 320 } }} />
      {loading && <Box sx={{ mb: 2 }}><CircularProgress size={22} aria-label="Chargement des livraisons" /></Box>}
      {!loading && pending.length === 0 ? <Alert severity="success">Aucune livraison en attente de production.</Alert> : !loading && visible.length === 0 ? <Typography role="status">Aucun client trouvé.</Typography> : <Grid container spacing={2} aria-busy={loading}>
        {visible.map(sale => {
          const expected = sale.date_livraison_prevue;
          const overdue = expected && expected < today;
          return <Grid item xs={12} md={6} xl={4} key={sale.id_transaction}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardActionArea onClick={() => openSale(sale.id_transaction)} aria-label={`Voir le détail de la vente #${sale.id_transaction} — ${sale.nom_client}`} sx={{ height: '100%', textAlign: 'left' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Vente #{sale.id_transaction}</Typography>
                    {(overdue || expected === today) && <Chip size="small" variant="outlined" label={overdue ? 'En retard' : 'Aujourd’hui'} sx={{ bgcolor: 'action.hover', color: 'text.primary', borderColor: overdue ? 'warning.main' : 'divider' }} />}
                  </Stack>
                  <Typography component="h2" variant="h6" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{sale.nom_client}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, overflowWrap: 'anywhere' }}>{sale.nom_produit}{sale.nom_batiment ? ` · ${sale.nom_batiment}` : ''}</Typography>
                  <Typography fontWeight={700}>{number(sale.quantite_couverte)} réservés · {number(sale.quantite_en_attente)} à produire</Typography>
                  {expected && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Prévue le {formatShortDate(expected)}</Typography>}
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 2, px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700 }}>Voir le détail <ArrowForward fontSize="small" /></Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>;
        })}
      </Grid>}
    </>}
    <DeferredSaleDrawer key={selectedId || 'closed'} transactionId={selectedId} summary={selected} onClose={closeSale} />
  </Box>;
}
