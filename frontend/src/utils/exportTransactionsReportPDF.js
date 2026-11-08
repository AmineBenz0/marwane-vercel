import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addTransactionPaymentsSection } from './transactionPaymentsPdf';
import {
  PDF_COLORS, pdfBrand, pdfBox, pdfClean, pdfDate, pdfExportName,
  pdfFit, pdfFooters, pdfHeading, pdfInteger, pdfMoney,
} from './financialPdfStyles';

const asNumber = value => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

function drawKpi(doc, label, value, column, highlight = false) {
  const x = 11.5 + column * 69.25;
  const y = 46;
  const width = 65.25;
  pdfBox(doc, x, y, width, 19.5, highlight ? PDF_COLORS.paleTeal : PDF_COLORS.pale);
  doc.setFillColor(...(highlight ? PDF_COLORS.teal : PDF_COLORS.line));
  doc.rect(x, y, width, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(pdfClean(label), x + 3.5, y + 6.8);
  doc.setTextColor(...(highlight ? PDF_COLORS.teal : PDF_COLORS.navy));
  pdfFit(doc, value, x + 3.5, y + 15.8, width - 7, 11.5, 8);
}

function tableStyle(top = 42) {
  return {
    theme: 'striped',
    margin: { top, left: 11.5, right: 11.5, bottom: 20 },
    tableWidth: 274,
    showHead: 'everyPage',
    styles: {
      font: 'helvetica', fontSize: 8.25, textColor: PDF_COLORS.ink,
      cellPadding: { top: 2.9, bottom: 2.9, left: 2, right: 2 },
      overflow: 'linebreak', valign: 'middle', minCellHeight: 9.8,
      lineWidth: 0,
    },
    headStyles: {
      fillColor: PDF_COLORS.darkNavy, textColor: PDF_COLORS.white,
      fontStyle: 'bold', fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      minCellHeight: 10,
    },
    alternateRowStyles: { fillColor: PDF_COLORS.pale },
    bodyStyles: { fillColor: PDF_COLORS.white },
  };
}

function addSection(doc, section, title, subtitle, columns, data, widths, emphasis = []) {
  if (!data.length) return;
  doc.addPage();
  const first = doc.getNumberOfPages();
  // Fill the available height naturally. AutoTable moves the next complete row
  // to a new page only when it no longer fits above the footer margin.
  autoTable(doc, {
    ...tableStyle(43),
    // Compact annex rows just enough to avoid orphaning the final delivery
    // on a nearly empty page, without reducing font size or column width.
    styles: {
      ...tableStyle(43).styles,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      minCellHeight: 9.2,
    },
    startY: 43,
    head: [columns],
    body: data,
    columnStyles: Object.fromEntries(widths.map((width, index) => [
      index, { cellWidth: width, halign: emphasis.includes(index) ? 'right' : 'left' },
    ])),
    rowPageBreak: 'avoid',
  });
  const end = doc.getNumberOfPages();
  section.push({ start: first, end, title, subtitle });
}

export function exportTransactionsReportPDF(rows, filename = 'rapport_transactions') {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const reportDate = new Date();
  const active = rows.filter(row => row.est_actif !== false);
  const total = active.reduce((sum, row) => sum + asNumber(row.montant_total), 0);
  const paid = active.reduce((sum, row) => sum + asNumber(row.montant_paye), 0);
  const remaining = active.reduce((sum, row) => sum + asNumber(row.montant_restant), 0);
  const validDates = rows.map(row => row.date_transaction).filter(Boolean).sort();
  const period = validDates.length
    ? pdfDate(validDates[0]) + ' au ' + pdfDate(validDates[validDates.length - 1])
    : 'Periode selectionnee';
  const source = rows.map(row => ({
    ...row,
    partner: pdfClean(row.client_ou_fournisseur || '-'),
    product: pdfClean(row.produit_label || '-'),
    building: pdfClean(row.batiment_label || '-'),
    status: row.est_actif === false ? 'Annulée' : 'Active',
  }));

  const transactionRows = source.map(row => [
    pdfDate(row.date_transaction),
    row.partner,
    row.product,
    pdfInteger(row.quantite),
    pdfMoney(row.montant_total, false),
    pdfMoney(row.montant_paye, false),
    pdfMoney(row.montant_restant, false),
    row.status,
  ]);
  const sections = [];
  autoTable(doc, {
    ...tableStyle(43),
    styles: {
      ...tableStyle(43).styles,
      // Preserve the approved spacing while keeping ordinary rows together.
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      minCellHeight: 9.2,
    },
    startY: 72,
    rowPageBreak: 'avoid',
    head: [['DATE', 'PARTENAIRE', 'PRODUIT', 'QTÉ', 'MONTANT', 'PAYÉ', 'RESTE', 'ÉTAT']],
    body: transactionRows,
    foot: [[
      { content: 'TOTAL ACTIF (hors opérations annulées)', colSpan: 4 },
      pdfMoney(total, false), pdfMoney(paid, false), pdfMoney(remaining, false), '',
    ]],
    showFoot: 'lastPage',
    footStyles: {
      fillColor: PDF_COLORS.paleTeal, textColor: PDF_COLORS.navy,
      fontStyle: 'bold', fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 2, right: 2 },
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 64 },
      2: { cellWidth: 54 },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 29, halign: 'right' },
      6: { cellWidth: 30, halign: 'right', textColor: PDF_COLORS.teal },
      7: { cellWidth: 29, halign: 'center' },
    },
    didParseCell: data => {
      if (data.section === 'body' && data.column.index === 4) {
        const row = source[data.row.index];
        data.cell.styles.textColor = row?.id_client != null ? PDF_COLORS.teal : PDF_COLORS.navy;
      }
      if (data.section === 'body' && data.column.index === 7) {
        data.cell.text = [];
      }
    },
    didDrawCell: data => {
      if (data.section !== 'body' || data.column.index !== 7) return;
      // Cell.raw survives page splitting. Row.index is -1 on continuations.
      const status = data.cell.raw;
      if (status !== 'Annulée' && status !== 'Active') return;
      const cancelled = status === 'Annulée';
      const { x, y, width, height } = data.cell;
      const pillWidth = Math.min(width - 4, 22);
      const pillHeight = 7;
      const pillX = x + (width - pillWidth) / 2;
      const pillY = y + (height - pillHeight) / 2;
      doc.setFillColor(...(cancelled ? PDF_COLORS.paleBlue : PDF_COLORS.paleTeal));
      doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 3, 3, 'F');
      doc.setTextColor(...(cancelled ? PDF_COLORS.muted : PDF_COLORS.teal));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.text(status,
        x + width / 2, pillY + 4.9, { align: 'center' });
    },
  });

  addTransactionPaymentsSection(doc, sections, source);

  const deferred = source.filter(row => row.est_promesse);
  addSection(
    doc, sections, 'Livraisons différées',
    String(deferred.length) + ' transactions concernées par une livraison différée',
    ['PRODUIT / BATIMENT', 'SITUATION ET STOCK', 'LIVRAISON', 'COUVERT', 'RÉSERVÉ', 'RESTE'],
    deferred.map(row => [
      row.product + '\n' + row.building,
      pdfClean(row.etat_stock || row.status) + (row.quantite_a_produire == null
        ? '' : '\nÀ produire : ' + pdfInteger(row.quantite_a_produire)),
      pdfDate(row.date_livraison_prevue),
      pdfInteger(row.quantite_couverte),
      pdfInteger(row.quantite_reservee),
      pdfInteger(row.quantite_en_attente),
    ]),
    [91, 76, 28, 24, 26, 29],
    [3, 4, 5],
  );

  const totalPages = doc.getNumberOfPages();
  for (let number = 1; number <= totalPages; number += 1) {
    doc.setPage(number);
    const section = sections.find(item => number >= item.start && number <= item.end);
    pdfBrand(doc, section ? 'ANNEXE - DÉTAILS' : 'EXPORTS - COMPTABILITÉ');
    if (number === 1) {
      pdfHeading(doc, 'Rapport des transactions', 'Opérations du ' + period,
        'Édité le ' + pdfDate(reportDate));
      drawKpi(doc, 'TRANSACTIONS', String(rows.length) + ' - ' + String(active.length) + ' actives', 0);
      drawKpi(doc, 'MONTANT ACTIF', pdfMoney(total), 1, true);
      drawKpi(doc, 'DÉJÀ PAYÉ', pdfMoney(paid), 2);
      drawKpi(doc, 'RESTE À RÉGLER', pdfMoney(remaining), 3);
    } else if (section) {
      pdfHeading(doc, section.title + (number > section.start ? ' - suite' : ''),
        section.subtitle);
    } else {
      pdfHeading(doc, 'Registre - suite', String(rows.length) + ' transactions | montants en MAD');
    }
  }
  pdfFooters(doc, reportDate);
  doc.save(pdfExportName(filename));
}
