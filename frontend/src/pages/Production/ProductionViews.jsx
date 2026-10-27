import {
  Box, Card, CardContent,
  Button, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { HistoryOutlined, LayersOutlined } from '@mui/icons-material';
import DateField from '../../utils/DateField';
import ExpandableDetails from '../../components/ExpandableDetails';
import { formatShortDate } from '../../utils/dateFormatting';

const number = (value) => value == null ? '—' : Number(value).toLocaleString('fr-FR');

export function StockSummary({ available, categories = [], reserved, physical, embedded = false, asOf, onViewReservations }) {
  const sellable = categories.filter(category => !['casse', 'perdu'].includes(category.type_oeuf));
  const content = <Stack spacing={1.5}>
    {asOf && <Typography variant="caption" color="text.secondary">Au {formatShortDate(asOf)}</Typography>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ sm: 'center' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component={embedded ? 'h3' : 'h2'} variant={embedded ? 'body1' : 'h6'} fontWeight={700}>Disponible à la vente</Typography>
        <Typography variant="h4" fontWeight={800} color={Number(available) < 0 ? 'error.main' : 'primary.main'} sx={{ mt: 0.5 }}>{number(available)} œufs</Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Typography fontWeight={600}>Réservé aux clients</Typography>
        <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>{number(reserved)} œufs</Typography>
        {Number(reserved) > 0 && onViewReservations && <Button size="small" onClick={onViewReservations} sx={{ mt: 0.5, px: 0 }}>Voir les ventes avec stock réservé</Button>}
      </Box>
    </Stack>
    <ExpandableDetails label="Détail du stock" icon={<LayersOutlined />} meta={`${sellable.length} produits`} contentSx={{ p: 0 }}>
      {sellable.length > 0 && <Box sx={{ px: { xs: 1, sm: 2 }, py: 1 }}><Table size="small" aria-label="Stock par produit" sx={{ tableLayout: 'fixed', '& th, & td': { px: { xs: 0.75, sm: 1.25 }, py: 1.25, overflowWrap: 'anywhere' }, '& th': { textTransform: 'none', fontSize: '0.75rem' }, '& td:not(:first-of-type)': { fontVariantNumeric: 'tabular-nums' } }}>
        <TableHead><TableRow><TableCell sx={{ width: '44%' }}>Produit</TableCell><TableCell align="right">Disponible</TableCell><TableCell align="right">Réservé</TableCell></TableRow></TableHead>
        <TableBody>{sellable.map(category => <TableRow key={`${category.type_oeuf}-${category.calibre || 'none'}`}>
          <TableCell component="th" scope="row">{category.label}</TableCell><TableCell align="right">{number(category.available_eggs)}</TableCell><TableCell align="right">{number(category.reserved_eggs)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></Box>}
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ px: 2, py: 1.75, bgcolor: 'grey.50', borderTop: '1px solid', borderColor: 'divider' }}><Box><Typography variant="body2" fontWeight={700}>Stock total</Typography><Typography variant="caption" color="text.secondary">Disponible + réservé</Typography></Box><Typography variant="body2" fontWeight={700} sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{number(physical)} œufs</Typography></Stack>
    </ExpandableDetails>
  </Stack>;
  if (embedded) return content;
  return <Card variant="outlined" sx={{ borderRadius: 3, mb: 2.5 }}><CardContent sx={{ p: { xs: 2, md: 2.5 } }}>{content}</CardContent></Card>;
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
  return <ExpandableDetails label={title} headingComponent="h3" icon={<HistoryOutlined />} meta={`${movements.length} mouvement${movements.length === 1 ? '' : 's'}`}>
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
  </ExpandableDetails>;
}
