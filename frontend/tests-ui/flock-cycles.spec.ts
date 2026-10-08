import { test, expect, type Page } from '@playwright/test';

async function mockFlock(page: Page, started = true) {
  const buildings = [
    { id_batiment: 7, nom: 'Bâtiment A', est_actif: true },
    { id_batiment: 8, nom: 'Bâtiment B', est_actif: true },
  ];
  let allocations: any[] = started ? buildings.map((building, index) => ({
    id_cycle: index + 1, id_lot: 1, id_batiment: building.id_batiment, nom_batiment: building.nom,
    nom_cycle: 'Arrivée commune', date_debut: '2026-06-01', age_depart_semaines: 0, age_semaines: 18,
    effectif_initial: (index + 1) * 1000, effectif_actuel: index ? 1996 : 998,
    statut: 'actif', formule_suggeree: '25-1% Sem vita',
  })) : [];
  let records: any[] = [];
  const writes: { path: string; body: any }[] = [];
  const errors: string[] = [];
  const lot = () => allocations.length ? {
    id_lot: 1, nom_lot: allocations[0].nom_cycle, date_debut: allocations[0].date_debut,
    age_depart_semaines: allocations[0].age_depart_semaines, age_semaines: allocations[0].age_semaines,
    formule_suggeree: allocations[0].formule_suggeree, statut: allocations[0].statut,
    date_fin_reelle: allocations[0].date_fin_reelle,
    effectif_initial: allocations.reduce((sum, row) => sum + row.effectif_initial, 0),
    effectif_actuel: allocations.reduce((sum, row) => sum + row.effectif_actuel, 0),
    mortalite_totale: allocations.reduce((sum, row) => sum + row.effectif_initial - row.effectif_actuel, 0),
    repartitions: allocations,
  } : null;
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
      if (path === '/lots-production' || (method === 'PUT' && path === '/lots-production/1')) {
        allocations = body.repartitions.map((row: any, index: number) => ({
          ...row, id_cycle: index + 1, id_lot: 1, nom_cycle: body.nom_lot,
          nom_batiment: buildings.find((building) => building.id_batiment === row.id_batiment)!.nom,
          date_debut: body.date_debut, age_depart_semaines: body.age_depart_semaines,
          age_semaines: body.age_depart_semaines, effectif_actuel: row.effectif_initial,
          statut: 'actif', formule_suggeree: body.age_depart_semaines >= 18 ? '25-1% Sem vita' : '17-1% Sem vita',
        }));
        data = lot();
      } else if (path === '/lots-production/1/terminer') {
        allocations = allocations.map((row) => ({ ...row, statut: 'termine', date_fin_reelle: body.date_fin_reelle }));
        data = lot();
      } else if (path === '/productions/daily') {
        records = [{ ...body, id_production: 1, id_cycle: 1, type_oeuf: 'normal', nombre_oeufs: 0, nombre_cartons: 0, est_actif: true }];
        data = { records, versions: { 1: 'v1' } };
      } else if (path.endsWith('/rattacher')) data = { rattachees: 2 };
    } else if (path === '/lots-production') data = lot() ? [lot()] : [];
    else if (path === '/cycles-production') data = allocations.filter((row) => row.id_batiment === Number(url.searchParams.get('id_batiment')));
    else if (path.startsWith('/cycles-production/context/')) data = { has_cycles: !!lot(), cycle: allocations.find((row) => row.id_batiment === Number(path.split('/').pop())) };
    else if (path.endsWith('/insights')) data = {
      cycle: allocations[0], total_oeufs: 1200, total_aliment_kg: 80, jours_saisis: 2,
      semaines: [{ semaine: 19, age_semaines: 18, date_debut: '2026-10-01', date_fin: '2026-10-07',
        effectif_debut: 1000, effectif_fin: 998, mortalite: 2, oeufs: 1200, aliment_kg: 80,
        formules: ['25-1% Sem vita'], jours_aliment: 2, jours_saisis: 2, jours_attendus: 7, ponte_pct: 60, g_poule_jour: 40 }],
    };
    else if (path === '/batiments') data = buildings;
    else if (path === '/productions') data = records.filter((row) => row.id_batiment === Number(url.searchParams.get('id_batiment')));
    else if (path === '/productions/stock' || path === '/productions/stock/daily') data = {
      totals: { available_eggs: 240, buildings_count: 2, missing_buildings_count: records.length ? 1 : 2 },
      batiments: buildings.map((building) => ({
        id_batiment: building.id_batiment, nom_batiment: building.nom, est_actif: true,
        cycle: allocations.find((row) => row.id_batiment === building.id_batiment),
        available_eggs: 120, produced_eggs: 0, sold_eggs: 0, lost_eggs: 0,
        mortalite: 0, consommation_aliment_kg: 0, categories: [], entries_count: records.filter((row) => row.id_batiment === building.id_batiment).length,
      })),
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
  test(`building results, weekly gaps and editable formula at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockFlock(page);
    await page.goto('/production/batiment/7?date=2026-10-05');
    await expect(page.getByText('998 / 1 000')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Progression hebdomadaire des volailles' })).toBeVisible();
    await expect(page.getByText('2/7', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Démarrer un cycle' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Gérer les lots' })).toBeVisible();
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

  test(`shared arrival, balanced distribution and closure at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockFlock(page, false);
    await page.goto('/production?date=2026-10-05');
    await page.getByRole('button', { name: 'Démarrer un lot' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre total de poussins entrants').fill('300');
    await dialog.getByLabel('Âge à l’arrivée (semaines)').fill('18');
    await dialog.getByLabel('Poussins · Bâtiment A').fill('100');
    await expect(dialog.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
    await dialog.getByLabel('Poussins · Bâtiment B').fill('200');
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes[0].path).toBe('/lots-production');
    expect(state.writes[0].body.effectif_initial).toBe(300);
    expect(state.writes[0].body.repartitions).toEqual([
      { id_batiment: 7, effectif_initial: 100 }, { id_batiment: 8, effectif_initial: 200 },
    ]);
    const panel = page.getByRole('region', { name: 'Lots de volailles' });
    await expect(panel.getByText('300 / 300')).toBeVisible();
    await expect(panel.getByText('18 semaines')).toBeVisible();
    await expect(panel.getByText('100 restantes / 100 affectées · mortalité : 0')).toBeVisible();
    await expect(panel.getByText('200 restantes / 200 affectées · mortalité : 0')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/shared-lot-${width}.png`, fullPage: true });
    await panel.getByRole('button', { name: 'Terminer le lot' }).click();
    await dialog.getByRole('button', { name: 'Terminer le lot', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(panel.getByText('Terminé', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Démarrer un lot' })).toBeEnabled();
    await page.goto('/production/batiment/8?date=2026-10-05');
    await expect(page.getByText('Terminé', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Démarrer un cycle' })).toHaveCount(0);
    expect(state.writes.some((entry) => entry.path === '/lots-production/1/terminer')).toBe(true);
    expect(state.errors).toEqual([]);
  });
}

test('a building allocation cannot exceed the remaining chicks in the shared lot', async ({ page }) => {
  const state = await mockFlock(page, false);
  await page.goto('/production?date=2026-10-05');
  await page.getByRole('button', { name: 'Démarrer un lot' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre total de poussins entrants').fill('300');
  await dialog.getByLabel('Poussins · Bâtiment A').fill('299');
  await dialog.getByLabel('Poussins · Bâtiment B').fill('1');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Modifier le lot' }).click();
  const edit = page.getByRole('dialog');
  const buildingA = edit.getByLabel('Poussins · Bâtiment A');
  await expect(buildingA).toHaveAttribute('max', '299');
  await buildingA.fill('300');
  await expect(edit.getByText('Maximum 299 : le reste est déjà réparti dans les autres bâtiments.')).toBeVisible();
  await expect(edit.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  expect(state.writes.filter((entry) => entry.path === '/lots-production/1')).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test('history assignment remains scoped to the building allocation', async ({ page }) => {
  const state = await mockFlock(page);
  await page.goto('/production/batiment/7?date=2026-10-05');
  await page.getByRole('button', { name: 'Rattacher des saisies antérieures' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Rattacher', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[0].path).toBe('/cycles-production/1/rattacher');
  expect(state.errors).toEqual([]);
});
