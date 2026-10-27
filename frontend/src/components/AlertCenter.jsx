import { useCallback, useEffect, useState } from 'react';
import { Badge, Box, Button, Divider, IconButton, List, ListItem, ListItemText, Popover, Tooltip, Typography } from '@mui/material';
import { NotificationsNone as NotificationsIcon } from '@mui/icons-material';
import { get, patch } from '../services/api';

function AlertCenter() {
  const [anchor, setAnchor] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [promiseAlerts, setPromiseAlerts] = useState([]);
  const [dismissedPromises, setDismissedPromises] = useState([]);
  const load = useCallback(async () => {
    const [alertsResult, summaryResult, promisesResult] = await Promise.allSettled([
      get('/alerts', { params: { unread_only: true, limit: 20 } }),
      get('/alerts/summary'),
      get('/transactions/deferred-sales'),
    ]);
    if (alertsResult.status === 'fulfilled') setAlerts(Array.isArray(alertsResult.value) ? alertsResult.value : []);
    if (summaryResult.status === 'fulfilled') setUnreadCount(summaryResult.value?.unread_count || 0);
    else if (alertsResult.status === 'fulfilled') setUnreadCount(Array.isArray(alertsResult.value) ? alertsResult.value.length : 0);
    if (promisesResult.status === 'fulfilled') {
      const today = new Date().toISOString().slice(0, 10);
      setPromiseAlerts((Array.isArray(promisesResult.value) ? promisesResult.value : []).filter(sale => Number(sale.quantite_en_attente || 0) > 0 && (Number(sale.quantite_reservee || 0) > 0 || (sale.date_livraison_prevue && sale.date_livraison_prevue <= today))));
    }
  }, []);
  useEffect(() => {
    load();
    const interval = window.setInterval(load, 60000);
    return () => window.clearInterval(interval);
  }, [load]);
  const markRead = async (id) => {
    try {
      await patch(`/alerts/${id}/read`);
      setAlerts((current) => current.filter((item) => item.id_alerte !== id));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch { /* keep visible for retry */ }
  };
  const visiblePromiseAlerts = promiseAlerts.filter(sale => !dismissedPromises.includes(sale.id_transaction));
  return <>
    <Tooltip title="Alertes"><IconButton onClick={(event) => setAnchor(event.currentTarget)} aria-label="Ouvrir les alertes" color="inherit"><Badge badgeContent={unreadCount + visiblePromiseAlerts.length} color="error"><NotificationsIcon /></Badge></IconButton></Tooltip>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
      <Box sx={{ width: { xs: 320, sm: 380 }, maxWidth: 'calc(100vw - 32px)' }}><Box sx={{ p: 2 }}><Typography fontWeight={700}>Alertes non lues</Typography></Box><Divider />{alerts.length === 0 && visiblePromiseAlerts.length === 0 ? <Typography sx={{ p: 2 }} color="text.secondary">Aucune alerte.</Typography> : <List dense>{visiblePromiseAlerts.map(sale => <ListItem key={`promise-${sale.id_transaction}`} secondaryAction={<Button size="small" onClick={() => setDismissedPromises(current => [...current, sale.id_transaction])}>Lu</Button>}><ListItemText primary={<Button component="a" href={`/transactions/${sale.id_transaction}?from=deliveries`} onClick={() => setAnchor(null)} sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 700 }}>{Number(sale.quantite_reservee || 0) > 0 ? 'Stock prêt à compléter' : 'Livraison à traiter'}</Button>} secondary={`${sale.nom_client} · Vente #${sale.id_transaction} · ${Number(sale.quantite_reservee || sale.quantite_en_attente).toLocaleString('fr-FR')} œufs`} /></ListItem>)}{alerts.length > 0 && visiblePromiseAlerts.length > 0 && <Divider />}{alerts.map((alert) => <ListItem key={alert.id_alerte} secondaryAction={<Button size="small" onClick={() => markRead(alert.id_alerte)}>Lu</Button>}><ListItemText primary={alert.titre} secondary={alert.message} /></ListItem>)}</List>}</Box>
    </Popover>
  </>;
}

export default AlertCenter;
