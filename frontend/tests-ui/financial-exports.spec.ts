import { test, expect, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { mockAuthenticatedSession } from './auth';

// Deterministic, read-only browser coverage of the actual downloaded artifacts.
// These routes do not reach a live ledger, and writes are rejected.
const txData = [
  { id_transaction: 101, date_transaction: '2026-10-22', id_client: 1, id_fournisseur: null,
    id_produit: 1, quantite: 20, prix_unitaire: '5.00', montant_total: '100.00',
    est_actif: true, est_promesse: true, montant_paye: '1.71', montant_restant: '98.29',
    quantite_couverte: 10, quantite_reservee: 5, quantite_en_attente: 10,
    date_livraison_prevue: '2026-11-15',
    paiements: ['0.01', '0.10', '1.60'].map(montant => ({
      date_paiement: '2026-10-23', type_paiement: 'cash', statut: 'valide', montant,
    })) },
  { id_transaction: 102, date_transaction: '2026-10-22', id_client: 3, id_fournisseur: null,
    id_produit: 1, quantite: 1, prix_unitaire: '200.00', montant_total: '200.00',
    est_actif: false, est_promesse: false, montant_paye: '0', montant_restant: '0', paiements: [] },
  { id_transaction: 103, date_transaction: '2026-10-22', id_client: null, id_fournisseur: 2,
    id_produit: 1, quantite: 1, prix_unitaire: '25.50', montant_total: '25.50',
    est_actif: true, est_promesse: false, montant_paye: '0', montant_restant: '25.50', paiements: [] },
];

const monthlyReport = {
  month: '2026-11', date_debut: '2026-11-01', date_fin: '2026-11-30',
  date_soldes_historiques: '2026-11-30', date_soldes_actuels: '2026-11-08',
  ventes: '100.00', achats: '25.50', charges: '35.00',
  caisse_entrees: '95.00', caisse_sorties: '0.00', banques_entrees: '50.00', banques_sorties: '40.00',
  creances: '55.00', dettes: '25.50', solde_caisse_historique: '195.00',
  creances_actuelles: '75.00', dettes_actuelles: '25.50', solde_caisse: '175.00',
  soldes_bancaires_historiques: [{ id_compte: 1, nom_banque: 'Banque Test', solde: '510.00' }],
  soldes_bancaires: [{ id_compte: 1, nom_banque: 'Banque Test', solde: '460.00' }],
  inventory_movements: 3, inventory_quantity_delta: '7.125',
};

async function mockFinancialApi(page: Page, transactions = txData, partnerName = 'Client Test', report: typeof monthlyReport & { ventes_nettes?: string; avoirs_commerciaux?: string } = monthlyReport) {
  await mockAuthenticatedSession(page);
  const attemptedWrites: string[] = [];
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const u = new URL(request.url());
    if (u.pathname === '/api/v1/auth/refresh') return route.fallback();
    const p = u.pathname.replace('/api/v1', '');
    if (request.method() !== 'GET') {
      attemptedWrites.push(p);
      return route.fulfill({ status: 405, contentType: 'application/json', body: '{"detail":"read-only test"}' });
    }
    let result: unknown = [];
    if (p === '/transactions') {
      const filterActive = u.searchParams.get('est_actif');
      const filterDeferred = u.searchParams.get('est_promesse');
      const filtered = transactions.filter(tx =>
        (filterActive === null || tx.est_actif === (filterActive === 'true')) &&
        (filterDeferred === null || tx.est_promesse === (filterDeferred === 'true')));
      result = filtered.slice(Number(u.searchParams.get('skip') || 0),
        Number(u.searchParams.get('skip') || 0) + Number(u.searchParams.get('limit') || 500));
    } else if (p === '/clients') result = [{ id_client: 1, nom_client: partnerName, est_actif: true }];
    else if (p === '/clients/3') result = { id_client: 3, nom_client: 'Client historique', est_actif: false };
    else if (p === '/fournisseurs') result = [{ id_fournisseur: 2, nom_fournisseur: 'Fournisseur Test', est_actif: true }];
    else if (p === '/produits') result = [{ id_produit: 1, nom_produit: 'Service Test', est_actif: true }];
    else if (p === '/batiments') result = [];
    else if (p === '/reports/monthly') result = report;
    else if (p === '/alerts/summary') result = { unread_count: 0 };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  return attemptedWrites;
}

async function exportSheet(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const file = await download.path();
  expect(file).toBeTruthy();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file!);
  expect(workbook.worksheets).toHaveLength(1);
  return workbook.worksheets[0];
}

