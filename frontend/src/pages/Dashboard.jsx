import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  AccountBalanceWallet as WalletIcon,
  AssignmentTurnedIn as TaskIcon,
  CreditScore as PaymentIcon,
  Egg as EggIcon,
  Factory as FactoryIcon,
  MoneyOff as ExpenseIcon,
  ReceiptLong as ReceiptIcon,
  ShoppingCart as PurchaseIcon,
  Storefront as SaleIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { endOfMonth, format, parseISO, startOfMonth, subDays } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { get } from '../services/api';
import { formatMontant, formatSimpleNumber } from '../utils/formatNumber';
import { formatNumberForAxis, formatMontantForTooltip } from '../utils/formatNumberForChart';

const ACTIONS = [
  {
    title: 'Vendre \u00e0 un client',
    description: 'Cr\u00e9er une vente et ajouter le paiement si besoin.',
    icon: <SaleIcon />,
    color: '#1D6F50',
    background: '#E0F1E7',
    path: '/transactions',
  },
  {
    title: 'Acheter fournisseur',
    description: 'Enregistrer un achat, une dette ou un paiement.',
    icon: <PurchaseIcon />,
    color: '#A84435',
    background: '#F8DED9',
    path: '/transactions',
  },
  {
    title: 'Saisir production',
    description: 'Collecte quotidienne par b\u00e2timent et cartons.',
    icon: <EggIcon />,
    color: '#A96522',
    background: '#F8E8CC',
    path: '/production',
  },
  {
    title: 'Ajouter paiement',
    description: 'Encaisser un client ou payer un fournisseur.',
    icon: <PaymentIcon />,
    color: '#315F85',
    background: '#DCECF7',
    path: '/transactions',
  },
  {
    title: 'Nouvelle d\u00e9pense',
    description: 'Ajouter une charge et sortir de la caisse.',
    icon: <ExpenseIcon />,
    color: '#8B3A2B',
    background: '#F5DDD6',
    path: '/charges',
  },
];

const formatDate = (date) => {
  try {
    return format(date, 'dd MMM', { locale: fr });
  } catch {
    return format(date, 'dd/MM');
  }
};

const groupTransactionsByDay = (transactions) => {
  const grouped = {};

  transactions.forEach((transaction) => {
    const dateKey = format(parseISO(transaction.date_transaction), 'yyyy-MM-dd');
    if (!grouped[dateKey]) {
      grouped[dateKey] = { date: dateKey, count: 0, total: 0 };
    }
    grouped[dateKey].count += 1;
    grouped[dateKey].total += parseFloat(transaction.montant_total || 0);
  });

  const last30Days = [];
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const date = subDays(today, i);
    const dateKey = format(date, 'yyyy-MM-dd');
    last30Days.push({
      date: formatDate(date),
      dateKey,
      count: grouped[dateKey]?.count || 0,
      total: grouped[dateKey]?.total || 0,
    });
  }

  return last30Days;
};

