const BUSINESS_TIME_ZONE = 'Africa/Casablanca';

const dateParts = (value = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).formatToParts(value).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});

export const getBusinessDateInput = (value = new Date()) => {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getBusinessMonthInput = (value = new Date()) => getBusinessDateInput(value).slice(0, 7);
