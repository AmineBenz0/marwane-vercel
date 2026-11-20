import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import {
  Add as AddIcon,
  AccountBalanceWallet as WalletIcon,
  CallMade as ToPayIcon,
  CallReceived as ToCollectIcon,
  Factory as FactoryIcon,
  MoneyOff as ExpenseIcon,
  ShoppingCart as PurchaseIcon,
  Storefront as SaleIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { addDays, format, parseISO, startOfWeek, subWeeks } from 'date-fns';
import { formatShortDate } from '../utils/dateFormatting';
import { getBusinessDateInput } from '../utils/businessDate';
import { get } from '../services/api';
import DeferredSalesCard from './Transactions/DeferredSalesCard';
import { loadTransactionPages } from './Transactions/transactionPages';
import { formatMontant, formatSimpleNumber } from '../utils/formatNumber';
import { formatNumberForAxis } from '../utils/formatNumberForChart';
import PageHeader from '../components/Layout/PageHeader';

// Chart colours, validated for colour-blind readers (teal = ventes, burnt orange = achats).
const SALES_COLOR = '#0D9488';
const PURCHASES_COLOR = '#C2410C';
const WEEKS_SHOWN = 5;

const QUICK_ACTIONS = [
  { label: 'Nouvelle vente', icon: <SaleIcon />, path: '/transactions?nouveau=vente' },
  { label: 'Nouvel achat', icon: <PurchaseIcon />, path: '/transactions?nouveau=achat' },
  { label: 'Nouvelle dépense', icon: <ExpenseIcon />, path: '/charges?nouveau=1' },
];

const isSale = (transaction) => transaction.id_client !== null && transaction.id_client !== undefined;
const netAmount = (transaction) => Math.abs(Number(transaction.montant_net ?? transaction.montant_total ?? 0));

/** Sales and purchases per week (Monday to Sunday), oldest week first. */
const groupTransactionsByWeek = (transactions, today) => {
  const firstWeek = startOfWeek(subWeeks(today, WEEKS_SHOWN - 1), { weekStartsOn: 1 });
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, index) => {
    const start = addDays(firstWeek, index * 7);
    return {
      weekKey: format(start, 'yyyy-MM-dd'),
      label: `Sem. du ${format(start, 'dd/MM')}`,
      ventes: 0,
      achats: 0,
    };
  });
  transactions.forEach((transaction) => {
    if (!transaction.date_transaction) return;
    const key = format(startOfWeek(parseISO(transaction.date_transaction), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const week = weeks.find((item) => item.weekKey === key);
    if (!week) return;
    if (isSale(transaction)) week.ventes += netAmount(transaction);
    else week.achats += netAmount(transaction);
  });
  return weeks;
};

function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState({
    argentDisponible: 0,
    aEncaisser: 0,
    aPayer: 0,
    ventesMois: 0,
    achatsMois: 0,
    oeufs: 0,
    cartons: 0,
    weeks: [],
    recent: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = parseISO(getBusinessDateInput());
      const todayKey = format(today, 'yyyy-MM-dd');
      const rangeStart = startOfWeek(subWeeks(today, WEEKS_SHOWN - 1), { weekStartsOn: 1 });

      const [solde, transactions, productions, report, clients, fournisseurs] = await Promise.all([
        get('/caisse/solde/complet'),
        loadTransactionPages(get, {
          date_debut: format(rangeStart, 'yyyy-MM-dd'),
          date_fin: todayKey,
          est_actif: true,
        }, 1000),
        get('/productions', { params: { date_debut: todayKey, date_fin: todayKey } }),
        get('/reports/monthly', { params: { month: format(today, 'yyyy-MM') } }),
        get('/clients', { params: { limit: 1000 } }),
        get('/fournisseurs', { params: { limit: 1000 } }),
      ]);

      const clientNames = new Map((clients || []).map((c) => [c.id_client, c.nom_client]));
      const fournisseurNames = new Map((fournisseurs || []).map((f) => [f.id_fournisseur, f.nom_fournisseur]));
      const rows = transactions || [];
      const productionsToday = productions || [];

      setData({
        argentDisponible: Number(solde?.solde_reel ?? solde?.solde_theorique ?? 0),
        aEncaisser: Math.max(0, Number(solde?.creances_clients ?? 0)),
        aPayer: Math.max(0, Number(solde?.dettes_fournisseurs ?? 0)),
        ventesMois: Number(report?.ventes_nettes ?? report?.ventes ?? 0),
        achatsMois: Number(report?.achats ?? 0),
        oeufs: productionsToday.reduce((sum, p) => sum + (p.nombre_oeufs || 0), 0),
        cartons: productionsToday.reduce((sum, p) => sum + (p.nombre_cartons || 0), 0),
        weeks: groupTransactionsByWeek(rows, today),
        recent: [...rows]
          .sort((a, b) => (b.date_transaction || '').localeCompare(a.date_transaction || '')
            || Number(b.id_transaction || 0) - Number(a.id_transaction || 0))
          .slice(0, 5)
          .map((transaction) => ({
            ...transaction,
            partnerName: isSale(transaction)
              ? (clientNames.get(transaction.id_client) || `Client n° ${transaction.id_client}`)
              : (fournisseurNames.get(transaction.id_fournisseur) || `Fournisseur n° ${transaction.id_fournisseur}`),
          })),
      });
    } catch (err) {
      console.error('Erreur lors du chargement du dashboard:', err);
      setError(err.message || 'Une erreur est survenue lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  // Money alerts only: today's production has its own card next to this one.
  const alerts = useMemo(() => {
    if (loading || error) return [];
    const items = [];
    if (data.argentDisponible < 0) {
      items.push({
        title: 'Solde de caisse négatif',
        description: 'La caisse demande une vérification rapide.',
        action: 'Voir la caisse',
        path: '/caisse',
        color: '#A84435',
      });
    }
    if (data.achatsMois > data.ventesMois) {
      items.push({
        title: 'Plus d’achats que de ventes ce mois-ci',
        description: 'Le mois est en sortie nette pour le moment.',
        action: 'Voir le mois',
        path: '/rapports/mensuel',
        color: '#A96522',
      });
    }
    return items;
  }, [data, loading, error]);

  const noProductionYet = !loading && !error && data.oeufs === 0;

  return (
    <Box sx={{ maxWidth: 1480, mx: 'auto', pb: 3 }}>
      <PageHeader
        title="Accueil quotidien"
        description="Les priorités du jour, l’argent et la production au même endroit."
      />

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={<Button color="inherit" onClick={() => setReloadKey((value) => value + 1)}>Réessayer</Button>}
        >
          {error}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={7}>
          <SectionCard title="À traiter maintenant" subtitle="Les points importants avant de continuer la journée.">
            <Stack spacing={1.5}>
              <DeferredSalesCard />
              {loading ? (
                <Skeleton variant="rounded" height={72} />
              ) : alerts.length > 0 ? alerts.map((alert) => (
                <Box
                  key={alert.title}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: 'auto 1fr', sm: 'auto 1fr auto' },
                    gap: 1.5,
                    alignItems: 'center',
                    p: { xs: 1.5, md: 2 },
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: alpha(alert.color, 0.3),
                    backgroundColor: '#FFFCF6',
                  }}
                >
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: alert.color }} />
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{alert.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{alert.description}</Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={() => navigate(alert.path)}
                    sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
                  >
                    {alert.action}
                  </Button>
                </Box>
              )) : !error && (
                <Typography color="text.secondary">Rien d’urgent pour le moment.</Typography>
              )}
            </Stack>
          </SectionCard>
        </Grid>

        <Grid item xs={12} lg={5}>
          <SectionCard title="Production aujourd’hui" subtitle="La collecte du jour, tous bâtiments." icon={<FactoryIcon sx={{ color: '#A96522' }} />}>
            <Grid container spacing={1.5}>
              {[['Œufs', data.oeufs, '#F8E8CC', '#7A4A12'], ['Cartons', data.cartons, '#E0F1E7', '#1D6F50']].map(([label, value, bg, fg]) => (
                <Grid item xs={6} key={label}>
                  <Box sx={{ p: 2, borderRadius: 2, backgroundColor: bg }}>
                    <Typography variant="caption" sx={{ color: fg, fontWeight: 800 }}>{label}</Typography>
                    {loading
                      ? <Skeleton width="60%" height={40} />
                      : <Typography sx={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1.1 }}>{formatSimpleNumber(value)}</Typography>}
                  </Box>
                </Grid>
              ))}
            </Grid>
            {noProductionYet && (
              <Typography variant="body2" sx={{ mt: 1.5, color: '#7A4A12', fontWeight: 700 }}>
                Aucune collecte saisie aujourd’hui.
              </Typography>
            )}
            <Button
              fullWidth
              variant={noProductionYet ? 'contained' : 'outlined'}
              startIcon={noProductionYet ? <AddIcon /> : null}
              onClick={() => navigate('/production')}
              sx={{ mt: 1.5, minHeight: 44 }}
            >
              {noProductionYet ? 'Saisir la production' : 'Voir la production'}
            </Button>
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            label="Argent disponible"
            value={formatMontant(data.argentDisponible, { useCompactNotation: false })}
            helper="Caisse et lettres de crédit utilisables"
            icon={<WalletIcon />}
            color={data.argentDisponible < 0 ? '#A84435' : '#1D6F50'}
            loading={loading}
            onClick={() => navigate('/caisse')}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            label="À encaisser"
            value={formatMontant(data.aEncaisser, { useCompactNotation: false })}
            helper="Ce que les clients doivent encore"
            icon={<ToCollectIcon />}
            color="#A96522"
            loading={loading}
            onClick={() => navigate('/creances')}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            label="À payer"
            value={formatMontant(data.aPayer, { useCompactNotation: false })}
            helper="Ce qui reste à payer aux fournisseurs"
            icon={<ToPayIcon />}
            color="#A84435"
            loading={loading}
            onClick={() => navigate('/dettes')}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            label="Ventes du mois"
            value={formatMontant(data.ventesMois, { useCompactNotation: false })}
            helper="Ventes nettes du mois, avoirs à leur date d’émission"
            icon={<TrendingUpIcon />}
            color="#315F85"
            loading={loading}
            onClick={() => navigate('/rapports/mensuel')}
          />
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
        {QUICK_ACTIONS.map((action) => (
          <Button
            key={action.label}
            variant="outlined"
            startIcon={action.icon}
            onClick={() => navigate(action.path)}
            sx={{ minHeight: 48, flex: { sm: 1 }, justifyContent: { xs: 'flex-start', sm: 'center' } }}
          >
            {action.label}
          </Button>
        ))}
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={7}>
          <SectionCard
            title="Ventes et achats par semaine"
            subtitle={`Les ${WEEKS_SHOWN} dernières semaines, montants nets.`}
            action={<Button onClick={() => navigate('/transactions')}>Voir le détail</Button>}
          >
            <Stack direction="row" spacing={2.5} sx={{ mb: 1.5 }} aria-hidden="true">
              {[['Ventes', SALES_COLOR], ['Achats', PURCHASES_COLOR]].map(([label, color]) => (
                <Stack key={label} direction="row" spacing={0.75} alignItems="center">
                  <Box sx={{ width: 12, height: 12, borderRadius: 0.5, backgroundColor: color }} />
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                </Stack>
              ))}
            </Stack>
            {loading ? <Skeleton variant="rounded" height={260} /> : (
              <Box sx={{ width: '100%', height: 260 }} role="img" aria-label="Ventes et achats par semaine">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weeks} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
                    <CartesianGrid vertical={false} stroke="#EEF1EF" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#69736D' }} />
                    <YAxis width={56} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#69736D' }} tickFormatter={(value) => formatNumberForAxis(value)} />
                    <Tooltip
                      cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                      formatter={(value, name) => [formatMontant(value, { useCompactNotation: false }), name]}
                    />
                    <Bar dataKey="ventes" name="Ventes" fill={SALES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="achats" name="Achats" fill={PURCHASES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </SectionCard>
        </Grid>

        <Grid item xs={12} lg={5}>
          <SectionCard
            title="Dernières opérations"
            subtitle="Les ventes et achats les plus récents."
            action={<Button onClick={() => navigate('/transactions')}>Tout voir</Button>}
          >
            {loading ? (
              <Stack spacing={1}>{[0, 1, 2].map((key) => <Skeleton key={key} variant="rounded" height={56} />)}</Stack>
            ) : data.recent.length === 0 ? (
              <Typography color="text.secondary">Aucune opération ces dernières semaines.</Typography>
            ) : (
              <Stack spacing={1}>
                {data.recent.map((transaction) => {
                  const sale = isSale(transaction);
                  return (
                    <CardActionArea
                      key={transaction.id_transaction}
                      onClick={() => navigate(`/transactions/${transaction.id_transaction}`)}
                      sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip
                              size="small"
                              label={sale ? 'Vente' : 'Achat'}
                              sx={{ fontWeight: 800, color: sale ? 'success.main' : 'error.main', backgroundColor: sale ? 'rgba(46, 125, 50, 0.09)' : 'rgba(211, 47, 47, 0.09)' }}
                            />
                            <Typography fontWeight={800} noWrap title={transaction.partnerName}>{transaction.partnerName}</Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">{formatShortDate(transaction.date_transaction)}</Typography>
                        </Box>
                        <Typography fontWeight={900} sx={{ whiteSpace: 'nowrap', color: sale ? 'success.main' : 'error.main' }}>
                          {sale ? '+' : '−'}{formatMontant(netAmount(transaction), { useCompactNotation: false })}
                        </Typography>
                      </Stack>
                    </CardActionArea>
                  );
                })}
              </Stack>
            )}
          </SectionCard>
        </Grid>
      </Grid>
    </Box>
  );
}

function SectionCard({ title, subtitle, icon, action, children }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontWeight: 900, fontSize: '1.3rem' }}>{title}</Typography>
            {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
          </Box>
          {action || icon}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, helper, icon, color, loading, onClick }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 3 }}>
      <CardActionArea onClick={onClick} sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.08em' }}>
                {label}
              </Typography>
              {loading ? <Skeleton width={120} height={36} /> : (
                <Typography sx={{ mt: 0.5, fontWeight: 900, fontSize: { xs: '1.45rem', sm: '1.6rem' }, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
                  {value}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                {helper}
              </Typography>
            </Box>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2.25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color,
                backgroundColor: alpha(color, 0.13),
                flexShrink: 0,
              }}
            >
              {icon}
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default Dashboard;