function Dashboard() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [soldeCaisse, setSoldeCaisse] = useState(0);
  const [nbTransactionsMois, setNbTransactionsMois] = useState(0);
  const [totalVentes, setTotalVentes] = useState(0);
  const [totalAchats, setTotalAchats] = useState(0);
  const [totalOeufsAujourdhui, setTotalOeufsAujourdhui] = useState(0);
  const [totalCartonsAujourdhui, setTotalCartonsAujourdhui] = useState(0);
  const [transactionsRecentes, setTransactionsRecentes] = useState([]);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const now = new Date();
        const debutMois = startOfMonth(now);
        const finMois = endOfMonth(now);
        const dateDebut30Jours = subDays(now, 30);

        const [
          soldeResponse,
          transactionsMoisResponse,
          transactions30JoursResponse,
          productionResponse,
        ] = await Promise.all([
          get('/caisse/solde/complet'),
          get('/transactions', {
            params: {
              date_debut: format(debutMois, 'yyyy-MM-dd'),
              date_fin: format(finMois, 'yyyy-MM-dd'),
              est_actif: true,
              limit: 1000,
            },
          }),
          get('/transactions', {
            params: {
              date_debut: format(dateDebut30Jours, 'yyyy-MM-dd'),
              date_fin: format(now, 'yyyy-MM-dd'),
              est_actif: true,
              limit: 1000,
            },
          }),
          get('/productions', {
            params: {
              date_debut: format(now, 'yyyy-MM-dd'),
              date_fin: format(now, 'yyyy-MM-dd'),
            },
          }),
        ]);

        const transactionsMois = transactionsMoisResponse || [];
        const transactions30Jours = transactions30JoursResponse || [];
        const productionsToday = productionResponse || [];
        const ventes = transactionsMois.filter((t) => t.id_client !== null);
        const achats = transactionsMois.filter((t) => t.id_fournisseur !== null);

        setSoldeCaisse(parseFloat(soldeResponse.solde_reel ?? soldeResponse.solde_theorique ?? 0));
        setNbTransactionsMois(transactionsMois.length);
        setTotalVentes(ventes.reduce((sum, t) => sum + parseFloat(t.montant_total || 0), 0));
        setTotalAchats(achats.reduce((sum, t) => sum + parseFloat(t.montant_total || 0), 0));
        setChartData(groupTransactionsByDay(transactions30Jours));
        setTransactionsRecentes(
          [...transactions30Jours]
            .sort((a, b) => new Date(b.date_transaction) - new Date(a.date_transaction))
            .slice(0, 4)
        );
        setTotalOeufsAujourdhui(
          productionsToday.reduce((sum, p) => sum + (p.nombre_oeufs || 0), 0)
        );
        setTotalCartonsAujourdhui(
          productionsToday.reduce((sum, p) => sum + (p.nombre_cartons || 0), 0)
        );
      } catch (err) {
        console.error('Erreur lors du chargement du dashboard:', err);
        setError(err.message || 'Une erreur est survenue lors du chargement des donn\u00e9es.');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const alerts = useMemo(() => {
    const items = [];
    const balanceBetweenSalesAndPurchases = totalVentes - totalAchats;

    if (totalOeufsAujourdhui === 0) {
      items.push({
        title: 'Production du jour \u00e0 saisir',
        description: "Aucun oeuf enregistr\u00e9 aujourd'hui. V\u00e9rifiez les b\u00e2timents.",
        action: 'Saisir',
        path: '/production',
        severity: 'warning',
      });
    }

    if (soldeCaisse < 0) {
      items.push({
        title: 'Solde caisse n\u00e9gatif',
        description: 'La caisse demande une v\u00e9rification rapide.',
        action: 'Voir',
        path: '/caisse',
        severity: 'error',
      });
    }

    if (balanceBetweenSalesAndPurchases < 0) {
      items.push({
        title: 'Achats sup\u00e9rieurs aux ventes',
        description: 'Le mois est en sortie nette pour le moment.',
        action: 'Analyser',
        path: '/transactions',
        severity: 'warning',
      });
    }

    if (items.length === 0) {
      items.push({
        title: 'Journ\u00e9e sous contr\u00f4le',
        description: 'Aucune alerte critique d\u00e9tect\u00e9e sur les donn\u00e9es charg\u00e9es.',
        action: 'Caisse',
        path: '/caisse',
        severity: 'success',
      });
    }

    return items.slice(0, 3);
  }, [soldeCaisse, totalAchats, totalOeufsAujourdhui, totalVentes]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 420 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box sx={{ maxWidth: 1480, mx: 'auto', pb: 3 }}>
      <Stack spacing={1} sx={{ mb: 2.5 }}>
        <Typography
          component="h1"
          sx={{
            fontWeight: 900,
            fontSize: { xs: '1.75rem', sm: '2.1rem', md: '2.45rem' },
            lineHeight: 1.08,
            color: '#17211D',
          }}
        >
          Accueil quotidien
        </Typography>
        <Typography sx={{ maxWidth: 760, color: '#69736D', lineHeight: 1.55 }}>
          Les priorit&eacute;s du jour, la production et les actions rapides au m&ecirc;me endroit.
        </Typography>
      </Stack>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={7}>
          <Card
            sx={{
              height: '100%',
              borderRadius: 3,
              borderColor: '#DED2BD',
              backgroundColor: '#FFFDF8',
              boxShadow: '0 18px 44px rgba(55, 44, 24, 0.08)',
            }}
          >
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Box>
                  <Typography component="h2" sx={{ fontWeight: 900, fontSize: '1.45rem' }}>
                    &Agrave; traiter maintenant
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Les points importants avant de continuer la journ&eacute;e.
                  </Typography>
                </Box>
                <WarningIcon sx={{ color: '#A96522' }} />
              </Stack>

              <Stack spacing={1.5}>
                {alerts.map((alert) => {
                  const isError = alert.severity === 'error';
                  const isSuccess = alert.severity === 'success';
                  const alertColor = isError ? '#A84435' : isSuccess ? '#1D6F50' : '#A96522';

                  return (
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
                        borderColor: isError ? alpha('#A84435', 0.32) : alpha(alertColor, 0.28),
                        backgroundColor: isSuccess ? '#F0F8F3' : '#FFFCF6',
                      }}
                    >
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: alertColor }} />
                      <Box>
                        <Typography sx={{ fontWeight: 900, fontSize: '1rem' }}>{alert.title}</Typography>
                        <Typography variant="body2" sx={{ color: '#69736D', lineHeight: 1.55, mt: 0.25 }}>
                          {alert.description}
                        </Typography>
                      </Box>
                      <Button
                        size="medium"
                        variant="contained"
                        onClick={() => navigate(alert.path)}
                        sx={{
                          gridColumn: { xs: '1 / -1', sm: 'auto' },
                          borderRadius: 2,
                          backgroundColor: '#17211D',
                          '&:hover': { backgroundColor: '#24332B' },
                        }}
                      >
                        {alert.action}
                      </Button>
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Card
            sx={{
              height: '100%',
              borderRadius: 3,
              borderColor: '#D8E3DD',
              boxShadow: '0 18px 44px rgba(28, 38, 34, 0.08)',
            }}
          >
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Box>
                  <Typography component="h2" sx={{ fontWeight: 900, fontSize: '1.45rem' }}>
                    Production aujourd&apos;hui
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    R&eacute;sum&eacute; de la collecte du jour.
                  </Typography>
                </Box>
                <FactoryIcon sx={{ color: '#A96522' }} />
              </Stack>
              <Grid container spacing={1.5}>
                <Grid item xs={6}>
                  <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#F8E8CC' }}>
                    <Typography variant="caption" sx={{ color: '#A96522', fontWeight: 900 }}>
                      Oeufs
                    </Typography>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1 }}>
                      {formatSimpleNumber(totalOeufsAujourdhui)}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#E0F1E7' }}>
                    <Typography variant="caption" sx={{ color: '#1D6F50', fontWeight: 900 }}>
                      Cartons
                    </Typography>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1 }}>
                      {formatSimpleNumber(totalCartonsAujourdhui)}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              <Button
                fullWidth
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/production')}
                sx={{ mt: 2, borderRadius: 2, minHeight: 46 }}
              >
                Saisir ou consulter la production
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            label="Argent disponible"
            value={formatMontant(soldeCaisse, { useCompactNotation: false })}
            helper={soldeCaisse < 0 ? 'Solde réel de caisse — à régulariser' : 'Solde réel de caisse'}
            icon={<WalletIcon />}
            color={soldeCaisse < 0 ? '#A84435' : '#1D6F50'}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            label="Transactions du mois"
            value={formatSimpleNumber(nbTransactionsMois)}
            helper="Opérations enregistrées"
            icon={<ReceiptIcon />}
            color="#315F85"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            label="Ventes"
            value={formatMontant(totalVentes, { useCompactNotation: false })}
            helper="Total client ce mois"
            icon={<TrendingUpIcon />}
            color="#1D6F50"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            label="Achats"
            value={formatMontant(totalAchats, { useCompactNotation: false })}
            helper="Total fournisseur ce mois"
            icon={<TrendingDownIcon />}
            color="#A84435"
          />
        </Grid>
      </Grid>

      <Card sx={{ mb: 3, borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
          >
            <Box>
              <Typography component="h2" sx={{ fontWeight: 900, fontSize: '1.25rem' }}>
                Actions rapides
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Les op&eacute;rations les plus utilis&eacute;es.
              </Typography>
            </Box>
            <Box
              sx={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  lg: 'repeat(auto-fit, minmax(190px, 1fr))',
                },
                gap: 1.25,
                minWidth: 0,
              }}
            >
              {ACTIONS.map((action) => (
                <Button
                  key={action.title}
                  fullWidth
                  onClick={() => navigate(action.path)}
                  sx={{
                    justifyContent: 'flex-start',
                    gap: 1.25,
                    minHeight: 66,
                    px: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: '#DCE4DF',
                    backgroundColor: '#FFFDF8',
                    color: '#17211D',
                    textAlign: 'left',
                    overflow: 'hidden',
                    '&:hover': {
                      borderColor: action.color,
                      backgroundColor: alpha(action.color, 0.06),
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: action.color,
                      backgroundColor: action.background,
                      flexShrink: 0,
                      '& .MuiSvgIcon-root': { fontSize: 20 },
                    }}
                  >
                    {action.icon}
                  </Box>
                  <Typography
                    sx={{
                      minWidth: 0,
                      fontWeight: 900,
                      fontSize: '0.9rem',
                      lineHeight: 1.18,
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {action.title}
                  </Typography>
                </Button>
              ))}
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={7}>
          <Card sx={{ height: '100%', borderRadius: 3 }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
                <Box>
                  <Typography component="h2" sx={{ fontWeight: 800, fontSize: '1.35rem' }}>
                    Activit&eacute; des 30 derniers jours
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Volume et montant des transactions r&eacute;centes.
                  </Typography>
                </Box>
                <Button variant="outlined" onClick={() => navigate('/transactions')}>
                  Voir transactions
                </Button>
              </Stack>

              <Box sx={{ height: { xs: 300, md: 350 } }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={65} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={36} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(value) => formatNumberForAxis(value)}
                      tick={{ fontSize: 11 }}
                      width={70}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === 'count') return [`${value} transaction(s)`, 'Nombre'];
                        if (name === 'total') return [formatMontantForTooltip(value), 'Montant'];
                        return [value, name];
                      }}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="count"
                      stroke="#1D6F50"
                      strokeWidth={2}
                      name="Nombre"
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="total"
                      stroke="#A96522"
                      strokeWidth={2}
                      name="Montant"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Box>
                  <Typography component="h2" sx={{ fontWeight: 800, fontSize: '1.35rem' }}>
                    Derni&egrave;res op&eacute;rations
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Les transactions les plus r&eacute;centes.
                  </Typography>
                </Box>
                <TaskIcon sx={{ color: '#315F85' }} />
              </Stack>
              <Stack spacing={1.25}>
                {transactionsRecentes.length === 0 ? (
                  <Alert severity="info">Aucune transaction r&eacute;cente trouv&eacute;e.</Alert>
                ) : (
                  transactionsRecentes.map((transaction) => {
                    const isSale = transaction.id_client !== null;
                    return (
                      <Box
                        key={transaction.id_transaction}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 1.5,
                          alignItems: 'center',
                          p: 1.5,
                          borderRadius: 2.5,
                          border: '1px solid',
                          borderColor: 'divider',
                          backgroundColor: 'background.paper',
                        }}
                      >
                        <Box>
                          <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
                            {isSale ? 'Vente client' : 'Achat fournisseur'} #{transaction.id_transaction}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(transaction.date_transaction), 'dd/MM/yyyy')}
                          </Typography>
                        </Box>
                        <Typography
                          sx={{
                            fontWeight: 900,
                            color: isSale ? 'success.main' : 'error.main',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isSale ? '+' : '-'}
                          {formatMontant(transaction.montant_total, { useCompactNotation: false })}
                        </Typography>
                      </Box>
                    );
                  })
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function MetricCard({ label, value, helper, icon, color }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 3 }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Box>
            <Typography
              variant="overline"
              sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.08em' }}
            >
              {label}
            </Typography>
            <Typography
              sx={{
                mt: 0.75,
                fontWeight: 900,
                fontSize: { xs: '1.45rem', sm: '1.65rem' },
                lineHeight: 1.1,
                letterSpacing: '-0.035em',
              }}
            >
              {value}
            </Typography>
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
    </Card>
  );
}

export default Dashboard;
