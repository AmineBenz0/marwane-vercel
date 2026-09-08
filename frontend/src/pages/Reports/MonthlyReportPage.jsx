import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Grid, Paper, Stack, Typography } from '@mui/material';
import { FileDownload as DownloadIcon, PictureAsPdf as PdfIcon } from '@mui/icons-material';
import { get } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { exportToPDF } from '../../utils/exportToPDF';
import { getBusinessMonthInput } from '../../utils/businessDate';

const number = (value, maximumFractionDigits = 2) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits }).format(Number(value || 0));
const money = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'MAD' }).format(Number(value || 0));
const displayReportValue = (row) => row.type === 'money' ? money(row.valeur) : number(row.valeur, 3);

function MonthlyReportPage() {
  const [month, setMonth] = useState(getBusinessMonthInput);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => { let cancelled = false; setLoading(true); setError(null); get('/reports/monthly', { params: { month } }).then((data) => { if (!cancelled) setReport(data); }).catch((err) => { if (!cancelled) { setReport(null); setError(err?.response?.data?.detail || err?.message || 'Le rapport n’a pas pu être chargé.'); } }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [month]);

  const rows = useMemo(() => report ? [
    { indicateur: 'Ventes', valeur: report.ventes, type: 'money' },
    { indicateur: 'Achats', valeur: report.achats, type: 'money' },
    { indicateur: 'Charges', valeur: report.charges, type: 'money' },
    { indicateur: 'Créances', valeur: report.creances, type: 'money' },
    { indicateur: 'Dettes', valeur: report.dettes, type: 'money' },
    { indicateur: 'Entrées caisse', valeur: report.caisse_entrees, type: 'money' },
    { indicateur: 'Sorties caisse', valeur: report.caisse_sorties, type: 'money' },
    { indicateur: 'Entrées banques', valeur: report.banques_entrees, type: 'money' },
    { indicateur: 'Sorties banques', valeur: report.banques_sorties, type: 'money' },
    { indicateur: 'Mouvements stock', valeur: report.inventory_movements, type: 'count' },
    { indicateur: 'Variation nette stock', valeur: report.inventory_quantity_delta, type: 'quantity' },
  ] : [], [report]);
  const exportRows = useMemo(() => rows.map((row) => ({ indicateur: row.indicateur, valeur: displayReportValue(row) })), [rows]);
  const exportReport = async (format) => { if (!report) return; const columns = [{ id: 'indicateur', label: 'Indicateur' }, { id: 'valeur', label: 'Valeur' }]; if (format === 'pdf') exportToPDF(exportRows, columns, `Rapport mensuel ${report.month}`, `rapport_mensuel_${report.month}`); else await exportToExcelAdvanced(exportRows, columns, `rapport_mensuel_${report.month}`, 'Synthèse'); };

  return <Box><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}><Box><Typography variant="h4" fontWeight={700}>Rapport mensuel</Typography><Typography color="text.secondary">Totaux calculés par le backend, exportables pour le client.</Typography></Box><Stack direction="row" spacing={1}><input aria-label="Mois du rapport" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><Button startIcon={<DownloadIcon />} onClick={() => exportReport('excel')} disabled={!report}>Excel</Button><Button startIcon={<PdfIcon />} onClick={() => exportReport('pdf')} disabled={!report}>PDF</Button></Stack></Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box> : report && <><Grid container spacing={2} sx={{ mb: 3 }}>{[['Ventes', report.ventes, 'money'], ['Achats', report.achats, 'money'], ['Charges', report.charges, 'money'], ['Créances', report.creances, 'money'], ['Dettes', report.dettes, 'money'], ['Mouvements stock', report.inventory_movements, 'count']].map(([label, value, type]) => <Grid item xs={6} md={2} key={label}><Card variant="outlined"><CardContent><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ mt: 0.5 }}>{type === 'money' ? money(value) : number(value, 0)}</Typography></CardContent></Card></Grid>)}</Grid><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Synthèse {report.month}</Typography><Stack spacing={1}>{rows.map((row) => <Stack direction="row" justifyContent="space-between" key={row.indicateur}><Typography>{row.indicateur}</Typography><Typography fontWeight={700}>{displayReportValue(row)}</Typography></Stack>)}</Stack></Paper></>}
  </Box>;
}

export default MonthlyReportPage;
