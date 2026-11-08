import { expect, test } from '@playwright/test';
import { mockAuthenticatedSession } from './auth';

test.use({ timezoneId: 'UTC' });

for (const [width, columns] of [[390, 1], [768, 2], [1200, 3], [1440, 4]]) {
  test(`task grid with ${columns} columns and card actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const now = new Date();
    await page.clock.setFixedTime(now);
    const today = now.toISOString().slice(0, 10);
    const tasks = [
      { id_tache: 1, titre: 'Vérifier la collecte', statut: 'en_cours' },
      { id_tache: 2, titre: 'Relever la température', statut: 'en_attente' },
      { id_tache: 3, titre: 'Confirmer la livraison', statut: 'annule' },
      { id_tache: 4, titre: 'Vérifier les relevés des bâtiments après la collecte du matin', statut: 'en_attente' },
      { id_tache: 5, titre: 'Contrôler le stock de cartons', statut: 'en_cours' },
      { id_tache: 6, titre: 'Compter les plateaux', statut: 'en_attente' },
    ].map(task => ({
      ...task, description: 'Vérifier le bâtiment A.', priorite: task.id_tache === 2 ? 'basse' : 'haute', categorie: 'travail',
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
    await count("Aujourd'hui", 5).click();
    const first = card('Vérifier la collecte');
    const second = card('Relever la température');
    const finish = first.getByRole('button', { name: /^Terminer/ });
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    await expect(finish).toHaveText('Terminer');
    await expect(first.getByText('Aujourd’hui à 09:00')).toBeVisible();
    await expect(first.getByText('Prioritaire', { exact: true })).toBeVisible();
    await expect(second.getByText('Basse', { exact: true })).toHaveCount(0);
    await expect(second.getByText('En attente', { exact: true })).toHaveCount(0);
    await expect(first.getByText('Vérifier le bâtiment A.')).toHaveCount(0);
    const dialog = page.getByRole('dialog');
    await first.getByRole('button', { name: 'Vérifier la collecte', exact: true }).click();
    await expect(dialog.getByText('Vérifier le bâtiment A.')).toBeVisible();
    await expect(dialog.getByText('travail', { exact: true })).toBeVisible();
    await expect(dialog.getByText('En cours', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Fermer' }).click();
    await expect(dialog).toBeHidden();
    const firstRowSize = await page.getByRole('main').getByRole('article').evaluateAll(cards => {
      const firstTop = cards[0].getBoundingClientRect().top;
      return cards.filter(item => Math.abs(item.getBoundingClientRect().top - firstTop) < 1).length;
    });
    expect(firstRowSize).toBe(columns);
    if (width === 1200) {
      await finish.click();
      await expect(page.getByText('Impossible de terminer la tâche', { exact: true })).toBeVisible();
      await expect(count("Aujourd'hui", 5)).toBeVisible();
      expect(writes).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(first.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
    await finish.click();
    await expect(first).toHaveCount(0);
    await expect(count("Aujourd'hui", 4)).toBeVisible();
    await count('Clôturées', 2).click();
    await expect(first.getByText('Terminée', { exact: true })).toBeVisible();
    await expect(card('Confirmer la livraison').getByText('Annulée', { exact: true })).toBeVisible();
    await expect(finish).toHaveCount(0);
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await count("Aujourd'hui", 5).click();
    await expect(finish).toBeVisible();
    expect(writes).toEqual([
      { method: 'PUT', id: 1, status: 'complete' },
      { method: 'PUT', id: 1, status: 'en_cours' },
    ]);

    await first.getByRole('button', { name: /Actions/ }).click();
    await page.getByRole('menuitem', { name: 'Modifier' }).click();
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
    await expect(count("Aujourd'hui", 4)).toBeVisible();
    expect(writes.filter(write => write.method === 'DELETE')).toEqual([{ method: 'DELETE', id: 2 }]);
  });
}
