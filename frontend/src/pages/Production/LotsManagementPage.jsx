import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { Link, useSearchParams } from 'react-router-dom';
import { batimentService } from '../../services/productionService';
import LotPanel from './LotPanel';
import { localToday, productionLink } from './useProductionView';

export default function LotsManagementPage() {
  const [params] = useSearchParams();
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('overview');
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

  const historyBuilding = params.get('statut') === 'termine'
    ? buildings.find((building) => String(building.id_batiment) === params.get('id_batiment'))
    : undefined;
  const historyBuildingId = historyBuilding ? String(historyBuilding.id_batiment) : undefined;

  return <Box sx={{ pb: 4, minWidth: 0 }}>
    {view === 'overview' && historyBuildingId && (
      <Button component={Link} to={productionLink(historyBuildingId, params.get('date') || localToday())}
        startIcon={<ArrowBack />} sx={{ mb: 1.5 }}>Retour au bâtiment</Button>
    )}
    {view === 'overview' && <Typography component="h1" variant="h3" fontWeight={800} sx={{ mb: 3 }}>Gestion des lots</Typography>}
    {loading ? <CircularProgress aria-label="Chargement des bâtiments" />
      : error ? <Alert severity="error" action={<Button onClick={() => setRevision((value) => value + 1)}>Réessayer</Button>}>{error}</Alert>
        : <LotPanel key={historyBuildingId ?? 'all'} buildings={buildings} managementMode
            initialFinishedBuildingId={historyBuildingId} onViewChange={setView} />}
  </Box>;
}

