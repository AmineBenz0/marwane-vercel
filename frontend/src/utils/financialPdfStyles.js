import { format } from 'date-fns';
import { formatShortDate } from './dateFormatting';

export const PDF_COLORS = {
  navy: [23, 52, 71],
  darkNavy: [16, 44, 60],
  teal: [14, 139, 137],
  paleTeal: [228, 244, 241],
  ink: [32, 59, 77],
  muted: [102, 125, 137],
  pale: [245, 249, 249],
  paleBlue: [238, 244, 246],
  line: [221, 230, 232],
  white: [255, 255, 255],
  gold: [166, 119, 43],
};

export function pdfClean(value) {
  return String(value ?? '')
    .replace(/[\u00a0\u202f\u2009]/gi, ' ')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'Oe')
    .replace(/[–—]/g, '-').replace(/’/g, "'");
}

export function pdfDate(value) {
  if (!value) return '-';
  try {
    return pdfClean(formatShortDate(value, String(value)));
  } catch {
    return pdfClean(value);
  }
}

export function pdfMoney(value, withCurrency = true) {
  const numeric = Number(value ?? 0);
  const number = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
  return pdfClean(number) + (withCurrency ? ' MAD' : '');
}

export function pdfInteger(value) {
  const numeric = Number(value ?? 0);
  return pdfClean(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(
    Number.isFinite(numeric) ? numeric : 0
  ));
}

export function pdfExportName(prefix) {
  return prefix + '_' + format(new Date(), 'yyyy-MM-dd_HH-mm-ss') + '.pdf';
}

export function pdfBox(doc, x, y, w, h, fill, radius = 3) {
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, radius, radius, 'F');
}

export function pdfFit(doc, value, x, y, maxWidth, size = 10, minSize = 7, align = 'left') {
  const text = pdfClean(value);
  let nextSize = size;
  doc.setFontSize(nextSize);
  while (doc.getTextWidth(text) > maxWidth && nextSize > minSize) {
    nextSize = Math.max(minSize, nextSize - 0.5);
    doc.setFontSize(nextSize);
  }
  doc.text(text, x, y, { align });
}

export function pdfBrand(doc, category) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_COLORS.navy);
  doc.rect(0, 0, width, 16, 'F');
  doc.setFillColor(...PDF_COLORS.teal);
  doc.rect(0, 0, 2.2, 16, 'F');
  doc.setTextColor(...PDF_COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('MARWANE', 11.5, 10.4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(191, 220, 223);
  doc.text(pdfClean(category).toUpperCase(), 39.5, 10.3);
}

export function pdfFooters(doc, editionDate = new Date()) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.setLineWidth(0.25);
    doc.line(11.5, height - 15, width - 11.5, height - 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text('MARWANE  |  Exporte le ' + pdfDate(editionDate), 11.5, height - 9.2);
    doc.text(String(page) + ' / ' + String(count), width - 11.5, height - 9.2, {
      align: 'right',
    });
  }
}

export function pdfHeading(doc, title, subtitle, right = '') {
  const width = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text(pdfClean(title), 11.5, 28.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(pdfClean(subtitle), 11.5, 36.4, { maxWidth: width - 23 });
  if (right) {
    doc.setFontSize(8);
    doc.text(pdfClean(right), width - 11.5, 36.4, { align: 'right' });
  }
}
