import { useEffect, useState } from 'react';
import { Alert, Box, Button, Grid } from '@mui/material';
import { AccountBalanceWalletOutlined, ChevronRight, ReceiptLongOutlined } from '@mui/icons-material';
import { get } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import StatCard from '../StatCard/StatCard';
import PartyCreditDrawer from './PartyCreditDrawer';
import useCorrectionRefresh from './useCorrectionRefresh';

export default function PartyCreditPanel({ partyType, partyId, partyName, totalActivity = null, totalTransactions = null, showSummary = true, open = false, onOpen, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const client = partyType === 'client';
  useCorrectionRefresh(() => setReload(v => v + 1));
  useEffect(() => {
    let active = true;
    setError(''); setData(null);
    get('/credits/party', { params: { [client ? 'id_client' : 'id_fournisseur']: Number(partyId) } })
      .then(rows => { if (active) setData(rows); }).catch(err => { if (active) setError(err.message || 'Les avances ne peuvent pas être chargées.'); });
    return () => { active = false; };
  }, [client, partyId, reload]);
  const balanceLabel = data && Number(data.balance) < 0 ? client ? 'Crédit du client' : 'Crédit chez le fournisseur'
    : client ? 'Reste net à encaisser' : 'Reste net à payer';
  const available = Number(data?.available || 0);
  const retry = () => setReload(v => v + 1);
  return <>
    {showSummary && <Box sx={{ mb: 3 }}>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}><StatCard title={client ? 'Total ventes' : 'Total achats'} value={totalActivity} icon={<ReceiptLongOutlined />} valueFormat="currency" useCompactNotation={false}
          subtitle={totalTransactions === null ? 'Depuis le début' : `Depuis le début · ${totalTransactions} ${totalTransactions === 1 ? 'transaction' : 'transactions'}`} /></Grid>
        <Grid item xs={12} sm={6}><StatCard title={balanceLabel} value={data ? Math.abs(Number(data.balance)) : null} icon={<AccountBalanceWalletOutlined />} valueFormat="currency" color="primary" useCompactNotation={false}
          subtitle={<><Box component="span" sx={{ display: 'block' }}>{data ? available > 0 ? 'Après règlements et avances au compte' : 'Après les règlements enregistrés' : 'Vérification du solde…'}</Box>
            {available > 0 && <Button size="small" onClick={onOpen} aria-haspopup="dialog" endIcon={<ChevronRight />} sx={{ display: 'flex', px: 0, py: 0.5, mt: 0.5, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', fontWeight: 500, fontSize: '0.75rem' }}>
              Avances au compte : {formatMontant(available, { useCompactNotation: false, minimumFractionDigits: 2 })}
            </Button>}</>} /></Grid>
      </Grid>
      {error && !open && <Alert severity="error" sx={{ mt: 2 }} action={<Button onClick={retry}>Réessayer</Button>}>{error}</Alert>}
    </Box>}
    <PartyCreditDrawer partyType={partyType} partyId={partyId} partyName={partyName} open={open} onClose={onClose} data={data} error={error} onRetry={retry} />
  </>;
}
