const clean = (value) => String(value ?? '').replace(/[\u202f\u00a0]/g, ' ');
const isText = (column) => ['date', 'formule', 'autres'].includes(column.key);
const cellValue = (column, row) => {
  const value = column.value(row);
  if (value == null || value === '—' || value === '') return null;
  if (isText(column)) return clean(value);
  const numeric = Number(String(value).replace(/[\s\u202f\u00a0]/g, '').replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : clean(value);
};
const heading = (column) => clean(column.label + (column.unit ? ' (' + column.unit + ')' : ''));
const save = (buffer, name, type) => {
  const url = URL.createObjectURL(new Blob([buffer], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function exportOverview(format, rows, columns, context) {
  if (!rows.length) return;
  const title = 'Suivi global · ' + context.lot;
  const dates = rows.filter((row) => row.rowType !== 'summary').map((row) => row.date);
  const subtitle = context.building + (dates.length ? ' · ' + dates[0] + ' – ' + dates[dates.length - 1] : '') + (context.demo ? ' · Données fictives de démonstration' : '');
  const filename = 'suivi-global' + (context.demo ? '-exemple' : '') + '-' + new Date().toISOString().slice(0, 10);
  if (format === 'excel') {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Suivi global');
    sheet.addRow([title]);
    sheet.addRow([subtitle]);
    sheet.addRow(columns.map(heading));
    rows.forEach((row) => {
      const added = sheet.addRow(columns.map((column) => cellValue(column, row)));
      if (row.rowType === 'summary') {
        added.font = { bold: true };
        added.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EDFB' } }; });
      }
      added.eachCell((cell, index) => {
        cell.alignment = { vertical: 'top', wrapText: true, horizontal: isText(columns[index - 1]) ? 'left' : 'right' };
        if (typeof cell.value === 'number') cell.numFmt = '#,##0.###';
      });
    });
    columns.forEach((column, index) => { sheet.getColumn(index + 1).width = isText(column) ? 32 : 22; });
    sheet.getRow(1).font = { bold: true, size: 16 };
    sheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(3).alignment = { wrapText: true, vertical: 'middle' };
    sheet.getRow(3).height = 36;
    sheet.getRow(3).eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF283958' } }; });
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };
    await save(await workbook.xlsx.writeBuffer(), filename + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return;
  }
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // Small column blocks preserve legibility even with all indicators selected.
  const blocks = [];
  for (let i = 1; i < columns.length; i += 6) blocks.push([columns[0], ...columns.slice(i, i + 6)]);
  blocks.forEach((block, blockIndex) => {
    if (blockIndex) doc.addPage();
    autoTable(doc, {
      head: [block.map(heading)],
      body: rows.map((row) => block.map((column) => clean(column.value(row) ?? '—'))),
      startY: 35, margin: { top: 35, bottom: 16, left: 12, right: 12 },
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [40, 57, 88], fontSize: 8 },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: Object.fromEntries(block.map((column, index) => [index, { halign: isText(column) ? 'left' : 'right', cellWidth: index === 0 ? 40 : 'auto' }])),
      rowPageBreak: 'avoid',
      didParseCell: (data) => {
        if (data.section === 'body' && rows[data.row.index].rowType === 'summary') {
          data.cell.styles.fillColor = [230, 237, 251];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: () => {
        doc.setFontSize(13);
        doc.text(clean(title), 12, 13);
        doc.setFontSize(8);
        doc.text(doc.splitTextToSize(clean(subtitle), 270), 12, 20);
        doc.text('Indicateurs ' + (blockIndex + 1) + ' / ' + blocks.length, 285, 13, { align: 'right' });
      },
    });
  });
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text('Page ' + page + ' / ' + total, 285, 202, { align: 'right' });
  }
  doc.save(filename + '.pdf');
}
