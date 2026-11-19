import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { Link, useSearchParams } from 'react-router-dom';
import { batimentService } from '../../services/productionService';
import LotPanel from './LotPanel';
import { localToday, productionLink } from './useProductionView';
import PageHeader from '../../components/Layout/PageHeader';

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
    {view === 'overview' && <PageHeader title="Gestion des lots" description="Retrouvez les lots en cours et terminés de chaque bâtiment." />}
    {loading ? <CircularProgress aria-label="Chargement des bâtiments" />
      : error ? <Alert severity="error" action={<Button onClick={() => setRevision((value) => value + 1)}>Réessayer</Button>}>{error}</Alert>
        : <LotPanel key={historyBuildingId ?? 'all'} buildings={buildings} managementMode
            initialFinishedBuildingId={historyBuildingId} onViewChange={setView} />}
  </Box>;
}

