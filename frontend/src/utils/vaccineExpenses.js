// Decimal multiplication in integer cents, matching server ROUND_HALF_UP.
export function vaccineExpenseTotal(quantity, price) {
  const q = String(quantity ?? '');
  const p = String(price ?? '');
  if (!/^\d+(?:\.\d{1,3})?$/.test(q) || !/^\d+(?:\.\d{1,2})?$/.test(p)) return 0;
  const scaled = (value, digits) => {
    const [whole, decimals = ''] = value.split('.');
    return BigInt(whole + decimals.padEnd(digits, '0'));
  };
  return Number((scaled(q, 3) * scaled(p, 2) + 500n) / 1000n) / 100;
}

export const formatVaccineMoney = (value) => Number(value || 0).toLocaleString('fr-FR', {
  style: 'currency', currency: 'MAD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});