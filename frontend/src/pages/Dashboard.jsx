/**
 * Page Dashboard.
 * 
 * Affiche un tableau de bord avec :
 * - Statistiques clés (solde caisse, transactions du mois, ventes, achats)
 * - Graphique d'évolution des transactions sur 30 jours
 * 
 * Utilise le composant StatCard et recharts pour la visualisation.
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import {
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import fr from 'date-fns/locale/fr';
import StatCard from '../components/StatCard/StatCard';
import { get } from '../services/api';

/**
 * Formate une date pour l'affichage dans le graphique.
 */
const formatDate = (date) => {
  try {
    return format(date, 'dd MMM', { locale: fr });
  } catch (error) {
    return format(date, 'dd/MM');
  }
};

/**
 * Groupe les transactions par jour pour le graphique.
 */
const groupTransactionsByDay = (transactions) => {
  const grouped = {};
  
  transactions.forEach((transaction) => {
    const dateKey = format(parseISO(transaction.date_transaction), 'yyyy-MM-dd');
    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        date: dateKey,
        count: 0,
        total: 0,
      };
    }
    grouped[dateKey].count += 1;
    grouped[dateKey].total += parseFloat(transaction.montant_total || 0);
  });
  
  // Créer un tableau pour les 30 derniers jours
  const last30Days = [];
  const today = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = subDays(today, i);
    const dateKey = format(date, 'yyyy-MM-dd');
    last30Days.push({
      date: formatDate(date),
      dateKey: dateKey,
      count: grouped[dateKey]?.count || 0,
      total: grouped[dateKey]?.total || 0,
    });
  }
  
  return last30Days;
};

/**
 * Composant Dashboard.
 */
function Dashboard() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // États pour les statistiques
  const [soldeCaisse, setSoldeCaisse] = useState(0);
  const [nbTransactionsMois, setNbTransactionsMois] = useState(0);
  const [totalVentes, setTotalVentes] = useState(0);
  const [totalAchats, setTotalAchats] = useState(0);
  
  // État pour le graphique
  const [chartData, setChartData] = useState([]);
  
  /**
   * Charge les données du dashboard.
   */
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Date du début et fin du mois en cours
        const now = new Date();
        const debutMois = startOfMonth(now);
        const finMois = endOfMonth(now);
        
        // Date pour les 30 derniers jours
        const dateDebut30Jours = subDays(now, 30);
        
        // Charger toutes les données en parallèle
        const [
          soldeResponse,
          transactionsMoisResponse,
          transactions30JoursResponse,
        ] = await Promise.all([
          // 1. Solde de la caisse
          get('/caisse/solde'),
          
          // 2. Transactions du mois en cours (actives uniquement)
          get('/transactions', {
            params: {
              date_debut: format(debutMois, 'yyyy-MM-dd'),
              date_fin: format(finMois, 'yyyy-MM-dd'),
              est_actif: true,
              limit: 1000, // Limite élevée pour récupérer toutes les transactions du mois
            },
          }),
          
          // 3. Transactions des 30 derniers jours pour le graphique
          get('/transactions', {
            params: {
              date_debut: format(dateDebut30Jours, 'yyyy-MM-dd'),
              date_fin: format(now, 'yyyy-MM-dd'),
              est_actif: true,
              limit: 1000, // Limite élevée pour récupérer toutes les transactions
            },
          }),
        ]);
        
        // Traiter le solde de la caisse
        setSoldeCaisse(parseFloat(soldeResponse.solde_actuel || 0));
        
        // Traiter les transactions du mois
        const transactionsMois = transactionsMoisResponse || [];
        setNbTransactionsMois(transactionsMois.length);
        
        // Calculer le total des ventes (transactions avec client)
        const ventes = transactionsMois.filter((t) => t.id_client !== null);
        const totalVentesCalc = ventes.reduce(
          (sum, t) => sum + parseFloat(t.montant_total || 0),
          0
        );
        setTotalVentes(totalVentesCalc);
        
        // Calculer le total des achats (transactions avec fournisseur)
        const achats = transactionsMois.filter((t) => t.id_fournisseur !== null);
        const totalAchatsCalc = achats.reduce(
          (sum, t) => sum + parseFloat(t.montant_total || 0),
          0
        );
        setTotalAchats(totalAchatsCalc);
        
        // Préparer les données pour le graphique
        const transactions30Jours = transactions30JoursResponse || [];
        const chartDataFormatted = groupTransactionsByDay(transactions30Jours);
        setChartData(chartDataFormatted);
        
      } catch (err) {
        console.error('Erreur lors du chargement du dashboard:', err);
        setError(
          err.message || 'Une erreur est survenue lors du chargement des données.'
        );
      } finally {
        setLoading(false);
      }
    };
    
    loadDashboardData();
  }, []);
  
  // Affichage du chargement
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }
  
  // Affichage de l'erreur
  if (error) {
    return (
      <Box sx={{ mb: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  
  return (
    <Box>
      {/* Titre de la page */}
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 4 }}>
        Dashboard
      </Typography>
      
      {/* Grille des statistiques */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Solde de la caisse */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Solde de la caisse"
            value={soldeCaisse}
            icon={<AccountBalanceIcon />}
            color="primary"
            valueFormat="currency"
            currency="MAD"
          />
        </Grid>
        
        {/* Nombre de transactions du mois */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Transactions du mois"
            value={nbTransactionsMois}
            icon={<ReceiptIcon />}
            color="info"
            valueFormat="number"
          />
        </Grid>
        
        {/* Total des ventes */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total des ventes"
            value={totalVentes}
            icon={<TrendingUpIcon />}
            color="success"
            valueFormat="currency"
            currency="MAD"
          />
        </Grid>
        
        {/* Total des achats */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total des achats"
            value={totalAchats}
            icon={<TrendingDownIcon />}
            color="warning"
            valueFormat="currency"
            currency="MAD"
          />
        </Grid>
      </Grid>
      
      {/* Graphique d'évolution des transactions */}
      <Card>
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            Évolution des transactions (30 derniers jours)
          </Typography>
          <Box sx={{ width: '100%', height: 400, mt: 3 }}>
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  yAxisId="left"
                  label={{ value: 'Nombre', angle: -90, position: 'insideLeft' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  label={{ value: 'Montant (MAD)', angle: 90, position: 'insideRight' }}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'count') {
                      return [`${value} transaction(s)`, 'Nombre'];
                    }
                    if (name === 'total') {
                      return [
                        new Intl.NumberFormat('fr-FR', {
                          style: 'currency',
                          currency: 'MAD',
                        }).format(value),
                        'Montant',
                      ];
                    }
                    return [value, name];
                  }}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="count"
                  stroke={theme.palette.primary.main}
                  strokeWidth={2}
                  name="Nombre de transactions"
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="total"
                  stroke={theme.palette.secondary.main}
                  strokeWidth={2}
                  name="Montant total (MAD)"
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Dashboard;
