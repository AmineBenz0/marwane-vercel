/**
 * Page Caisse (protégée).
 * 
 * Affiche :
 * - Solde actuel de la caisse (en évidence)
 * - Liste des mouvements récents avec filtres par date
 * - Graphique d'évolution du solde sur 30 derniers jours
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
  TextField,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
} from '@mui/material';
import {
  AccountBalance as AccountBalanceIcon,
  Refresh as RefreshIcon,
  FilterList as FilterListIcon,
  FileDownload as FileDownloadIcon,
  PictureAsPdf as PictureAsPdfIcon,
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
import { format, subDays, parseISO } from 'date-fns';
import fr from 'date-fns/locale/fr';
import StatCard from '../../components/StatCard/StatCard';
import { get } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { exportCaisseReport } from '../../utils/exportToPDF';
import useNotification from '../../hooks/useNotification';

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
 * Formate un montant en devise.
 */
const formatCurrency = (value) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'MAD',
  }).format(value);
};

/**
 * Calcule l'évolution du solde jour par jour sur 30 jours.
 * 
 * @param {Array} mouvements - Liste des mouvements des 30 derniers jours
 * @param {Date} startDate - Date de début de la période (30 jours avant aujourd'hui)
 * @param {number} soldeActuel - Solde actuel de la caisse
 */
const calculateBalanceEvolution = (mouvements, startDate, soldeActuel) => {
  // Créer un tableau pour les 30 derniers jours
  const last30Days = [];
  const today = new Date();
  
  // Grouper les mouvements par jour
  const mouvementsParJour = {};
  let totalEntrees = 0;
  let totalSorties = 0;
  
  mouvements.forEach((mouvement) => {
    const mouvementDate = parseISO(mouvement.date_mouvement);
    if (mouvementDate >= startDate && mouvementDate <= today) {
      const dateKey = format(mouvementDate, 'yyyy-MM-dd');
      if (!mouvementsParJour[dateKey]) {
        mouvementsParJour[dateKey] = {
          entrees: 0,
          sorties: 0,
        };
      }
      if (mouvement.type_mouvement === 'ENTREE') {
        const montant = parseFloat(mouvement.montant || 0);
        mouvementsParJour[dateKey].entrees += montant;
        totalEntrees += montant;
      } else {
        const montant = parseFloat(mouvement.montant || 0);
        mouvementsParJour[dateKey].sorties += montant;
        totalSorties += montant;
      }
    }
  });
  
  // Calculer le solde initial (solde actuel - variation des 30 derniers jours)
  const variation30Jours = totalEntrees - totalSorties;
  const soldeInitial = soldeActuel - variation30Jours;
  
  // Construire le tableau jour par jour avec le solde cumulé
  let soldeCumule = soldeInitial;
  for (let i = 29; i >= 0; i--) {
    const date = subDays(today, i);
    const dateKey = format(date, 'yyyy-MM-dd');
    const jour = mouvementsParJour[dateKey];
    
    if (jour) {
      soldeCumule += jour.entrees - jour.sorties;
    }
    
    last30Days.push({
      date: formatDate(date),
      dateKey: dateKey,
      solde: soldeCumule,
    });
  }
  
  return last30Days;
};

/**
 * Composant Caisse.
 */
