import { test, expect, type Page } from '@playwright/test';
import { mockAuthenticatedSession } from './auth';

async function mockFlock(page: Page, started = true) {
  const buildings = [{ id_batiment: 7, nom: 'Bâtiment A', est_actif: true }, { id_batiment: 8, nom: 'Bâtiment B', est_actif: true }];
  let lots: any[] = started ? buildings.map((building, index) => ({
    id_lot: index + 1, nom_lot: 'Lot ' + (index ? 'B' : 'A'), date_debut: '2026-10-01',
    age_depart_semaines: index ? 24 : 18, age_semaines: index ? 27 : 21,
    effectif_initial: index ? 200 : 100, effectif_actuel: index ? 199 : 98,
    mortalite_totale: index ? 1 : 2, statut: 'actif', formule_suggeree: '25-1% Sem vita',
    repartitions: [{ id_cycle: index + 1, id_lot: index + 1, id_batiment: building.id_batiment, nom_batiment: building.nom,
      nom_cycle: 'Lot ' + (index ? 'B' : 'A'), date_debut: '2026-10-01', age_depart_semaines: index ? 24 : 18,
      age_semaines: index ? 27 : 21, effectif_initial: index ? 200 : 100, effectif_actuel: index ? 199 : 98,
      statut: 'actif', formule_suggeree: '25-1% Sem vita' }],
  })) : [];
  let records: any[] = [];
  const writes: { path: string; body: any }[] = [], reads: URL[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockAuthenticatedSession(page);
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', ''), method = request.method();
    if (path === '/auth/refresh') return route.fallback();
    let data: any = [];
    const cycles = () => lots.flatMap(lot => lot.repartitions);
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      const body = request.postDataJSON(); writes.push({ path, body });
      if (path === '/lots-production' || (method === 'PUT' && /^\/lots-production\/\d+$/.test(path))) {
        const id = method === 'POST' ? Math.max(0, ...lots.map(lot => lot.id_lot)) + 1 : Number(path.split('/')[2]);
        const building = buildings.find(building => building.id_batiment === body.repartitions[0].id_batiment)!;
        const cycle = { ...body, id_cycle: id, id_lot: id, id_batiment: building.id_batiment, nom_batiment: building.nom,
          nom_cycle: body.nom_lot, statut: 'actif', effectif_actuel: body.effectif_initial, age_semaines: body.age_depart_semaines, formule_suggeree: '25-1% Sem vita' };
        const lot = { ...body, id_lot: id, statut: 'actif', effectif_actuel: body.effectif_initial, mortalite_totale: 0,
          age_semaines: body.age_depart_semaines, formule_suggeree: '25-1% Sem vita', repartitions: [cycle] };
        lots = [...lots.filter(lot => lot.id_lot !== id), lot]; data = lot;
      } else if (/^\/lots-production\/\d+\/terminer$/.test(path)) {
        const id = Number(path.split('/')[2]);
        lots = lots.map(lot => lot.id_lot === id ? { ...lot, statut: 'termine', ...body, repartitions: lot.repartitions.map((cycle: any) => ({ ...cycle, statut: 'termine', ...body })) } : lot);
        data = lots.find(lot => lot.id_lot === id);
      } else if (path === '/productions/daily' && method === 'DELETE') {
        records = []; data = { deleted: 1 };
      } else if (path === '/productions/daily') {
        records = [{ ...body, id_production: 1, id_cycle: 1, type_oeuf: 'normal', nombre_oeufs: 0, nombre_cartons: 0, est_actif: true }];
        data = { records, versions: { 1: 'v1' } };
      }
    } else if (path === '/lots-production') data = lots;
    else if (path === '/cycles-production') data = cycles().filter(cycle => cycle.id_batiment === Number(url.searchParams.get('id_batiment')));
    else if (path.startsWith('/cycles-production/context/')) { const cycle = cycles().find(cycle => cycle.id_batiment === Number(path.split('/').pop())); data = { has_cycles: !!cycle, cycle }; }
    else if (path.endsWith('/insights')) data = { cycle: cycles()[0], total_oeufs: 1200, total_aliment_kg: 80, jours_saisis: 2,
      semaines: [{ semaine: 1, age_semaines: 18, date_debut: '2026-10-01', date_fin: '2026-10-07', effectif_debut: 100, effectif_fin: 98,
        mortalite: 2, oeufs: 1200, aliment_kg: 80, formules: ['25-1% Sem vita'], jours_aliment: 2, jours_saisis: 2, jours_attendus: 7, ponte_pct: 60, g_poule_jour: 40 }] };
    else if (path === '/batiments') data = buildings;
    else if (path === '/productions/daily') data = { records, versions: { 1: 'v1' } };
    else if (path === '/productions') { reads.push(url); data = records.filter(row => (!url.searchParams.has('id_cycle') || row.id_cycle === Number(url.searchParams.get('id_cycle'))) && (!url.searchParams.has('id_batiment') || row.id_batiment === Number(url.searchParams.get('id_batiment')))); }
    else if (path === '/productions/stock' || path === '/productions/stock/daily') data = {
      totals: { available_eggs: 240, buildings_count: 2, missing_buildings_count: records.length ? 1 : 2 },
      batiments: buildings.map(building => ({ id_batiment: building.id_batiment, nom_batiment: building.nom, est_actif: true,
        cycle: cycles().find(cycle => cycle.id_batiment === building.id_batiment), available_eggs: 120, produced_eggs: 0, sold_eggs: 0,
        lost_eggs: 0, mortalite: 0, consommation_aliment_kg: 0, categories: [], entries_count: records.filter(row => row.id_batiment === building.id_batiment).length })), categories: [], movements: [],
    };
    else if (path === '/productions/formules') data = ['17-1% Sem vita', '25-1% Sem vita', '26-35 Sem'].map(value => ({ value, label: value }));
    else if (path === '/alerts/summary') data = { unread_count: 0 };
    await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return { writes, reads, errors, lots: () => lots };
}

