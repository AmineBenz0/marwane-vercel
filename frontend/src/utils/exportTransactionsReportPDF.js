import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF_COLORS, pdfBrand, pdfBox, pdfClean, pdfDate, pdfExportName,
  pdfFit, pdfFooters, pdfHeading, pdfInteger, pdfMoney,
} from './financialPdfStyles';

const includesPayment = row => {
  const details = pdfClean(row.reglement_label).trim();
  return details.length > 0 && details !== '-';
};

const asNumber = value => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const sameId = row => String(row.id_transaction ?? '-');

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
  autoTable(doc, {
    ...tableStyle(42),
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
    id: sameId(row),
    partner: pdfClean(row.client_ou_fournisseur || '-'),
    product: pdfClean(row.produit_label || ('Produit #' + String(row.id_produit || '-'))),
    building: pdfClean(row.batiment_label || '-'),
    status: row.est_actif === false ? 'Annulee' : 'Active',
  }));

  const transactionRows = source.map(row => [
    row.id,
    pdfDate(row.date_transaction),
    row.partner + '\n' + row.product,
    pdfInteger(row.quantite),
    pdfMoney(row.montant_total, false),
    pdfMoney(row.montant_paye, false),
    pdfMoney(row.montant_restant, false),
    row.status,
  ]);
  const sections = [];
  autoTable(doc, {
    ...tableStyle(43),
    startY: 72,
    head: [['ID', 'DATE', 'PARTENAIRE / PRODUIT', 'QTE', 'MONTANT', 'PAYE', 'RESTE', 'ETAT']],
    body: transactionRows,
    foot: [[
      { content: 'TOTAL ACTIF (hors operations annulees)', colSpan: 4 },
      pdfMoney(total, false), pdfMoney(paid, false), pdfMoney(remaining, false), '',
    ]],
    showFoot: 'lastPage',
    footStyles: {
      fillColor: PDF_COLORS.paleTeal, textColor: PDF_COLORS.navy,
      fontStyle: 'bold', fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 2, right: 2 },
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 22 },
      2: { cellWidth: 106 },
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
        data.cell.styles.textColor = source[data.row.index]?.est_actif === false
          ? PDF_COLORS.muted : PDF_COLORS.teal;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  const registerEnd = doc.getNumberOfPages();

  const payments = source.filter(includesPayment);
  addSection(
    doc, sections, 'Reglements et references',
    String(payments.length) + ' transactions avec un reglement',
    ['ID', 'PARTENAIRE', 'DETAIL DES REGLEMENTS', 'ETAT'],
    payments.map(row => [row.id, row.partner, pdfClean(row.reglement_label), row.status]),
    [13, 85, 147, 29],
  );

  const deferred = source.filter(row => row.est_promesse);
  addSection(
    doc, sections, 'Livraisons differees',
    String(deferred.length) + ' transactions concernees par la livraison differee',
    ['ID', 'PRODUIT / BATIMENT', 'SITUATION ET STOCK', 'LIVRAISON', 'COMPLETE', 'RESERVE', 'RESTE'],
    deferred.map(row => [
      row.id,
      row.product + '\n' + row.building,
      pdfClean(row.etat_stock || row.status) +
        '\nA produire: ' + pdfInteger(row.quantite_a_produire) +
        '  |  Cloture: ' + pdfInteger(row.quantite_annulee),
      pdfDate(row.date_livraison_prevue),
      pdfInteger(row.quantite_completee),
      pdfInteger(row.quantite_reservee),
      pdfInteger(row.quantite_en_attente),
    ]),
    [13, 78, 76, 28, 24, 26, 29],
    [4, 5, 6],
  );

  const totalPages = doc.getNumberOfPages();
  for (let number = 1; number <= totalPages; number += 1) {
    doc.setPage(number);
    const section = sections.find(item => number >= item.start && number <= item.end);
    pdfBrand(doc, section ? 'ANNEXE - DETAILS' : 'EXPORTS - COMPTABILITE');
    if (number === 1) {
      pdfHeading(doc, 'Rapport des transactions', 'Operations du ' + period,
        'Edite le ' + pdfDate(reportDate));
      drawKpi(doc, 'TRANSACTIONS', String(rows.length) + ' - ' + String(active.length) + ' actives', 0);
      drawKpi(doc, 'MONTANT ACTIF', pdfMoney(total), 1, true);
      drawKpi(doc, 'DEJA PAYE', pdfMoney(paid), 2);
      drawKpi(doc, 'RESTE A REGLER', pdfMoney(remaining), 3);
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