function Caisse() {
  const theme = useTheme();
  const notification = useNotification();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // États pour les données
  const [solde, setSolde] = useState(0);
  const [derniereMaj, setDerniereMaj] = useState(null);
  const [mouvements, setMouvements] = useState([]);
  const [chartData, setChartData] = useState([]);
  
  // États pour les filtres
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [filtersApplied, setFiltersApplied] = useState(false);
  
  /**
   * Charge les données de la caisse.
   */
  const loadCaisseData = async (useFilters = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const now = new Date();
      const dateDebut30Jours = subDays(now, 30);
      
      // Préparer les paramètres pour les mouvements
      const mouvementsParams = {
        limit: 1000, // Limite élevée pour récupérer tous les mouvements
      };
      
      // Si des filtres sont appliqués, les utiliser
      if (useFilters && dateDebut && dateFin) {
        mouvementsParams.date_debut = dateDebut;
        mouvementsParams.date_fin = dateFin;
      } else {
        // Sinon, récupérer les 30 derniers jours pour le graphique
        mouvementsParams.date_debut = format(dateDebut30Jours, 'yyyy-MM-dd');
        mouvementsParams.date_fin = format(now, 'yyyy-MM-dd');
      }
      
      // Charger toutes les données en parallèle
      const [
        soldeResponse,
        mouvementsResponse,
        mouvements30JoursResponse,
      ] = await Promise.all([
        // 1. Solde actuel
        get('/caisse/solde'),
        
        // 2. Mouvements récents (avec filtres ou 30 derniers jours)
        get('/caisse/mouvements', {
          params: mouvementsParams,
        }),
        
        // 3. Mouvements des 30 derniers jours pour le graphique (toujours)
        get('/caisse/mouvements', {
          params: {
            date_debut: format(dateDebut30Jours, 'yyyy-MM-dd'),
            date_fin: format(now, 'yyyy-MM-dd'),
            limit: 1000,
          },
        }),
      ]);
      
      // Traiter le solde
      setSolde(parseFloat(soldeResponse.solde_actuel || 0));
      setDerniereMaj(soldeResponse.derniere_maj);
      
      // Traiter les mouvements récents
      const mouvementsData = mouvementsResponse || [];
      setMouvements(mouvementsData);
      
      // Préparer les données pour le graphique
      const mouvements30Jours = mouvements30JoursResponse || [];
      const chartDataFormatted = calculateBalanceEvolution(
        mouvements30Jours,
        dateDebut30Jours,
        parseFloat(soldeResponse.solde_actuel || 0)
      );
      setChartData(chartDataFormatted);
      
    } catch (err) {
      console.error('Erreur lors du chargement des données de la caisse:', err);
      const errorMessage = err.message || 'Une erreur est survenue lors du chargement des données.';
      setError(errorMessage);
      notification.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Charge les données au montage du composant.
   */
  useEffect(() => {
    loadCaisseData(false);
  }, []);
  
  /**
   * Applique les filtres de date.
   */
  const handleApplyFilters = () => {
    if (dateDebut && dateFin) {
      if (new Date(dateDebut) > new Date(dateFin)) {
        const errorMessage = 'La date de début doit être antérieure à la date de fin.';
        setError(errorMessage);
        notification.warning(errorMessage);
        return;
      }
      setFiltersApplied(true);
      loadCaisseData(true);
    } else {
      const errorMessage = 'Veuillez sélectionner une date de début et une date de fin.';
      setError(errorMessage);
      notification.warning(errorMessage);
    }
  };
  
  /**
   * Réinitialise les filtres.
   */
  const handleResetFilters = () => {
    setDateDebut('');
    setDateFin('');
    setFiltersApplied(false);
    loadCaisseData(false);
  };

  /**
   * Gère l'export Excel des mouvements de caisse filtrés.
   */
  const handleExportExcel = () => {
    try {
      // Définir les colonnes pour l'export
      const exportColumns = [
        {
          id: 'date_mouvement',
          label: 'Date',
        },
        {
          id: 'type_mouvement',
          label: 'Type',
        },
        {
          id: 'montant',
          label: 'Montant',
        },
        {
          id: 'id_transaction',
          label: 'Transaction ID',
        },
      ];

      const customFormatters = {
        date_mouvement: (value) => {
          if (!value) return '-';
          try {
            return format(parseISO(value), "dd/MM/yyyy 'à' HH:mm", { locale: fr });
          } catch {
            return value;
          }
        },
        montant: (value) => {
          if (value === null || value === undefined) return '-';
          return formatCurrency(parseFloat(value || 0));
        },
      };

      exportToExcelAdvanced(
        mouvements,
        exportColumns,
        `mouvements_caisse_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Mouvements Caisse',
        customFormatters
      );
      notification.success('Export Excel généré avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      const errorMessage = 'Une erreur est survenue lors de l\'export Excel';
      setError(errorMessage);
      notification.error(errorMessage);
    }
  };

  /**
   * Gère l'export PDF des mouvements de caisse.
   */
  const handleExportPDF = () => {
    try {
      exportCaisseReport(mouvements, solde, dateDebut, dateFin);
      notification.success('Export PDF généré avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'export PDF:', error);
      const errorMessage = 'Une erreur est survenue lors de l\'export PDF';
      setError(errorMessage);
      notification.error(errorMessage);
    }
  };
  
  // Affichage du chargement
  if (loading && !solde && !mouvements.length) {
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
  
  return (
    <Box>
      {/* Titre de la page */}
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 4 }}>
        Gestion de la Caisse
      </Typography>
      
      {/* Affichage de l'erreur */}
      {error && (
        <Box sx={{ mb: 3 }}>
          <Alert 
            severity="error" 
            onClose={() => setError(null)}
            action={
              <IconButton
                aria-label="refresh"
                color="inherit"
                size="small"
                onClick={() => loadCaisseData(filtersApplied)}
              >
                <RefreshIcon fontSize="inherit" />
              </IconButton>
            }
          >
            {error}
          </Alert>
        </Box>
      )}
      
      {/* Solde actuel en évidence */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <StatCard
            title="Solde actuel de la caisse"
            value={solde}
            icon={<AccountBalanceIcon />}
            color="primary"
            valueFormat="currency"
            currency="MAD"
          />
        </Grid>
        {derniereMaj && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Dernière mise à jour
                </Typography>
                <Typography variant="h6">
                  {format(parseISO(derniereMaj), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
      
      {/* Filtres par date */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <FilterListIcon sx={{ mr: 1 }} />
            <Typography variant="h6">Filtres par date</Typography>
          </Box>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={5}>
              <TextField
                fullWidth
                label="Date de début"
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField
                fullWidth
                label="Date de fin"
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={2}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleApplyFilters}
                  disabled={!dateDebut || !dateFin}
                  size="small"
                >
                  Appliquer
                </Button>
                {filtersApplied && (
                  <Button
                    variant="outlined"
                    onClick={handleResetFilters}
                    size="small"
                  >
                    Réinitialiser
                  </Button>
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Graphique d'évolution du solde */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            Évolution du solde (30 derniers jours)
          </Typography>
          {loading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: 400,
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
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
                    label={{ value: 'Solde (MAD)', angle: -90, position: 'insideLeft' }}
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="solde"
                    stroke={theme.palette.primary.main}
                    strokeWidth={2}
                    name="Solde de la caisse"
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )}
        </CardContent>
      </Card>
      
      {/* Liste des mouvements récents */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" component="h2">
              {filtersApplied 
                ? `Mouvements (${dateDebut} - ${dateFin})`
                : 'Mouvements récents'
              }
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={handleExportExcel}
                disabled={loading || mouvements.length === 0}
                size="small"
              >
                Excel
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<PictureAsPdfIcon />}
                onClick={handleExportPDF}
                disabled={loading || mouvements.length === 0}
                size="small"
              >
                PDF
              </Button>
            </Box>
          </Box>
          {loading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: 200,
              }}
            >
              <CircularProgress />
            </Box>
          ) : mouvements.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              Aucun mouvement trouvé pour la période sélectionnée.
            </Alert>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell align="right"><strong>Montant</strong></TableCell>
                    <TableCell><strong>Transaction ID</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mouvements.map((mouvement) => (
                    <TableRow key={mouvement.id_mouvement} hover>
                      <TableCell>
                        {format(
                          parseISO(mouvement.date_mouvement),
                          "dd MMM yyyy 'à' HH:mm",
                          { locale: fr }
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={mouvement.type_mouvement}
                          color={
                            mouvement.type_mouvement === 'ENTREE'
                              ? 'success'
                              : 'error'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color:
                              mouvement.type_mouvement === 'ENTREE'
                                ? theme.palette.success.main
                                : theme.palette.error.main,
                          }}
                        >
                          {mouvement.type_mouvement === 'ENTREE' ? '+' : '-'}
                          {formatCurrency(parseFloat(mouvement.montant || 0))}
                        </Typography>
                      </TableCell>
                      <TableCell>#{mouvement.id_transaction}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default Caisse;

