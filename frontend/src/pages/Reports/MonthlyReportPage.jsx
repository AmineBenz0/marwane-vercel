import { useEffect, useId, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Collapse, Grid, IconButton, Paper, Stack, Typography } from '@mui/material';
import { FileDownload as DownloadIcon, InfoOutlined, PictureAsPdf as PdfIcon } from '@mui/icons-material';
import { get } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { exportToPDF } from '../../utils/exportToPDF';
import { getBusinessMonthInput } from '../../utils/businessDate';
import { formatMonthYear, formatShortDate } from '../../utils/dateFormatting';
import ExpandableDetails from '../../components/ExpandableDetails';

const number = (value, maximumFractionDigits = 2) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits }).format(Number(value || 0));
const money = value => value == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'MAD' }).format(Number(value));
const displayReportValue = row => row.type === 'text' ? row.valeur : row.type === 'money' ? money(row.valeur) : number(row.valeur, 3);

function ReportRows({ rows }) {
  return <Stack spacing={1.5}>{rows.map(row => <Stack direction="row" justifyContent="space-between" spacing={2} key={row.indicateur}>
    <Typography>{row.indicateur}</Typography><Typography fontWeight={700} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{displayReportValue(row)}</Typography>
  </Stack>)}</Stack>;
}

function MonthlyReportPage() {
  const [month, setMonth] = useState(getBusinessMonthInput);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const infoId = useId();
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    get('/reports/monthly', { params: { month } }).then(data => { if (!cancelled) setReport(data); })
      .catch(err => { if (!cancelled) { setReport(null); setError(err?.response?.data?.detail || err?.message || 'Le rapport n’a pas pu être chargé.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const groups = useMemo(() => report ? {
    activity: [
      { indicateur: 'Ventes', valeur: report.ventes, type: 'money' },
      { indicateur: 'Achats', valeur: report.achats, type: 'money' },
      { indicateur: 'Charges', valeur: report.charges, type: 'money' },
    ],
    cash: [
      { indicateur: 'Entrées caisse', valeur: report.caisse_entrees, type: 'money' },
      { indicateur: 'Sorties caisse', valeur: report.caisse_sorties, type: 'money' },
    ],
    bank: [
      { indicateur: 'Entrées banques', valeur: report.banques_entrees, type: 'money' },
      { indicateur: 'Sorties banques', valeur: report.banques_sorties, type: 'money' },
    ],
    historical: [
      { indicateur: 'À encaisser', valeur: report.creances, type: 'money' },
      { indicateur: 'À payer aux fournisseurs', valeur: report.dettes, type: 'money' },
    ],
    current: [
      { indicateur: 'À encaisser', valeur: report.creances_actuelles, type: 'money' },
      { indicateur: 'À payer aux fournisseurs', valeur: report.dettes_actuelles, type: 'money' },
      { indicateur: 'Solde caisse', valeur: report.solde_caisse, type: 'money' },
      ...(report.soldes_bancaires || []).map(account => ({ indicateur: `Solde ${account.nom_banque}`, valeur: account.solde, type: 'money' })),
    ],
    stock: [
      { indicateur: 'Mouvements stock', valeur: report.inventory_movements, type: 'count' },
      { indicateur: 'Variation nette stock', valeur: report.inventory_quantity_delta, type: 'quantity' },
    ],
  } : null, [report]);
  const historicalDate = formatShortDate(report?.date_fin);
  const currentDate = formatShortDate(report?.date_soldes_actuels);
  const exportRows = useMemo(() => groups ? [
    { indicateur: 'Période', valeur: `${formatShortDate(report.date_debut)} – ${formatShortDate(report.date_fin)}` },
    ...[...groups.activity, ...groups.cash, ...groups.bank, ...groups.stock].map(row => ({ indicateur: row.indicateur, valeur: displayReportValue(row) })),
    ...groups.historical.map(row => ({ indicateur: `${row.indicateur} au ${historicalDate}`, valeur: displayReportValue(row) })),
    ...groups.current.map(row => ({ indicateur: `${row.indicateur} actuel au ${currentDate}`, valeur: displayReportValue(row) })),
  ] : [], [groups, report, historicalDate, currentDate]);
  const displayMonth = report ? formatMonthYear(report.month, report.month) : '';
  const exportReport = async outputFormat => {
    if (!report || loading) return;
    const columns = [{ id: 'indicateur', label: 'Indicateur' }, { id: 'valeur', label: 'Valeur' }];
    if (outputFormat === 'pdf') exportToPDF(exportRows, columns, `Rapport mensuel ${displayMonth}`, `rapport_mensuel_${report.month}`);
    else await exportToExcelAdvanced(exportRows, columns, `rapport_mensuel_${report.month}`, 'Synthèse');
  };
  const hasBankActivity = !!report && ((report.soldes_bancaires || []).length > 0 || Number(report.banques_entrees) !== 0 || Number(report.banques_sorties) !== 0);

  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
      <Typography component="h1" variant="h4" fontWeight={700}>Rapport mensuel</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <input aria-label="Mois du rapport" type="month" value={month} onChange={event => setMonth(event.target.value)} />
        <Button startIcon={<DownloadIcon />} onClick={() => exportReport('excel')} disabled={!report || loading}>Excel</Button>
        <Button startIcon={<PdfIcon />} onClick={() => exportReport('pdf')} disabled={!report || loading}>PDF</Button>
      </Stack>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress aria-label="Chargement du rapport" /></Box> : report && <>
      <Typography color="text.secondary" sx={{ mb: 2 }}>{displayMonth} · Du {formatShortDate(report.date_debut)} au {historicalDate}</Typography>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography component="h2" variant="h6" fontWeight={700}>Activité du mois</Typography>
        <IconButton aria-label="Calcul des livraisons différées" aria-expanded={showInfo} aria-controls={infoId} onClick={() => setShowInfo(value => !value)}><InfoOutlined /></IconButton>
      </Stack>
      <Collapse in={showInfo}><Box id={infoId} sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1, my: 1 }}>
        <Typography variant="body2">Le stock disponible est réservé automatiquement au fil des productions. Ces réservations ne créent pas de nouvelle vente et ne modifient ni le montant ni les paiements.</Typography>
      </Box></Collapse>
      <Grid container spacing={2} sx={{ mt: 0, mb: 3 }}>{groups.activity.map(row => <Grid item xs={12} sm={6} md={4} key={row.indicateur}>
        <Card variant="outlined"><CardContent><Typography variant="body2" color="text.secondary">{row.indicateur}</Typography><Typography fontWeight={800} sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums', fontSize: { xs: '1.4rem', md: '1.6rem' } }}>{money(row.valeur)}</Typography></CardContent></Card>
      </Grid>)}</Grid>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}><Typography component="h2" variant="h6" fontWeight={700} sx={{ mb: 2 }}>Mouvements de caisse du mois</Typography><ReportRows rows={groups.cash} /></Paper>
      {hasBankActivity && <Paper variant="outlined" sx={{ p: 2, mb: 2 }}><Typography component="h2" variant="h6" fontWeight={700} sx={{ mb: 2 }}>Mouvements bancaires du mois</Typography><ReportRows rows={groups.bank} /></Paper>}
      <Paper component="section" aria-label="Situation actuelle" variant="outlined" sx={{ p: 2, mb: 2 }}><Stack direction="row" justifyContent="space-between" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}><Typography component="h2" variant="h6" fontWeight={700}>Situation actuelle</Typography><Typography variant="body2" color="text.secondary">Au {currentDate}</Typography></Stack><ReportRows rows={groups.current} /></Paper>
      <ExpandableDetails label={`Situation à la fin du mois · Au ${historicalDate}`}><ReportRows rows={groups.historical} /></ExpandableDetails>
      <ExpandableDetails label="Stock du mois"><ReportRows rows={groups.stock} /></ExpandableDetails>
    </>}
  </Box>;
}
export default MonthlyReportPage;
