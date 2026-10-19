import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { batimentService } from '../../services/productionService';
import LotPanel from './LotPanel';

export default function LotsManagementPage() {
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    batimentService.getBatiments().then((rows) => {
      if (!cancelled) setBuildings(rows || []);
    }).catch(() => {
      if (!cancelled) setError('Impossible de charger les bâtiments.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [revision]);

  return <Box sx={{ pb: 4, minWidth: 0 }}>
    <Typography component="h1" variant="h3" fontWeight={800} sx={{ mb: 1 }}>Gestion des lots</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>Gérez les arrivées, la répartition entre bâtiments et la clôture du lot partagé.</Typography>
    {loading ? <CircularProgress aria-label="Chargement des bâtiments" />
      : error ? <Alert severity="error" action={<Button onClick={() => setRevision((value) => value + 1)}>Réessayer</Button>}>{error}</Alert>
        : <LotPanel buildings={buildings} />}
  </Box>;
}
