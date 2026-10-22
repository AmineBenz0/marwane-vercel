import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { lotProductionService } from '../../services/productionService';
import LotEggChart from './LotEggChart';
import { formatShortDate } from '../../utils/dateFormatting';

export default function ProductionLotChart({ refreshKey }) {
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    lotProductionService.getLots().then((rows) => {
      if (!cancelled) setLots(rows || []);
    }).catch(() => {
      if (!cancelled) setError('Impossible de charger les lots pour le graphique.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [revision, refreshKey]);

  const selected = lots.find((lot) => String(lot.id_lot) === selectedId)
    || lots.find((lot) => lot.statut !== 'termine') || lots[0];

  return <Box component="section" aria-label="Production par lot" sx={{ mt: 3, p: { xs: 2, md: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
    <Typography component="h2" variant="h6" fontWeight={800}>Production par lot</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Suivez la collecte du lot actif ou consultez un lot terminé.</Typography>
    {loading ? <CircularProgress size={24} aria-label="Chargement des lots" />
      : error ? <Alert severity="error" action={<Button onClick={() => setRevision((value) => value + 1)}>Réessayer</Button>}>{error}</Alert>
        : !selected ? <Typography color="text.secondary">Aucun lot enregistré.</Typography> : <>
          <TextField select size="small" label="Lot à analyser" value={selected.id_lot} SelectProps={{ native: true }}
            onChange={(event) => setSelectedId(event.target.value)} sx={{ minWidth: { xs: '100%', sm: 280 } }}>
            {lots.map((lot) => <option key={lot.id_lot} value={lot.id_lot}>{lot.repartitions?.[0]?.nom_batiment || 'Bâtiment'} | {lot.nom_lot} | {formatShortDate(lot.date_debut)} ({lot.statut === 'termine' ? 'terminé' : 'actif'})</option>)}
          </TextField>
          <LotEggChart key={selected.id_lot} lotId={selected.id_lot} refreshKey={refreshKey} />
        </>}
  </Box>;
}
