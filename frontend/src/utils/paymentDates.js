import { addMonths, format, parseISO } from 'date-fns';

/** Return the default payment date: two calendar months after the entry date. */
export const getDefaultPaymentDate = (entryDate) => {
  const date = entryDate ? parseISO(entryDate) : new Date();
  return format(addMonths(date, 2), 'yyyy-MM-dd');
};
