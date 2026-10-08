import {
  Accordion, AccordionDetails, AccordionSummary, Box, Card, CardContent,
  Divider, Stack, Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import DateField from '../../utils/DateField';

const number = (value) => value == null ? '—' : Number(value).toLocaleString('fr-FR');

export function StockSummary({ label, available, categories = [], embedded = false }) {
  const sellable = categories.filter((category) => !['casse', 'perdu'].includes(category.type_oeuf));
  const content = <>
    <Box sx={{ minWidth: 0, flexShrink: 0 }}>
      <Typography component={embedded ? 'h3' : 'h2'} variant={embedded ? 'body1' : 'h6'} fontWeight={700}>{label}</Typography>
      <Typography variant={embedded ? 'h4' : 'h5'} fontWeight={800} color={Number(available) < 0 ? 'error.main' : 'primary.main'} sx={{ mt: 0.5 }}>
        {number(available)} œufs
      </Typography>
    </Box>
    {sellable.length > 0 && <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', minWidth: 0 }}>
      {sellable.map((category) => <Typography key={category.type_oeuf + '-' + (category.calibre || 'none')} variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        {category.label} : <Box component="span" sx={{ fontWeight: 600, color: Number(category.available_eggs) < 0 ? 'error.main' : 'text.primary' }}>{number(category.available_eggs)} œufs</Box>
      </Typography>)}
    </Stack>}
  </>;
  if (embedded) return <Stack spacing={1.25}>{content}</Stack>;
  return <Card variant="outlined" sx={{ borderRadius: 3, mb: 2.5 }}>
    <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={{ xs: 1.5, md: 4 }}>{content}</Stack>
    </CardContent>
  </Card>;
}

export function DailySectionHeader({ selectedDate, onDateChange, title = 'Production du jour', subtitle, actions }) {
  return <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2 }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h2" variant="h6" fontWeight={800}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle || 'Le stock est actuel. La collecte correspond à la date sélectionnée.'}</Typography>
    </Box>
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0 }}>
      <DateField label="Date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)}
        InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 170 }, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }} />
      {actions}
    </Stack>
  </Stack>;
}

export function DailyActivity({ movements = [], title = 'Activité de la journée' }) {
  return <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', bgcolor: 'background.paper', '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMore />} aria-controls="daily-activity-content" id="daily-activity-header">
      <Typography component="h3" fontWeight={700}>{title}</Typography>
    </AccordionSummary>
    <AccordionDetails id="daily-activity-content">
      {movements.length === 0 ? <Typography variant="body2" color="text.secondary">Aucun mouvement pour cette date.</Typography> :
        <Stack spacing={1.5} divider={<Divider />}>
          {movements.map((movement, index) => <Stack key={movement.type + '-' + index} direction="row" spacing={2} alignItems="center">
            <Typography variant="caption" color="text.secondary">{movement.time || '--:--'}</Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{movement.type === 'loss' ? 'Œufs cassés' : movement.label}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{movement.nom_batiment ? movement.nom_batiment + ' · ' : ''}{movement.detail}</Typography>
            </Box>
            <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>
              {movement.type === 'production' ? '+' : '-'}{number(Math.abs(Number(movement.quantity || 0)))} œufs
            </Typography>
          </Stack>)}
        </Stack>}
    </AccordionDetails>
  </Accordion>;
}
