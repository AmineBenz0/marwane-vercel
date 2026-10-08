import { Box, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { InventoryOutlined } from '@mui/icons-material';
import DateField from '../../utils/DateField';

export function StockSummary({ label, available, categories = [] }) {
  const sellable = categories.filter((category) => !['casse', 'perdu'].includes(category.type_oeuf));
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, mb: 2.5, bgcolor: 'background.paper' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} useFlexGap flexWrap="wrap">
          <Stack direction="row" spacing={1.5} alignItems="center">
            <InventoryOutlined color="primary" />
            <Box>
              <Typography component="h2" variant="h6" fontWeight={900}>{label}</Typography>
              <Typography variant="body2" color="text.secondary">Œufs vendables, après déduction des ventes. Cassés exclus.</Typography>
            </Box>
          </Stack>
          <Typography variant="h4" fontWeight={900} color={Number(available) < 0 ? 'error.main' : 'primary.main'}>
            {Number(available || 0).toLocaleString('fr-FR')} œufs
          </Typography>
        </Stack>
        {sellable.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
              {sellable.map((category) => (
                <Box key={category.type_oeuf + '-' + (category.calibre || 'none')} sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{category.label}</Typography>
                  <Typography fontWeight={900} color={Number(category.available_eggs) < 0 ? 'error.main' : 'text.primary'}>
                    {Number(category.available_eggs || 0).toLocaleString('fr-FR')} œufs
                  </Typography>
                </Box>
              ))}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function DailySectionHeader({ selectedDate, onDateChange }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
      <Box>
        <Typography component="h2" variant="h5" fontWeight={900}>Production du jour</Typography>
        <Typography variant="body2" color="text.secondary">La date concerne la journée consultée. Le stock actuel reste inchangé.</Typography>
      </Box>
      <DateField label="Date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)}
        InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 210 }, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' } }} />
    </Stack>
  );
}
