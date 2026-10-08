import { test, expect, type Page } from '@playwright/test';

async function mockContacts(page: Page, plural: 'clients' | 'fournisseurs') {
  const singular = plural === 'clients' ? 'client' : 'fournisseur';
  const idKey = `id_${singular}`;
  const nameKey = `nom_${singular}`;
  const rows = ['Contact principal', 'NomSansEspaces'.repeat(20), 'Nom très long '.repeat(20), 'Avance', 'Sans solde', 'Autre contact'].map((name, i) => ({
    [idKey]: i + 1, [nameKey]: name, date_creation: '2026-10-08T12:00:00',
    date_modification: '2026-10-08T12:00:00', est_actif: true,
    ...(i === 4 ? {} : { outstanding_balance: ['125.50', '9999999999999.99', '0.00', '-42.50', null, '100'][i] }),
  }));
  const listRequests: URL[] = [];
  const profileRequests: string[] = [];
  const writes: { method: string; body: Record<string, unknown> }[] = [];
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ sub: '1', email: 'ui-test@example.com', role: 'admin' }));
    localStorage.setItem('access_token', `test.${payload}.test`);
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    let data: unknown = [];
    if (path === `/${plural}` && method === 'GET') {
      listRequests.push(url);
      const search = (url.searchParams.get('recherche') || '').toLowerCase();
      data = rows.filter((row) => String(row[nameKey]).toLowerCase().includes(search));
    } else if (path === `/${plural}` && method === 'POST') {
      const body = route.request().postDataJSON();
      writes.push({ method, body });
      const row = { ...rows[0], ...body, [idKey]: rows.length + 1, outstanding_balance: '0.00' };
      rows.push(row);
      data = row;
    } else if (path.match(new RegExp(`^/${plural}/[0-9]+$`)) && method === 'PUT') {
      const body = route.request().postDataJSON();
      writes.push({ method, body });
      const row = rows.find((item) => item[idKey] === Number(path.split('/')[2]));
      Object.assign(row!, body);
      data = row;
    } else if (path.startsWith(`/${plural}/`)) {
      profileRequests.push(path);
      const row = rows.find((item) => item[idKey] === Number(path.split('/')[2]));
      if (path.endsWith('/profile')) data = { [singular]: row, statistiques: { total_transactions: 0 }, transactions: [] };
      else if (path.endsWith('/stats-mensuelles')) data = { data: [] };
      else if (path.includes('/produits-')) data = { produits: [] };
      else data = null;
    } else if (path === '/alerts/summary') data = { unread_count: 0 };
    await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return { listRequests, profileRequests, writes, singular };
}

for (const plural of ['clients', 'fournisseurs'] as const) {
  for (const [width, columns] of [[390, 1], [768, 2], [1200, 3], [1800, 4]]) {
    test(`${plural}: ${columns} columns at ${width}px, wrapping and keyboard navigation`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await mockContacts(page, plural);
      await page.goto(`/${plural}`);
      const grid = page.getByTestId('contact-grid');
      await expect(grid.getByRole('link')).toHaveCount(6);
      expect(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(columns);
      expect(await grid.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await grid.getByRole('link').evaluateAll((cards) => cards.every((card) => {
        const title = card.querySelector('h2')!;
        const style = getComputedStyle(title);
        return card.scrollWidth <= card.clientWidth
          && title.getBoundingClientRect().height <= parseFloat(style.lineHeight) * 2 + 1;
      }))).toBe(true);
      await expect(grid.getByText('Indisponible')).toHaveCount(1);
      await expect(grid.getByText(plural === 'clients' ? 'Avance reçue' : 'Avance versée')).toBeVisible();
      await expect(grid.getByText('Créé le 08/10/26')).toHaveCount(6);
      expect(state.listRequests.every((url) => url.searchParams.get('include_balance') === 'true')).toBe(true);
      expect(state.profileRequests).toEqual([]);
      await expect(page.getByRole('button', { name: 'Profil', exact: true })).toHaveCount(0);

      // Tab reaches the native link and activates the visible focus indicator.
      const first = grid.getByRole('link', { name: 'Voir le profil de Contact principal', exact: true });
      for (let i = 0; i < 35 && !(await first.evaluate((el) => el === document.activeElement)); i++) {
        await page.keyboard.press('Tab');
      }
      await expect(first).toBeFocused();
      expect(await first.evaluate((el) => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle === 'solid')).toBe(true);
      await page.screenshot({ path: `test-results/contacts-${plural}-${width}.png`, fullPage: true });
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/${plural}/1/profile$`));
      await expect(page.getByRole('heading', { level: 1, name: 'Contact principal' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Éditer', exact: true })).toBeVisible();
    });
  }

  test(`${plural}: search, export, creation and profile editing remain usable`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1000 });
    const state = await mockContacts(page, plural);
    await page.goto(`/${plural}`);
    const grid = page.getByTestId('contact-grid');
    await expect(grid.getByRole('link')).toHaveCount(6);
    const search = page.getByPlaceholder(`Nom du ${state.singular}...`);
    await search.fill('principal');
    await expect(grid.getByRole('link')).toHaveCount(1);
    expect(state.listRequests.at(-1)!.searchParams.get('recherche')).toBe('principal');
    await search.fill('');
    await expect(grid.getByRole('link')).toHaveCount(6);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter Excel', exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.xlsx$/);
    await page.getByRole('button', { name: `Créer un ${state.singular}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('Nouveau contact');
    await dialog.getByRole('button', { name: `Créer le ${state.singular}`, exact: true }).click();
    await expect(grid.getByRole('link')).toHaveCount(7);
    expect(state.writes[0]).toEqual({ method: 'POST', body: { [`nom_${state.singular}`]: 'Nouveau contact', est_actif: true } });
    await grid.getByRole('link', { name: 'Voir le profil de Nouveau contact', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${plural}/7/profile$`));
    await page.getByRole('button', { name: 'Éditer', exact: true }).click();
    await dialog.getByRole('textbox').fill('Contact renommé');
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Contact renommé' })).toBeVisible();
    expect(state.writes.at(-1)!.method).toBe('PUT');
  });
}
