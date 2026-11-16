import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Box, Button, Divider, IconButton, List, ListItem, ListItemText, Popover, Tooltip, Typography } from '@mui/material';
import { NotificationsNone as NotificationsIcon } from '@mui/icons-material';
import { get, patch } from '../services/api';
import { deferredStockQuantities } from '../pages/Transactions/deferredStockQuantities';
import { getBusinessDateInput } from '../utils/businessDate';
import useCorrectionRefresh from './Corrections/useCorrectionRefresh';

const readDismissals = (key) => {
  if (!key) return {};
  try {
    return JSON.parse(window.localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
};

function AlertCenter({ userId }) {
  const [anchor, setAnchor] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [deferredSales, setDeferredSales] = useState([]);
  const deliveryRequest = useRef(null);
  const storageKey = userId == null ? null : `delivery-alert-dismissals:${userId}`;
  const [dismissals, setDismissals] = useState(() => readDismissals(storageKey));

  const load = useCallback(async () => {
    const [alertsResult, summaryResult] = await Promise.allSettled([
      get('/alerts', { params: { unread_only: true, limit: 20 } }),
      get('/alerts/summary'),
    ]);
    if (alertsResult.status === 'fulfilled') setAlerts(alertsResult.value || []);
    if (summaryResult.status === 'fulfilled') setUnreadCount(summaryResult.value?.unread_count || 0);
    else if (alertsResult.status === 'fulfilled') setUnreadCount((alertsResult.value || []).length);
  }, []);
  const loadDeliveries = useCallback(() => {
    deliveryRequest.current?.abort();
    const request = new AbortController();
    deliveryRequest.current = request;
    get('/transactions/deferred-sales', { silent: true, signal: request.signal }).then(
      data => {
        if (!request.signal.aborted) setDeferredSales(Array.isArray(data) ? data : []);
      },
      () => { /* Keep the last successful result until the next refresh. */ },
    );
  }, []);
  useCorrectionRefresh(loadDeliveries);
  useEffect(() => {
    const refresh = () => {
      load();
      loadDeliveries();
    };
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => {
      window.clearInterval(interval);
      deliveryRequest.current?.abort();
    };
  }, [load, loadDeliveries]);
  useEffect(() => {
    const syncDismissals = (event) => {
      if (event.key === storageKey || event.key === null) setDismissals(readDismissals(storageKey));
    };
    window.addEventListener('storage', syncDismissals);
    return () => window.removeEventListener('storage', syncDismissals);
  }, [storageKey]);

  const markRead = async (id) => {
    try {
      await patch(`/alerts/${id}/read`);
      setAlerts((current) => current.filter((item) => item.id_alerte !== id));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch { /* keep visible for retry */ }
  };

  const dismissDelivery = (saleId, version) => {
    const next = { ...dismissals, ...readDismissals(storageKey), [saleId]: version };
    try {
      if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch { /* The reminder can still be dismissed for this session. */ }
    setDismissals(next);
  };

  const today = getBusinessDateInput();
  const deliveryAlerts = [];
  for (const sale of deferredSales) {
    const { pending, reserved, toProduce } = deferredStockQuantities(sale);
    const dueDate = sale.date_livraison_prevue;
    const due = Boolean(dueDate && dueDate <= today);
    if (!pending || (!reserved && !due)) continue;

    // New stock, a changed due date, or reaching the due date can require attention again.
    const version = JSON.stringify([dueDate, due, pending, reserved]);
    const saleId = sale.id_transaction;
    if (dismissals[saleId] === version) continue;
    deliveryAlerts.push({ sale, version, reserved, toProduce });
  }

  return (
    <>
      <Tooltip title="Alertes">
        <IconButton
          onClick={(event) => {
            setAnchor(event.currentTarget);
            loadDeliveries();
          }}
          aria-label="Ouvrir les alertes"
          color="inherit"
        >
          <Badge badgeContent={unreadCount + deliveryAlerts.length} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: { xs: 320, sm: 380 }, maxWidth: 'calc(100vw - 32px)' }}>
          <Box sx={{ p: 2 }}><Typography fontWeight={700}>Alertes non lues</Typography></Box>
          <Divider />
          {alerts.length === 0 && deliveryAlerts.length === 0 ? (
            <Typography sx={{ p: 2 }} color="text.secondary">Aucune alerte.</Typography>
          ) : (
            <List dense>
              {deliveryAlerts.map(({ sale, version, reserved, toProduce }) => {
                const saleId = sale.id_transaction;
                const quantities = [
                  reserved > 0 && `${reserved.toLocaleString('fr-FR')} prêts`,
                  toProduce > 0 && `${toProduce.toLocaleString('fr-FR')} à produire`,
                ].filter(Boolean).join(' · ');
                return (
                  <ListItem
                    key={`delivery-${saleId}`}
                    secondaryAction={
                      <Button size="small" onClick={() => dismissDelivery(saleId, version)}>Lu</Button>
                    }
                  >
                    <ListItemText
                      primary={
                        <Button
                          component="a"
                          href={`/transactions/${saleId}?from=deliveries`}
                          sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}
                        >
                          {reserved > 0 ? 'Stock prêt à compléter' : 'Livraison à traiter'}
                        </Button>
                      }
                      secondary={`${sale.nom_client} · Vente #${saleId} · ${quantities}`}
                    />
                  </ListItem>
                );
              })}
              {alerts.map((alert) => (
                <ListItem
                  key={alert.id_alerte}
                  secondaryAction={<Button size="small" onClick={() => markRead(alert.id_alerte)}>Lu</Button>}
                >
                  <ListItemText primary={alert.titre} secondary={alert.message} />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
}

export default AlertCenter;
