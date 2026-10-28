import { describe, expect, it } from 'vitest';
import { groupTasks } from './taskListModel';

const day = (id, date, status = 'en_attente') => ({ id_tache: id, date_debut: date, statut: status });

describe('task list grouping', () => {
  it('puts overdue tasks first, then today, upcoming, unscheduled and completed', () => {
    const tasks = [
      day(4, '2026-10-30T09:00:00Z'),
      day(2, '2026-10-27T09:00:00Z'),
      day(1, '2026-10-26T09:00:00Z'),
      day(3, null),
      day(5, '2026-10-25T09:00:00Z', 'complete'),
      day(6, 'not-a-date'),
    ];
    const result = groupTasks(tasks, new Date('2026-10-28T12:00:00Z'));

    expect(result.overdue.map(task => task.id_tache)).toEqual([1, 2]);
    expect(result.today).toEqual([]);
    expect(result.upcoming.map(task => task.id_tache)).toEqual([4]);
    expect(result.unscheduled.map(task => task.id_tache)).toEqual([3, 6]);
    expect(result.completed.map(task => task.id_tache)).toEqual([5]);
    expect(result.allInActionOrder.map(task => task.id_tache)).toEqual([1, 2, 4, 3, 6, 5]);
    expect(result.allInActionOrder).toHaveLength(tasks.length);
    expect(result.counts.toutes).toBe(tasks.length);
  });

  it('counts today tasks by calendar day and excludes completed tasks from action counts', () => {
    const tasks = [
      day(1, '2026-10-28T00:15:00Z'),
      day(2, '2026-10-28T23:45:00Z', 'complete'),
      { ...day(3, '2026-10-27T09:00:00Z'), priorite: 'haute' },
      { ...day(4, null), priorite: 'haute', statut: 'en_cours' },
    ];
    const result = groupTasks(tasks, new Date('2026-10-28T12:00:00Z'));
    expect(result.today.map(task => task.id_tache)).toEqual([1]);
    expect(result.counts).toMatchObject({ toutes: 4, aujourdhui: 1, en_attente: 2, urgentes: 2, terminees: 1 });
  });
});
