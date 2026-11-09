import { isSameDay, isValid, parseISO, startOfDay } from 'date-fns';

export const isTaskDone = task => task.statut === 'complete' || task.statut === 'annule';

export const getTaskDate = task => {
  if (!task?.date_debut) return null;
  try {
    const start = task.date_debut;
    const date = typeof start === 'string'
      ? parseISO(task.est_toute_la_journee ? start.slice(0, 10) : start)
      : new Date(start);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
};

const sortTasksByDate = tasks => [...tasks].sort((a, b) => {
  const dateA = getTaskDate(a);
  const dateB = getTaskDate(b);
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;
  return dateA - dateB;
});

export const groupTasks = (tasks, referenceDate = new Date()) => {
  const today = startOfDay(referenceDate);
  const sortedTasks = sortTasksByDate(tasks);
  const openTasks = sortedTasks.filter(task => !isTaskDone(task));
  const overdue = openTasks.filter(task => {
    const date = getTaskDate(task);
    return date && startOfDay(date) < today;
  });
  const todayTasks = openTasks.filter(task => {
    const date = getTaskDate(task);
    return date && isSameDay(date, today);
  });
  const upcoming = openTasks.filter(task => {
    const date = getTaskDate(task);
    return date && startOfDay(date) > today;
  });
  const unscheduled = openTasks.filter(task => !getTaskDate(task));
  const completed = sortedTasks.filter(isTaskDone);

  return {
    overdue,
    today: todayTasks,
    upcoming,
    unscheduled,
    completed,
    counts: {
      open: openTasks.length,
      closed: completed.length,
    },
  };
};
