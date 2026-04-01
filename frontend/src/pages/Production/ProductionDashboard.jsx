import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  MenuItem,
  TextField,
  useTheme
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { productionService, batimentService } from '../../services/productionService';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

function ProductionDashboard() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [productions, setProductions] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const dateDebut = format(subDays(new Date(), days), 'yyyy-MM-dd');
        const [prodData, batData] = await Promise.all([
          productionService.getProductions({ 
            date_debut: dateDebut,
            date_fin: format(new Date(), 'yyyy-MM-dd'),
            limit: 500 
          }),
          batimentService.getBatiments()
        ]);
        setProductions(prodData);
        setBatiments(batData);
      } catch (err) {
        console.error("Error fetching dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [days]);

  // Agrégation par bâtiment
  const statsByBatiment = useMemo(() => {
    const map = {};
    productions.forEach(p => {
      if (!map[p.nom_batiment]) map[p.nom_batiment] = 0;
      map[p.nom_batiment] += p.nombre_oeufs;
    });
    return Object.keys(map).map(name => ({ name, value: map[name] }));
  }, [productions]);

  // Agrégation par type d'œuf
  const statsByType = useMemo(() => {
    const map = {};
    productions.forEach(p => {
      if (!map[p.type_oeuf]) map[p.type_oeuf] = 0;
      map[p.type_oeuf] += p.nombre_oeufs;
    });
    return Object.keys(map).map(name => ({ name, value: map[name] }));
  }, [productions]);

  // Évolution temporelle
  const timeSeries = useMemo(() => {
    const map = {};
    productions.forEach(p => {
      const d = p.date_production.split('T')[0];
      if (!map[d]) map[d] = 0;
      map[d] += p.nombre_oeufs;
    });
    return Object.keys(map).sort().map(date => ({
      date: format(new Date(date), 'dd MMM', { locale: fr }),
      total: map[date]
    }));
  }, [productions]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' }, 
        gap: 2,
        mb: 4 
      }}>
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' } }}>
          📊 Dashboard Production
        </Typography>
        <TextField
          select
          size="small"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          sx={{ width: { xs: '100%', sm: 180 } }}
        >
          <MenuItem value={7}>7 derniers jours</MenuItem>
          <MenuItem value={30}>30 derniers jours</MenuItem>
          <MenuItem value={90}>3 derniers mois</MenuItem>
        </TextField>
      </Box>

      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {/* Graphique d'évolution */}
        <Grid item xs={12}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">Évolution de la Production Totale</Typography>
              <Box sx={{ height: 300, mt: 2 }}>
                <ResponsiveContainer>
                  <LineChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" stroke={theme.palette.primary.main} strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Répartition par bâtiment */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">Production par Bâtiment</Typography>
              <Box sx={{ height: 300, mt: 2 }}>
                <ResponsiveContainer>
                  <BarChart data={statsByBatiment} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip />
                    <Bar dataKey="value" fill={theme.palette.secondary.main} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Répartition par type d'œuf */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">Répartition par Type d'Œuf</Typography>
              <Box sx={{ height: 300, mt: 2, display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={statsByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statsByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default ProductionDashboard;
