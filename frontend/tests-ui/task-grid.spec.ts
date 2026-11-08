import { expect, test } from '@playwright/test';
import { mockAuthenticatedSession } from './auth';

test.use({ timezoneId: 'UTC' });

for (const width of [390, 1200]) {
  test(`task grid and card actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const now = new Date();
    await page.clock.setFixedTime(now);
    const today = now.toISOString().slice(0, 10);
    const tasks = [
      { id_tache: 1, titre: 'Vérifier la collecte', statut: 'en_cours' },
      { id_tache: 2, titre: 'Relever la température', statut: 'en_attente' },
      { id_tache: 3, titre: 'Confirmer la livraison', statut: 'annule' },
    ].map(task => ({
      ...task, description: 'Vérifier le bâtiment A.', priorite: 'haute', categorie: 'travail',
      date_debut: `${today}T09:00:00`, date_fin: `${today}T10:00:00`, est_toute_la_journee: false,
    }));
    const writes: { method: string; id: number; status?: string }[] = [];
    let rejectCompletion = width === 1200;
    await mockAuthenticatedSession(page);
    await page.route('**/api/v1/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (path === '/api/v1/auth/refresh') return route.fallback();
      if (path === '/api/v1/tasks') return route.fulfill({ json: tasks });
      const match = /^\/api\/v1\/tasks\/(\d+)$/.exec(path);
      if (!match) return route.fulfill({ json: path.endsWith('/alerts/summary') ? { unread_count: 0 } : [] });
      const id = Number(match[1]);
      const index = tasks.findIndex(task => task.id_tache === id);
      if (method === 'DELETE') {
        writes.push({ method, id });
        tasks.splice(index, 1);
        return route.fulfill({ status: 204 });
      }
      const update = request.postDataJSON();
      if (rejectCompletion && update.statut === 'complete') {
        rejectCompletion = false;
        return route.fulfill({ status: 500, json: { detail: 'Test de reprise' } });
      }
      writes.push({ method, id, status: update.statut });
      tasks[index] = { ...tasks[index], ...update };
      return route.fulfill({ json: tasks[index] });
    });

    await page.goto('/tasks');
    const card = (name: string) => page.getByRole('article', { name, exact: true });
    const count = (name: string, value: number) => page.getByRole('button', { name: new RegExp(`^${name}\\s*${value}$`) });
    await count("Aujourd'hui", 2).click();
    const first = card('Vérifier la collecte');
    const second = card('Relever la température');
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    const firstBox = (await first.boundingBox())!;
    const secondBox = (await second.boundingBox())!;
    if (width === 390) {
      expect(firstBox.x).toBeCloseTo(secondBox.x, 0);
      expect(secondBox.y).toBeGreaterThan(firstBox.y);
    } else {
      expect(firstBox.y).toBeCloseTo(secondBox.y, 0);
      expect(secondBox.x).toBeGreaterThan(firstBox.x + firstBox.width);
      await first.getByRole('button', { name: /Marquer comme terminée/ }).click();
      await expect(page.getByText('Impossible de terminer la tâche', { exact: true })).toBeVisible();
      await expect(count("Aujourd'hui", 2)).toBeVisible();
      expect(writes).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(first.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
    await first.getByRole('button', { name: /Marquer comme terminée/ }).click();
    await expect(first).toHaveCount(0);
    await expect(count("Aujourd'hui", 1)).toBeVisible();
    await count('Clôturées', 2).click();
    await expect(first.getByText('Terminée', { exact: true })).toBeVisible();
    await expect(card('Confirmer la livraison').getByText('Annulée', { exact: true })).toBeVisible();
    await expect(first.getByRole('button', { name: /Marquer comme terminée/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await count("Aujourd'hui", 2).click();
    await expect(first.getByText('En cours', { exact: true })).toBeVisible();
    expect(writes).toEqual([
      { method: 'PUT', id: 1, status: 'complete' },
      { method: 'PUT', id: 1, status: 'en_cours' },
    ]);

    await first.getByRole('button', { name: /Actions/ }).click();
    await page.getByRole('menuitem', { name: 'Modifier' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Modifier la tâche' })).toBeVisible();
    await dialog.getByLabel('Titre').fill('Vérifier la collecte du matin');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(card('Vérifier la collecte du matin')).toBeVisible();

    await second.getByRole('button', { name: /Actions/ }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(second).toBeVisible();
    expect(writes.filter(write => write.method === 'DELETE')).toEqual([]);
    await second.getByRole('button', { name: /Actions/ }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await dialog.getByRole('button', { name: 'Supprimer' }).click();
    await expect(second).toHaveCount(0);
    await expect(count("Aujourd'hui", 1)).toBeVisible();
    expect(writes.filter(write => write.method === 'DELETE')).toEqual([{ method: 'DELETE', id: 2 }]);
  });
}
