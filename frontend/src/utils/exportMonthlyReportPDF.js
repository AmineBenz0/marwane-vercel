import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF_COLORS, pdfBrand, pdfBox, pdfClean, pdfDate, pdfExportName,
  pdfFit, pdfFooters, pdfMoney, pdfInteger,
} from './financialPdfStyles';

const pageWidth = 210;
const margin = 12;
const interior = pageWidth - 2 * margin;

function sectionTitle(doc, label, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text(pdfClean(label), margin, y);
}

function metric(doc, x, y, width, label, value, accent) {
  pdfBox(doc, x, y, width, 24, PDF_COLORS.pale);
  doc.setFillColor(...accent);
  doc.rect(x, y, width, 0.9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(pdfClean(label), x + 4, y + 8.5);
  doc.setTextColor(...accent);
  pdfFit(doc, pdfMoney(value), x + 4, y + 18.3, width - 8, 12, 8.5);
}

function flowCard(doc, x, y, title, inflow, outflow) {
  const width = (interior - 4) / 2;
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setLineWidth(0.4);
  doc.setFillColor(...PDF_COLORS.white);
  doc.roundedRect(x, y, width, 32, 3, 3, 'FD');
  doc.setTextColor(...PDF_COLORS.navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(title, x + 4, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.muted);
  doc.setFontSize(8);
  doc.text('Entrées', x + 4, y + 18);
  doc.text('Sorties', x + 4, y + 26.5);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.setFont('helvetica', 'bold');
  pdfFit(doc, pdfMoney(inflow), x + width - 4, y + 18, width - 36, 9, 7, 'right');
  pdfFit(doc, pdfMoney(outflow), x + width - 4, y + 26.5, width - 36, 9, 7, 'right');
}

function stockCard(doc, x, y, title, value) {
  const width = (interior - 4) / 2;
  pdfBox(doc, x, y, width, 23, PDF_COLORS.pale);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(pdfClean(title), x + 4, y + 8);
  doc.setTextColor(...PDF_COLORS.navy);
  pdfFit(doc, pdfInteger(value), x + 4, y + 18, width - 8, 13, 9);
}

function balances(report) {
  const oldBanks = report.soldes_bancaires_historiques || [];
  const newBanks = report.soldes_bancaires || [];
  const oldMap = new Map(oldBanks.map(bank => [String(bank.id_compte), bank]));
  const currentMap = new Map(newBanks.map(bank => [String(bank.id_compte), bank]));
  const banks = [...new Set([...oldMap.keys(), ...currentMap.keys()])].map(key => {
    const oldBank = oldMap.get(key);
    const currentBank = currentMap.get(key);
    return [
      'Solde ' + pdfClean((currentBank || oldBank)?.nom_banque || ('Banque #' + key)),
      pdfMoney(oldBank?.solde || 0),
      pdfMoney(currentBank?.solde || 0),
    ];
  });

  return [
    ['À encaisser', pdfMoney(report.creances), pdfMoney(report.creances_actuelles)],
    ['À payer aux fournisseurs', pdfMoney(report.dettes), pdfMoney(report.dettes_actuelles)],
    ['Solde caisse', pdfMoney(report.solde_caisse_historique), pdfMoney(report.solde_caisse)],
    ...banks,
  ];
}

const monthLabel = month => {
  const [year, number] = String(month || '').split('-').map(Number);
  if (!year || !number || number < 1 || number > 12) return pdfClean(month);
  const title = new Date(year, number - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric',
  });
  return pdfClean(title.charAt(0).toUpperCase() + title.slice(1));
};

export function exportMonthlyReportPDF(report, filename) {
  if (!report) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const edition = new Date();
  const month = monthLabel(report.month);
  const projected = Boolean(report.date_soldes_actuels &&
    report.date_fin > report.date_soldes_actuels);

  metric(doc, margin, 56, (interior - 8) / 3, 'VENTES', report.ventes, PDF_COLORS.teal);
  metric(doc, margin + (interior - 8) / 3 + 4, 56, (interior - 8) / 3,
    'ACHATS', report.achats, PDF_COLORS.navy);
  metric(doc, margin + 2 * ((interior - 8) / 3 + 4), 56, (interior - 8) / 3,
    'CHARGES', report.charges, PDF_COLORS.gold);

  sectionTitle(doc, 'Flux financiers du mois', 92);
  flowCard(doc, margin, 98, 'Caisse', report.caisse_entrees, report.caisse_sorties);
  flowCard(doc, margin + (interior - 4) / 2 + 4, 98, 'Banques',
    report.banques_entrees, report.banques_sorties);

  sectionTitle(doc, 'Situation financière', 146);
  const monthEnd = pdfDate(report.date_soldes_historiques || report.date_fin);
  const currentDate = pdfDate(report.date_soldes_actuels);
  autoTable(doc, {
    startY: 152,
    margin: { top: 44, left: margin, right: margin, bottom: 24 },
    tableWidth: interior,
    theme: 'striped',
    showHead: 'everyPage',
    head: [[
      'INDICATEUR',
      projected ? 'PROJECTION AU ' + monthEnd : 'FIN DE MOIS',
      'ACTUEL AU ' + currentDate,
    ]],
    body: balances(report),
    headStyles: {
      fillColor: PDF_COLORS.paleBlue,
      textColor: PDF_COLORS.muted,
      fontStyle: 'bold', fontSize: 7.6,
      cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 },
    },
    styles: {
      font: 'helvetica', fontSize: 8.8, textColor: PDF_COLORS.ink,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      minCellHeight: 9.7,
      overflow: 'linebreak', valign: 'middle', lineWidth: 0,
    },
    alternateRowStyles: { fillColor: PDF_COLORS.pale },
    bodyStyles: { fillColor: PDF_COLORS.white },
    columnStyles: {
      0: { cellWidth: 78, halign: 'left' },
      1: { cellWidth: 54, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 54, halign: 'right', fontStyle: 'bold' },
    },
    rowPageBreak: 'avoid',
  });

  let stockY = (doc.lastAutoTable?.finalY || 205) + 11;
  if (stockY + 36 > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    stockY = 45;
  }
  sectionTitle(doc, 'Stock et production', stockY);
  stockCard(doc, margin, stockY + 5.5, 'MOUVEMENTS DE STOCK', report.inventory_movements);
  stockCard(doc, margin + (interior - 4) / 2 + 4, stockY + 5.5,
    'VARIATION NETTE', report.inventory_quantity_delta);

  const pages = doc.getNumberOfPages();
  for (let number = 1; number <= pages; number += 1) {
    doc.setPage(number);
    pdfBrand(doc, 'SUIVI FINANCIER - MENSUEL');
    doc.setTextColor(...PDF_COLORS.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(number === 1 ? 19 : 16);
    doc.text('Rapport mensuel' + (number > 1 ? ' - suite' : ''), margin, 31);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_COLORS.teal);
    doc.setFontSize(11.5);
    doc.text(month, margin, 39);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.setFontSize(8.3);
    const label = 'Période : ' + pdfDate(report.date_debut) + ' au ' + pdfDate(report.date_fin) +
      (projected ? '  |  Fin de mois provisoire' : '');
    doc.text(pdfClean(label), margin, 46);
    doc.text('Édition ' + pdfDate(edition), pageWidth - margin, 31, { align: 'right' });
  }

  pdfFooters(doc, edition);
  doc.save(pdfExportName(filename || ('rapport_mensuel_' + report.month)));
}
