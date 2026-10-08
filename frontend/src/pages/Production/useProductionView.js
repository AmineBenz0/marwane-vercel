import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export const localToday = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

export function productionLink(buildingId, date) {
  const path = buildingId == null ? '/production' : '/production/batiment/' + buildingId;
  return path + '?' + new URLSearchParams({ date });
}

export default function useProductionView() {
  const [params, setParams] = useSearchParams();
  const [defaultDate] = useState(localToday);
  const selectedDate = validDate(params.get('date')) ? params.get('date') : defaultDate;
  return {
    selectedDate,
    setSelectedDate: (date) => {
      if (!validDate(date)) return;
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete('view');
        next.set('date', date);
        return next;
      });
    },
  };
}
