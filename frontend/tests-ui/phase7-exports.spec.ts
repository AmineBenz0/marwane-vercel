import { test, expect, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { mockAuthenticatedSession } from './auth';

// Deterministic, read-only browser coverage of the actual downloaded artifacts.
// These routes do not reach a live ledger, and writes are rejected.
const txData = [
  { id_transaction: 101, date_transaction: '2026-10-22', id_client: 1, id_fournisseur: null,
    id_produit: 1, quantite: 2, prix_unitaire: '50.00', montant_total: '100.00',
    est_actif: true, est_promesse: false, montant_paye: '0', montant_restant: '100.00', paiements: [] },
  { id_transaction: 102, date_transaction: '2026-10-22', id_client: 1, id_fournisseur: null,
    id_produit: 1, quantite: 1, prix_unitaire: '200.00', montant_total: '200.00',
    est_actif: false, est_promesse: false, montant_paye: '0', montant_restant: '0', paiements: [] },
  { id_transaction: 103, date_transaction: '2026-10-22', id_client: null, id_fournisseur: 2,
    id_produit: 1, quantite: 1, prix_unitaire: '25.50', montant_total: '25.50',
    est_actif: true, est_promesse: false, montant_paye: '0', montant_restant: '25.50', paiements: [] },
];

const report = {
  month: '2026-10', date_debut: '2026-10-01', date_fin: '2026-10-31',
  date_soldes_historiques: '2026-10-31', date_soldes_actuels: '2026-11-06',
  ventes: '100.00', achats: '25.50', charges: '35.00',
  caisse_entrees: '0.00', caisse_sorties: '0.00', banques_entrees: '0.00', banques_sorties: '0.00',
  creances: '100.00', dettes: '25.50', solde_caisse_historique: '0.00',
  creances_actuelles: '100.00', dettes_actuelles: '25.50', solde_caisse: '0.00',
  soldes_bancaires_historiques: [
    { id_compte: 1, nom_banque: '[STAGE DEMO] Banque CIH', solde: '5250.00' },
    { id_compte: 2, nom_banque: '[TEST PH5 01-11] Corrections', solde: '0.00' },
  ],
  soldes_bancaires: [
    { id_compte: 1, nom_banque: '[STAGE DEMO] Banque CIH', solde: '5250.00' },
    { id_compte: 2, nom_banque: '[TEST PH5 01-11] Corrections', solde: '0.00' },
  ],
  inventory_movements: 0, inventory_quantity_delta: '0',
};

async function mockFinancialApi(page: Page, transactions = txData, partnerName = 'Client Test') {
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
      const filtered = filterActive === null ? transactions : transactions.filter(tx => tx.est_actif === (filterActive === 'true'));
      result = filtered.slice(Number(u.searchParams.get('skip') || 0),
        Number(u.searchParams.get('skip') || 0) + Number(u.searchParams.get('limit') || 500));
    } else if (p === '/clients') result = [{ id_client: 1, nom_client: partnerName, est_actif: true }];
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

async function savePdfPreview(path: string, filename: string) {
  if (!process.env.CI) return;
  await mkdir('test-results/phase7-previews', { recursive: true });
  await copyFile(path, 'test-results/phase7-previews/' + filename);
}

async function assertPdf(page: Page, click: () => Promise<void>, filename: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const file = await download.path();
  expect(file).toBeTruthy();
  expect((await readFile(file!)).subarray(0, 5).toString()).toBe('%PDF-');
  await savePdfPreview(file!, filename);
}

const amount = (value: unknown) =>
  Number(String(value ?? '0').replace(/[^\d,.-]/g, '').replace(',', '.'));

test('phase7 transaction register XLSX includes canceled rows but total excludes them, PDF is valid', async ({ page }) => {
  const writes = await mockFinancialApi(page);
  await page.goto('/transactions');
  const excel = page.getByRole('button', { name: 'Exporter en Excel' });
  await expect(excel).toBeEnabled();
  const sheet = await exportSheet(page, () => excel.click());
  const headings = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => headings.set(String(cell.value), col));
  const idCol = headings.get('ID');
  const statusCol = headings.get('État');
  const totalCol = headings.get('Montant total');
  expect(idCol).toBeTruthy();
  expect(statusCol).toBeTruthy();
  expect(totalCol).toBeTruthy();
  const byId = new Map<number, { state: string; money: number }>();
  let total: number | undefined;
  for (let i = 2; i <= sheet.rowCount; i += 1) {
    const row = sheet.getRow(i);
    const id = Number(row.getCell(idCol!).value);
    if ([101, 102, 103].includes(id)) {
      byId.set(id, { state: String(row.getCell(statusCol!).value), money: amount(row.getCell(totalCol!).value) });
    }
    if (Array.isArray(row.values) && row.values.some(v => String(v ?? '').startsWith('Total :'))) {
      total = amount(row.getCell(totalCol!).value);
    }
  }
  expect(byId).toEqual(new Map([
    [101, { state: 'Active', money: 100 }],
    [102, { state: 'Annulée', money: 200 }],
    [103, { state: 'Active', money: 25.5 }],
  ]));
  expect(total).toBe(125.5);
  await assertPdf(page, () => page.getByRole('button', { name: 'Exporter en PDF' }).click(), 'transactions-courtes.pdf');
  expect(writes).toEqual([]);
});