for (const width of [390, 1200]) {
  test(`building production, daily entry and formula at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockFlock(page);
    await page.goto('/production/batiment/7?date=2026-10-05');
    await expect(page.getByRole('region', { name: 'Production du bâtiment' }).getByText('Lot A', { exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Progression hebdomadaire des volailles' })).toBeVisible();
    await page.getByRole('button', { name: 'Détails de la semaine 1', exact: true }).click();
    await expect(page.getByText('Formule utilisée', { exact: true })).toBeVisible();
    await expect(page.getByText('Aliment (g / volaille / jour)', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Saisir la journée', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Formule' }).click();
    await page.getByRole('option', { name: '26-35 Sem', exact: true }).click();
    await dialog.getByLabel('Aliment consommé (kg)').fill('12');
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const daily = state.writes.find(entry => entry.path === '/productions/daily')!;
    expect(daily.body.formule).toBe('26-35 Sem'); expect(daily.body.consommation_aliment_kg).toBe(12);
    expect(Object.values(daily.body.quantites).every(count => count === 0)).toBe(true);
    await expect(page.getByRole('button', { name: 'Modifier la saisie', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(state.errors).toEqual([]);
  });

  test(`independent creation, editing and termination at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockFlock(page, false);
    await page.goto('/production/lots');
    for (const [name, count] of [['Lot A', '100'], ['Lot B', '200']]) {
      await page.getByRole('button', { name: 'Démarrer un lot', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(/^Nom du lot/).fill(name);
      await dialog.getByLabel(/^Date de mise en place/).fill('01/10/26');
      await dialog.getByLabel(/^Effectif de départ/).fill(count);
      await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Vue d’ensemble', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.getByRole('button', { name: 'Retour aux lots', exact: true }).click();
    }
    expect(state.writes[0].body.repartitions).toEqual([{ id_batiment: 7, effectif_initial: 100 }]);
    expect(state.writes[0].body.date_debut).toBe('2026-10-01');
    expect(state.writes[1].body.repartitions).toEqual([{ id_batiment: 8, effectif_initial: 200 }]);
    await expect(page.getByRole('button', { name: 'Démarrer un lot', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Ouvrir le lot Lot A', exact: true }).click();
    await page.getByRole('button', { name: 'Modifier le lot', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('combobox', { name: /^Bâtiment/ })).toHaveAttribute('aria-disabled', 'true');
    await dialog.getByLabel(/^Effectif de départ/).fill('90');
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.lots().find(lot => lot.id_lot === 2).effectif_initial).toBe(200);
    await page.getByRole('button', { name: 'Terminer le lot', exact: true }).click();
    await dialog.getByRole('button', { name: 'Terminer le lot', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Volailles à la fin', { exact: true })).toBeVisible();
    expect(state.lots().find(lot => lot.id_lot === 2).statut).toBe('actif');
    await expect(page.getByRole('button', { name: 'Modifier le lot', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour aux lots', exact: true }).click();
    await page.getByRole('tab', { name: /En cours/ }).click();
    await expect(page.getByRole('button', { name: 'Ouvrir le lot Lot B', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ouvrir le lot Lot A', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(state.errors).toEqual([]);
  });
}

test('new arrivals reject nonpositive flock sizes and use the free building', async ({ page }) => {
  const state = await mockFlock(page, false);
  await page.goto('/production/lots');
  await page.getByRole('button', { name: 'Démarrer un lot', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const value of ['0', '-1']) {
    await dialog.getByLabel(/^Effectif de départ/).fill(value);
    await expect(dialog.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  }
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test('lot detail tabs request the selected cycle and preserve the lot header', async ({ page }) => {
  const state = await mockFlock(page);
  await page.goto('/production/lots');
  await page.getByRole('button', { name: 'Ouvrir le lot Lot A', exact: true }).click();
  await page.getByRole('tab', { name: 'Production', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Saisies quotidiennes du lot' })).toBeVisible();
  await page.getByRole('button', { name: 'Toute la période', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exporter', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Vaccins et dépenses', exact: true }).click();
  await expect(page.getByText('Aucune dépense de vaccin enregistrée pour ce lot.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Lot A', exact: true })).toBeVisible();
  expect(state.reads.some(url => url.searchParams.get('id_cycle') === '1')).toBe(true);
  expect(state.reads.some(url => url.searchParams.get('id_cycle') === '2')).toBe(false);
  expect(state.errors).toEqual([]);
});
