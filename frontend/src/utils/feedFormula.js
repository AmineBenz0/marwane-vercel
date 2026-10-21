// Match the backend's dated carry-forward rule for an unsaved selection.
export function carriedFeedFormula(selection, cycle, formulas, date, buildingId) {
  const normal = formulas.find((item) => cycle.age_semaines >= item.age_min
    && (item.age_max == null || cycle.age_semaines <= item.age_max))?.value;
  const fallback = cycle.formule_suggeree || '';
  if (!selection || selection.cycleId !== cycle.id_cycle
    || String(selection.buildingId) !== String(buildingId) || date < selection.date) return fallback;
  if (!selection.value) return '';
  const range = formulas.find((item) => item.value === selection.value);
  if (!range || normal === undefined) return selection.value;
  const hasMatched = range.age_min <= cycle.age_semaines
    && (range.age_max == null || selection.age <= range.age_max);
  return hasMatched ? normal : selection.value;
}
