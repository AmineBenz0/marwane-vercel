import { format, isValid, parseISO } from 'date-fns';
import fr from 'date-fns/locale/fr';

const parseDateValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isValid(value) ? value : null;

  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseISO(value)
    : new Date(value);

  return isValid(parsed) ? parsed : null;
};

/** Format a date for user-facing display. API and form values should remain ISO. */
export const formatShortDate = (value, fallback = '-') => {
  const date = parseDateValue(value);
  return date ? format(date, 'dd/MM/yy') : fallback;
};

/** Format a date and time while keeping the project's dd/MM/yy date convention. */
export const formatShortDateTime = (value, fallback = '-') => {
  const date = parseDateValue(value);
  return date ? format(date, 'dd/MM/yy HH:mm') : fallback;
};

/** Format a month grouping label in the app's French locale. */
export const formatMonthYear = (value, fallback = '-') => {
  const monthMatch = typeof value === 'string' ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  const month = monthMatch ? Number(monthMatch[2]) : null;
  const date = monthMatch
    ? (month >= 1 && month <= 12 ? new Date(Number(monthMatch[1]), month - 1, 1) : null)
    : parseDateValue(value);
  return date ? format(date, 'MMM yyyy', { locale: fr }) : fallback;
};

/** Format the month heading used by calendar navigation. */
export const formatCalendarMonth = (value, fallback = '-') => {
  const date = parseDateValue(value);
  return date ? format(date, 'MMMM yyyy', { locale: fr }) : fallback;
};