async function readPdf(page: Page, buttonName = 'Export PDF') {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName, exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const file = await download.path();
  expect(file).toBeTruthy();
  const buffer = await readFile(file!);
  expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  return buffer.toString('latin1');
}

const amount = (value: unknown) =>
  Number(String(value ?? '0').replace(/[^\d,.-]/g, '').replace(',', '.'));

test('dashboard uses issue-month sales and register displays current net sale values', async ({ page }) => {
  const adjusted = [{ ...txData[0], montant_avoir: '40.00', montant_net: '60.00' }];
  const writes = await mockFinancialApi(page, adjusted, 'Client Test', {
    ...monthlyReport, ventes_nettes: '45.00', avoirs_commerciaux: '55.00',
  });
  await page.goto('/dashboard');
  const salesCard = page.getByText('Ventes nettes du mois, avoirs à leur date d’émission').locator('..');
  await expect(salesCard).toContainText('45');
  await page.goto('/transactions');
  const sales = page.getByRole('group', { name: 'Ventes', exact: true }).locator('p');
  await expect(sales).toContainText('60');
  await expect(page.getByRole('columnheader', { name: 'Total net' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Client Test' }).first();
  await expect(row).toContainText('60');
  await expect(page.getByText(/Entrées 60\sMAD \| Sorties 0\sMAD/)).toBeVisible();
  expect(writes).toEqual([]);
});

test('monthly downloads agree on dated balances, projection labels and fractional stock', async ({ page }) => {
  const writes = await mockFinancialApi(page);
  await page.goto('/rapports/mensuel');
  await page.getByLabel('Mois du rapport').fill('2026-11');
  const excel = page.getByRole('button', { name: 'Excel', exact: true });
  await expect(excel).toBeEnabled();
  const sheet = await exportSheet(page, () => excel.click());
  const items = new Map<string, unknown>();
  sheet.eachRow(row => items.set(String(row.getCell(1).value), row.getCell(2).value));
  expect(sheet.getColumn(1).width).toBe(66);
  expect(sheet.getColumn(2).width).toBe(24);
  expect(amount(items.get('Solde caisse (projection au 30/11/26)'))).toBe(195);
  expect(amount(items.get('Solde caisse actuel au 08/11/26'))).toBe(175);
  expect(amount(items.get('Solde Banque Test (projection au 30/11/26)'))).toBe(510);
  expect(amount(items.get('Solde Banque Test actuel au 08/11/26'))).toBe(460);
  expect(amount(items.get('Variation nette stock'))).toBe(7.125);
  const valueCell = (label: string) => {
    let cell: ExcelJS.Cell | undefined;
    sheet.eachRow(row => { if (row.getCell(1).value === label) cell = row.getCell(2); });
    if (!cell) throw new Error(`Missing report row: ${label}`);
    return cell;
  };
  expect(valueCell('Solde caisse actuel au 08/11/26').value).toBe(175);
  expect(valueCell('Solde caisse actuel au 08/11/26').numFmt).toContain('MAD');
  expect(valueCell('Variation nette stock').value).toBe(7.125);
  const source = await readPdf(page, 'PDF');
  for (const label of ['Rapport mensuel', 'PROJECTION AU 30/11/26', 'ACTUEL AU 08/11/26', '195,00 MAD',
    '175,00 MAD', '510,00 MAD', '460,00 MAD', '7,125']) expect(source).toContain(label);
  expect(writes).toEqual([]);
});

test('quick filters share register rows and financial totals with Excel and PDF', async ({ page }) => {
  const transactions = [
    { ...txData[0], statut_paiement: 'partiel' },
    { ...txData[1], statut_paiement: 'impaye' },
    { ...txData[2], statut_paiement: 'paye', montant_paye: '25.50', montant_restant: '0' },
  ];
  const writes = await mockFinancialApi(page, transactions);
  await page.goto('/transactions');
  const excel = page.getByRole('button', { name: 'Export Excel', exact: true });
  const metric = (label: string) => page.getByRole('group', { name: label, exact: true }).locator('p');
  const table = page.getByRole('table');
  const allPartners = ['Client Test', 'Client historique', 'Fournisseur Test'];

  for (const { filter, partners, sales, purchases, unpaid } of [
    { filter: 'Ventes', partners: ['Client Test', 'Client historique'], sales: 100, purchases: 0, unpaid: 1 },
    { filter: 'Achats', partners: ['Fournisseur Test'], sales: 0, purchases: 25.5, unpaid: 0 },
    { filter: 'Non payées', partners: ['Client Test'], sales: 100, purchases: 0, unpaid: 1 },
    { filter: 'Livraisons différées', partners: ['Client Test'], sales: 100, purchases: 0, unpaid: 1 },
  ]) {
    const button = page.getByRole('button', { name: `${filter} (${partners.length})`, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(metric('Toutes les opérations')).toHaveText(String(partners.length));
    await expect(metric('À suivre')).toHaveText(String(unpaid));
    expect(amount(await metric('Ventes').textContent())).toBe(sales);
    expect(amount(await metric('Achats').textContent())).toBe(purchases);
    await expect(table.getByText('Service Test', { exact: true })).toHaveCount(partners.length);
    for (const partner of allPartners) {
      // The register has an inactive label fallback until the export resolves its name.
      const label = partner === 'Client historique' ? 'Client #3' : partner;
      await expect(table.getByText(label, { exact: true })).toHaveCount(partners.includes(partner) ? 1 : 0);
    }

    const sheet = await exportSheet(page, () => excel.click());
    const exportedPartners: string[] = [];
    let excelTotal: number | undefined;
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      if (row.getCell(1).value) exportedPartners.push(String(row.getCell(2).value));
      if (row.getCell(5).value === 'Total :') excelTotal = amount(row.getCell(6).value);
    });
    expect(exportedPartners).toEqual(partners);
    expect(excelTotal).toBe(sales + purchases);

    const pdf = await readPdf(page);
    for (const partner of allPartners) {
      expect(pdf.includes(partner)).toBe(partners.includes(partner));
    }
    const pdfTotal = pdf.split('TOTAL ACTIF')[1]?.match(/\(([-\d][\d ,.]+)\) Tj/)?.[1];
    expect(pdfTotal).toBeDefined();
    expect(amount(pdfTotal)).toBe(sales + purchases);
  }

  await page.getByRole('button', { name: 'Réservation complète', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Livraisons différées (0)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(metric('Toutes les opérations')).toHaveText('0');
  await expect(excel).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
});

test('transaction register preserves exact settlements, legacy deferred quantities and active-only totals', async ({ page }) => {
  const writes = await mockFinancialApi(page);
  await page.goto('/transactions');
  const excel = page.getByRole('button', { name: 'Export Excel', exact: true });
  await expect(excel).toBeEnabled();
  const sheet = await exportSheet(page, () => excel.click());
  const headings = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => headings.set(String(cell.value), col));
  const statusCol = headings.get('État');
  const totalCol = headings.get('Montant initial');
  const netCol = headings.get('Montant net');
  const labelCol = headings.get('Quantité');
  expect(headings.has('ID')).toBe(false);
  expect(headings.get('Date')).toBe(1);
  expect(statusCol).toBeTruthy();
  expect(totalCol).toBeTruthy();
  expect(netCol).toBeTruthy();
  expect(labelCol).toBeTruthy();
  const transactions: { date: string; state: string; money: number }[] = [];
  let total: number | undefined;
  for (let i = 2; i <= sheet.rowCount; i += 1) {
    const row = sheet.getRow(i);
    const date = row.getCell(1).value;
    if (date) {
      transactions.push({ date: String(date), state: String(row.getCell(statusCol!).value), money: amount(row.getCell(totalCol!).value) });
    }
    if (row.getCell(labelCol!).value === 'Total :') {
      total = amount(row.getCell(netCol!).value);
      expect(amount(row.getCell(totalCol!).value)).toBe(125.5);
    }
  }
  expect(transactions).toHaveLength(3);
  expect(transactions).toEqual(expect.arrayContaining([
    { date: '22/10/26', state: 'Active', money: 100 },
    { date: '22/10/26', state: 'Annulée', money: 200 },
    { date: '22/10/26', state: 'Active', money: 25.5 },
  ]));
  expect(total).toBe(125.5);
  const payment = headings.get('Règlement')!;
  const deferredRow = sheet.getRow(2);
  expect(deferredRow.getCell(payment).value).toMatch(/0,01.*0,10.*1,60/);
  expect(deferredRow.getCell(headings.get('Quantité couverte')!).value).toBe(10);
  expect(deferredRow.getCell(headings.get('Stock prêt à compléter')!).value).toBe(5);
  expect(deferredRow.getCell(headings.get('Reste à fournir')!).value).toBe(10);
  expect(deferredRow.getCell(headings.get('À produire')!).value).toBe(5);
  expect(deferredRow.getCell(headings.get('Livraison prévue')!).value).toBe('15/11/26');
  expect(sheet.getRow(3).getCell(headings.get('Client / Fournisseur')!).value).toBe('Client historique');
  const source = await readPdf(page);
  expect(source).toContain('Client historique');
  expect(source).toContain('Livraisons différées');
  expect(source).toContain('(COUVERT) Tj');
  expect(source).toContain('(10) Tj');
  expect(source).toContain('(5) Tj');
  expect(source).toContain('125,50');
  expect(source).not.toContain('Clôturé');
  expect(writes).toEqual([]);
});

test('wide transaction PDF remains paginated and keeps deferred and payment details', async ({ page }) => {
  test.setTimeout(120_000);
  // Reproduce the wide source register: many rows, a deferred sale, and a long
  // payment history. The PDF must not compress 19 columns into its first page.
  const transactions = Array.from({ length: 30 }, (_, index) => ({
    ...txData[0],
    id_transaction: 500 + index,
    date_transaction: '2026-10-22',
    // Canceled rows must retain their status at every possible page boundary.
    est_actif: index % 3 !== 1,
    est_promesse: index === 0,
    quantite: 20,
    montant_total: '100.00',
    quantite_couverte: index === 0 ? 10 : 0,
    quantite_reservee: index === 0 ? 5 : 0,
    quantite_en_attente: index === 0 ? 10 : 0,
    date_livraison_prevue: index === 0 ? '2026-11-15' : null,
    paiements: index === 0
      ? Array.from({ length: 14 }, (_, n) => ({
        date_paiement: '2026-10-23',
        type_paiement: n === 2 ? 'cheque' : 'virement', montant: (n + 0.01).toFixed(2),
        statut: n === 1 ? 'annule' : 'valide', statut_cheque: n === 2 ? 'a_encaisser' : null,
        reference_virement: n === 2 ? null : 'PAYMENT-REF-' + String(n).padStart(2, '0'),
        numero_cheque: n === 2 ? 'PAYMENT-REF-02' : null,
      }))
      : [],
  }));
  const writes = await mockFinancialApi(
    page,
    transactions,
    '[STAGE DEMO 2026-10-12] Marché Central Rabat avec une raison sociale assez longue',
  );
  await page.goto('/transactions');
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
  const source = await readPdf(page);
  const pageCount = (source.match(/\/Type \/Page\b/g) || []).length;
  expect(pageCount).toBeGreaterThanOrEqual(3);
  expect(pageCount).toBeLessThanOrEqual(7);
  expect(source).not.toContain('MARWANE');
  expect(source).toContain('Rapport des transactions');
  expect(source).toContain('TOTAL ACTIF');
  const register = [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map(match => match[1])
    .filter(stream => !stream.includes('ANNEXE'))
    .join('\n');
  expect((register.match(/\(Annulée\) Tj/g) || [])).toHaveLength(10);
  expect((register.match(/\(Active\) Tj/g) || [])).toHaveLength(20);
  const payments = [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map(match => match[1])
    .filter(stream => stream.includes('DATE RÈGL.'));
  expect(payments).toHaveLength(2);
  expect(payments.every(stream => stream.includes('PRODUIT') && stream.includes('RÉFÉRENCE'))).toBe(true);
  const paymentText = payments.join('\n');
  for (let n = 0; n < 14; n += 1) {
    expect(paymentText.split('PAYMENT-REF-' + String(n).padStart(2, '0'))).toHaveLength(2);
  }
  expect(paymentText).toContain('Paiement');
  expect(paymentText).toContain('(Annulé) Tj');
  expect(paymentText).toContain('(À encaisser) Tj');
  expect(paymentText).toContain('(0,01) Tj');
  expect(paymentText).toContain('(13,01) Tj');
  for (let number = 1; number <= pageCount; number += 1) {
    expect(source).toContain(`${number} / ${pageCount}`);
  }
  expect(writes).toEqual([]);
});
