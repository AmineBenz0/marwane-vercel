import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Box, Button, Divider, IconButton, List, ListItem, ListItemText, Popover, Tooltip, Typography } from '@mui/material';
import { NotificationsNone as NotificationsIcon } from '@mui/icons-material';
import { get, patch } from '../services/api';

function AlertCenter() {
  const [anchor, setAnchor] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const load = useCallback(async () => {
    const [alertsResult, summaryResult] = await Promise.allSettled([
      get('/alerts', { params: { unread_only: true, limit: 20 } }),
      get('/alerts/summary'),
    ]);
    if (alertsResult.status === 'fulfilled') setAlerts(alertsResult.value || []);
    if (summaryResult.status === 'fulfilled') setUnreadCount(summaryResult.value?.unread_count || 0);
    else if (alertsResult.status === 'fulfilled') setUnreadCount((alertsResult.value || []).length);
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
  return <>
    <Tooltip title="Alertes"><IconButton onClick={(event) => setAnchor(event.currentTarget)} aria-label="Ouvrir les alertes" color="inherit"><Badge badgeContent={unreadCount} color="error"><NotificationsIcon /></Badge></IconButton></Tooltip>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
      <Box sx={{ width: { xs: 320, sm: 380 }, maxWidth: 'calc(100vw - 32px)' }}><Box sx={{ p: 2 }}><Typography fontWeight={700}>Alertes non lues</Typography></Box><Divider />{alerts.length === 0 ? <Typography sx={{ p: 2 }} color="text.secondary">Aucune alerte.</Typography> : <List dense>{alerts.map((alert) => <ListItem key={alert.id_alerte} secondaryAction={<Button size="small" onClick={() => markRead(alert.id_alerte)}>Lu</Button>}><ListItemText primary={alert.titre} secondary={alert.message} /></ListItem>)}</List>}</Box>
    </Popover>
  </>;
}

export default AlertCenter;
