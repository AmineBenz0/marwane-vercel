import { Box, Card, CardContent, Stack, Tab, Tabs, Typography } from '@mui/material';
import { InventoryOutlined } from '@mui/icons-material';
import { formatShortDate } from '../../utils/dateFormatting';
import { localToday } from './useProductionView';

export function StockSummary({ label, available, selectedDate }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, mb: 2.5 }}>
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} useFlexGap flexWrap="wrap">
          <Stack direction="row" spacing={1.5} alignItems="center">
            <InventoryOutlined color="primary" />
            <Box>
              <Typography fontWeight={900}>{label}</Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedDate === localToday() ? 'Stock actuel' : 'Stock au ' + formatShortDate(selectedDate)}
              </Typography>
            </Box>
          </Stack>
          <Typography variant="h5" fontWeight={900} color="primary.main">
            {Number(available || 0).toLocaleString('fr-FR')} œufs
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ProductionTabs({ view, onChange }) {
  return (
    <Tabs value={view} onChange={(_, value) => onChange(value)} variant="fullWidth"
      aria-label="Production et stock" sx={{ mb: 2.5, bgcolor: 'background.paper', borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
      <Tab value="journee" label="Journée" id="production-tab-journee" aria-controls="production-panel-journee" sx={{ fontWeight: 800 }} />
      <Tab value="stocks" label="Stocks" id="production-tab-stocks" aria-controls="production-panel-stocks" sx={{ fontWeight: 800 }} />
    </Tabs>
  );
}

export function ProductionPanel({ view, children }) {
  return (
    <>
      {['journee', 'stocks'].map((tab) => (
        <Box key={tab} role="tabpanel" hidden={view !== tab} id={'production-panel-' + tab}
          aria-labelledby={'production-tab-' + tab} sx={{ minWidth: 0 }}>
          {view === tab ? children : null}
        </Box>
      ))}
    </>
  );
}
