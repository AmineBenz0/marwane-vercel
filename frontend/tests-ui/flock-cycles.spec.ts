import { test, expect, type Page } from '@playwright/test';

async function mockFlock(page: Page, started = true) {
  let cycle: any = started ? {
    id_cycle: 1, id_batiment: 7, nom_cycle: 'Bâtiment A · Cycle actuel',
    date_debut: '2026-06-01', age_depart_semaines: 0, age_semaines: 18,
    effectif_initial: 1000, effectif_actuel: 998, statut: 'actif',
    formule_suggeree: '25-1% Sem vita', souche: null, notes: null,
  } : null;
  let records: any[] = [];
  const writes: { path: string; body: any }[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ sub: '1', email: 'ui-test@example.com', role: 'admin' }));
    localStorage.setItem('access_token', `test.${payload}.test`);
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    let data: any = [];
    if (method === 'POST' || method === 'PUT') {
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (path === '/cycles-production') {
        cycle = { ...body, id_cycle: 1, age_semaines: body.age_depart_semaines, effectif_actuel: body.effectif_initial, statut: 'actif', formule_suggeree: body.age_depart_semaines >= 18 ? '25-1% Sem vita' : '17-1% Sem vita' };
        data = cycle;
      } else if (path.endsWith('/terminer')) {
        cycle = { ...cycle, statut: 'termine', date_fin_reelle: body.date_fin_reelle };
        data = cycle;
      } else if (path === '/productions/daily') {
        records = [{ ...body, id_production: 1, id_cycle: 1, type_oeuf: 'normal', nombre_oeufs: 0, nombre_cartons: 0, est_actif: true }];
        data = { records, versions: { 1: 'v1' } };
      } else if (path.endsWith('/rattacher')) data = { rattachees: 2 };
    } else if (path === '/cycles-production') data = cycle ? [cycle] : [];
    else if (path.startsWith('/cycles-production/context/')) data = { has_cycles: !!cycle, cycle };
    else if (path.endsWith('/insights')) data = {
      cycle, total_oeufs: 1200, total_aliment_kg: 80, jours_saisis: 2,
      semaines: [{ semaine: 19, age_semaines: 18, date_debut: '2026-10-01', date_fin: '2026-10-07',
        effectif_debut: 1000, effectif_fin: 998, mortalite: 2, oeufs: 1200, aliment_kg: 80,
        formules: ['25-1% Sem vita'], jours_aliment: 2, jours_saisis: 2, jours_attendus: 7, ponte_pct: 60, g_poule_jour: 40 }],
    };
    else if (path === '/batiments') data = [{ id_batiment: 7, nom: 'Bâtiment A', est_actif: true }];
    else if (path === '/productions') data = records;
    else if (path === '/productions/stock' || path === '/productions/stock/daily') data = {
      totals: { available_eggs: 120, buildings_count: 1, missing_buildings_count: records.length ? 0 : 1 },
      batiments: [{ id_batiment: 7, nom_batiment: 'Bâtiment A', est_actif: true, cycle,
        available_eggs: 120, produced_eggs: 0, sold_eggs: 0, lost_eggs: 0,
        mortalite: 0, consommation_aliment_kg: 0, categories: [], entries_count: records.length }],
      categories: [], movements: [],
    };
    else if (path === '/productions/formules') data = [
      { value: '17-1% Sem vita', label: '17-1% Sem vita' },
      { value: '25-1% Sem vita', label: '25-1% Sem vita' },
      { value: '26-35 Sem', label: '26-35 Sem' },
    ];
    else if (path === '/productions/calibre-thresholds') data = [];
    else if (path === '/alerts/summary') data = { unread_count: 0 };
    await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return { writes, errors };
}

for (const width of [390, 1200]) {
  test(`flock summary, weekly gaps and editable formula at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockFlock(page);
    await page.goto('/production/batiment/7?date=2026-10-05');
    await expect(page.getByRole('heading', { name: 'Cycle des volailles' })).toBeVisible();
    await expect(page.getByText('998 / 1 000')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Progression hebdomadaire des volailles' })).toBeVisible();
    await expect(page.getByText('2/7', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/flock-building-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Saisir la journée' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('combobox', { name: 'Formule' })).toHaveText('25-1% Sem vita');
    await dialog.getByRole('combobox', { name: 'Formule' }).click();
    await page.getByRole('option', { name: '26-35 Sem', exact: true }).click();
    await dialog.getByLabel('Aliment consommé (kg)').fill('12');
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const daily = state.writes.find((entry) => entry.path === '/productions/daily')!;
    expect(daily.body.formule).toBe('26-35 Sem');
    expect(daily.body.grammage).toBe(0);
    expect(daily.body.consommation_aliment_kg).toBe(12);
    expect(Object.values(daily.body.quantites).every((count) => count === 0)).toBe(true);
    expect(state.errors).toEqual([]);
  });
}

test('manual start, explicit history assignment and manual closure', async ({ page }) => {
  const state = await mockFlock(page, false);
  await page.goto('/production/batiment/7?date=2026-10-05');
  await page.getByRole('button', { name: 'Démarrer un cycle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre de poussins entrants').fill('1500');
  await dialog.getByLabel('Âge à l’arrivée (semaines)').fill('18');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[0].body.effectif_initial).toBe(1500);
  expect(state.writes[0].body.age_depart_semaines).toBe(18);
  await page.getByRole('button', { name: 'Rattacher des saisies antérieures' }).click();
  await dialog.getByRole('button', { name: 'Rattacher', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.some((entry) => entry.path.endsWith('/rattacher'))).toBe(true);
  await page.getByRole('button', { name: 'Actions du cycle' }).click();
  await page.getByRole('menuitem', { name: 'Terminer le cycle actif' }).click();
  await dialog.getByRole('button', { name: 'Terminer le cycle', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Terminé', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Démarrer un cycle' })).toBeVisible();
  expect(state.writes.some((entry) => entry.path.endsWith('/terminer'))).toBe(true);
  expect(state.errors).toEqual([]);
});