test('phase7 monthly summary XLSX matches visible figures and PDF is valid', async ({ page }) => {
  const writes = await mockFinancialApi(page);
  await page.goto('/rapports/mensuel');
  await page.locator('input[type="month"]').fill('2026-10');
  await expect(page.getByRole('button', { name: 'Excel', exact: true })).toBeEnabled();
  const sheet = await exportSheet(page, () => page.getByRole('button', { name: 'Excel', exact: true }).click());
  const items = new Map<string, number>();
  for (let i = 2; i <= sheet.rowCount; i += 1) {
    const label = String(sheet.getRow(i).getCell(1).value || '');
    if (label) items.set(label, amount(sheet.getRow(i).getCell(2).value));
  }
  expect(items.get('Ventes')).toBe(100);
  expect(items.get('Achats')).toBe(25.5);
  expect(items.get('Charges')).toBe(35);
  expect(items.get('À encaisser actuel au 06/11/26')).toBe(100);
  expect(items.get('À payer aux fournisseurs actuel au 06/11/26')).toBe(25.5);
  await assertPdf(page, () => page.getByRole('button', { name: 'PDF', exact: true }).click(), 'rapport-mensuel.pdf');
  expect(writes).toEqual([]);
});


test('phase7 wide transaction PDF remains paginated and keeps deferred and payment details', async ({ page }) => {
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
    quantite_completee: index === 0 ? 10 : 0,
    quantite_reservee: index === 0 ? 5 : 0,
    quantite_en_attente: index === 0 ? 10 : 0,
    quantite_annulee: 0,
    date_livraison_prevue: index === 0 ? '2026-11-15' : null,
    paiements: index === 0
      ? Array.from({ length: 14 }, (_, n) => ({
        type_paiement: 'cash', montant: 0,
        reference: 'AUDIT-LONG-REGLEMENT-' + n,
      }))
      : [],
  }));
  const writes = await mockFinancialApi(
    page,
    transactions,
    '[STAGE DEMO 2026-10-12] Marché Central Rabat avec une raison sociale assez longue',
  );
  await page.goto('/transactions');
  await expect(page.getByRole('button', { name: 'Exporter en PDF' })).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exporter en PDF' }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const buffer = await readFile(path!);
  await savePdfPreview(path!, 'transactions-30-lignes.pdf');
  const source = buffer.toString('latin1');
  const pageCount = (source.match(/\/Type \/Page\b/g) || []).length;
  expect(pageCount).toBeGreaterThanOrEqual(3);
  expect(pageCount).toBeLessThanOrEqual(7);
  expect(source).toContain('MARWANE');
  expect(source).toContain('Rapport des transactions');
  expect(source).toContain('TOTAL ACTIF');
  const register = [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map(match => match[1])
    .filter(stream => !stream.includes('ANNEXE'))
    .join('\n');
  expect((register.match(/\(Annulée\) Tj/g) || [])).toHaveLength(10);
  expect((register.match(/\(Active\) Tj/g) || [])).toHaveLength(20);
  for (let number = 1; number <= pageCount; number += 1) {
    expect(source).toContain(`${number} / ${pageCount}`);
  }
  expect(writes).toEqual([]);
});
